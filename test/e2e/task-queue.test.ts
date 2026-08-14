import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { postgresAssessmentPipelineArchive } from "../../src/lib/radar/assessment-pipeline-archive.ts";
import { postgresBriefPublicationArchive } from "../../src/lib/radar/brief-publication-archive.ts";
import { createReadyBriefPublisher } from "../../src/lib/radar/brief-publication.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";
import type { EvidenceDigest } from "../../src/lib/radar/evidence-enrichment.ts";
import { postgresCandidateTaskArchive } from "../../src/lib/radar/task-queue.ts";
import type { Candidate } from "../../src/lib/radar/connectors/types.ts";

const now = new Date("2026-08-13T01:00:00.000Z");
const baseUrl = process.env.RADAR_E2E_BASE_URL;
if (!baseUrl) throw new Error("RADAR_E2E_BASE_URL 未配置。请通过 pnpm test:e2e 运行。");

function candidate(id: string, rankingScore = 1): Candidate {
  return {
    canonicalIdentifier: id,
    collectedAt: now.toISOString(),
    connectorId: "github-trending",
    evidence: [{ canonicalIdentifier: id, collectedAt: now.toISOString(), connectorId: "github-trending", sourceName: "GitHub Trending", sourceTitle: id, sourceUrl: `https://github.com/${id.slice("github:".length)}`, trust: "untrusted" }],
    signalType: "project",
    subjectCanonicalIdentifier: id,
    title: id,
    url: `https://github.com/${id.slice("github:".length)}`,
    ...(rankingScore > 1 ? {} : {}),
  };
}

async function seed(candidateInput: Candidate, rankingScore = 1) {
  await postgresAssessmentPipelineArchive.upsertCandidate(candidateInput);
  for (const evidence of candidateInput.evidence) {
    await postgresAssessmentPipelineArchive.upsertSourceEvidence({ association: "primary", candidateId: candidateInput.canonicalIdentifier, evidence });
  }
  await getDatabasePool().query("UPDATE radar_candidates SET ranking_score = $2 WHERE id = $1", [candidateInput.canonicalIdentifier, rankingScore]);
}

async function attachDigest(candidateId: string): Promise<EvidenceDigest> {
  const digest: EvidenceDigest = {
    canonicalIdentifier: `primary:github-repository-description:https://github.com/${candidateId.slice("github:".length)}`,
    contentFingerprint: "a".repeat(64),
    excerpts: ["A coding agent that helps developers automate implementation and review tasks from a local terminal."],
    fetchedAt: now.toISOString(),
    sourceKind: "github-repository-description",
    sourceName: "GitHub repository description",
    sourceTitle: candidateId,
    sourceUrl: `https://github.com/${candidateId.slice("github:".length)}`,
  };
  const result = await getDatabasePool().query<{ id: number }>(
    `INSERT INTO evidence_digests (canonical_identifier, source_kind, source_name, source_title, source_url, fetched_at, content_fingerprint, excerpts)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [digest.canonicalIdentifier, digest.sourceKind, digest.sourceName, digest.sourceTitle, digest.sourceUrl, digest.fetchedAt, digest.contentFingerprint, JSON.stringify(digest.excerpts)],
  );
  await getDatabasePool().query("INSERT INTO candidate_evidence_digests (candidate_id, digest_id) VALUES ($1, $2)", [candidateId, result.rows[0]?.id]);
  return digest;
}

beforeEach(async () => {
  await getDatabasePool().query("TRUNCATE TABLE radar_signals, brief_snapshots, candidate_tasks, candidate_evidence_digests, evidence_digests, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects RESTART IDENTITY CASCADE");
});

after(async () => {
  await getDatabasePool().end();
});

test("真实 PostgreSQL 按优先级原子领取，并在 Worker 租约过期后恢复任务", { concurrency: false }, async () => {
  const low = candidate("github:openai/low");
  const high = candidate("github:openai/high");
  await seed(low, 1);
  await seed(high, 5);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: low, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: high, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });

  const first = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  const competing = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-b" });
  const recovered = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1_001), workerId: "worker-c" });

  assert.equal(first?.candidate.canonicalIdentifier, high.canonicalIdentifier);
  assert.equal(competing?.candidate.canonicalIdentifier, low.canonicalIdentifier);
  assert.equal(recovered?.candidate.canonicalIdentifier, high.canonicalIdentifier);
  assert.equal(recovered?.attemptCount, 2);
  const state = await getDatabasePool().query<{ lifecycle_status: string }>("SELECT lifecycle_status FROM radar_candidates WHERE id = $1", [high.canonicalIdentifier]);
  assert.deepEqual(state.rows, [{ lifecycle_status: "补证中" }]);
});

test("已补证的评估任务以 Primary Evidence 优先于低优先级补证任务", { concurrency: false }, async () => {
  const readyForAssessment = candidate("github:openai/ready-for-assessment", 5);
  const backlog = candidate("github:openai/enrichment-backlog", 1);
  await seed(readyForAssessment, 5);
  await seed(backlog, 1);
  const digest = await attachDigest(readyForAssessment.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: readyForAssessment, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });

  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: readyForAssessment.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: backlog, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });

  const next = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), workerId: "worker-b" });
  assert.equal(next?.kind, "assessment");
  assert.equal(next?.candidate.canonicalIdentifier, readyForAssessment.canonicalIdentifier);
});

test("真实 PostgreSQL 在同一周期为另一类任务保留领取机会", { concurrency: false }, async () => {
  const readyForAssessment = candidate("github:openai/assessment-backlog", 5);
  const enrichmentBacklog = candidate("github:openai/enrichment-backlog", 1);
  await seed(readyForAssessment, 5);
  await seed(enrichmentBacklog, 1);
  const digest = await attachDigest(readyForAssessment.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: readyForAssessment, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });

  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: readyForAssessment.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: enrichmentBacklog, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });

  const next = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), preferredKind: "enrichment", workerId: "worker-b" });
  assert.equal(next?.kind, "enrichment");
  assert.equal(next?.candidate.canonicalIdentifier, enrichmentBacklog.canonicalIdentifier);
});

test("模型任务三次失败后持久化为评估延迟，并保留错误和队列统计", { concurrency: false }, async () => {
  const input = candidate("github:openai/codex");
  await seed(input);
  const digest = await attachDigest(input.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const task = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + attempt), workerId: `worker-${attempt}` });
    if (!task) throw new Error("Fixture 缺少评估任务。");
    const status = await postgresCandidateTaskArchive.fail({ errorMessage: "Ollama Runtime 请求失败：HTTP 503", task });
    assert.equal(status, attempt === 3 ? "delayed" : "retryable");
  }

  const [candidateState, taskState, statistics] = await Promise.all([
    getDatabasePool().query<{ assessment_delay_detail: string; lifecycle_status: string }>("SELECT lifecycle_status, assessment_delay_detail FROM radar_candidates WHERE id = $1", [input.canonicalIdentifier]),
    getDatabasePool().query<{ attempt_count: number; last_error: string; status: string }>("SELECT status, attempt_count, last_error FROM candidate_tasks WHERE task_kind = 'assessment'"),
    postgresCandidateTaskArchive.getStatistics({ cycleStartedAt: new Date(now.getTime() - 1_000) }),
  ]);

  assert.deepEqual(candidateState.rows, [{ assessment_delay_detail: "Ollama Runtime 请求失败：HTTP 503", lifecycle_status: "评估延迟" }]);
  assert.deepEqual(taskState.rows, [{ attempt_count: 3, last_error: "Ollama Runtime 请求失败：HTTP 503", status: "delayed" }]);
  assert.equal(statistics.pendingByState["评估延迟"], 1);
  assert.equal(statistics.retryCount, 1);
});

test("评估任务持久关联其实际使用的 Primary Evidence", { concurrency: false }, async () => {
  const input = candidate("github:openai/evidence-link");
  await seed(input);
  const digest = await attachDigest(input.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });

  const assessment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), workerId: "worker-b" });
  assert.equal(assessment?.kind, "assessment");
  assert.deepEqual(assessment?.candidate.primaryEvidence.map((evidence) => [evidence.contentFingerprint, evidence.sourceUrl]), [[digest.contentFingerprint, digest.sourceUrl]]);
  const links = await getDatabasePool().query<{ task_id: string }>("SELECT task_id FROM candidate_task_evidence_digests");
  assert.equal(links.rowCount, 1);
});

test("已完成的队列评估发布后可从详情 API 读取冻结 Signal Card 与 Evidence", { concurrency: false }, async () => {
  const input = candidate("github:openai/ready-brief");
  await seed(input);
  const digest = await attachDigest(input.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });
  const assessmentTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), workerId: "worker-b" });
  if (!assessmentTask) throw new Error("Fixture 缺少评估任务。");
  await postgresCandidateTaskArchive.completeAssessment({
    assessment: {
      assessmentOutcome: "sufficient-for-ranking",
      builderValue: "试用",
      citations: { happened: [digest.sourceUrl], summary: [digest.sourceUrl], technicalBasis: [digest.sourceUrl], whyNow: [digest.sourceUrl] },
      happened: "该项目近期出现。",
      productOpportunity: "待验证",
      risk: "需要验证。",
      summary: "值得小范围试用。",
      technicalBasis: "公开页面说明其技术能力。",
      topics: ["开发工具"],
      whyNow: "当前窗口内新发现。",
    },
    task: assessmentTask,
  });

  const ready = await postgresBriefPublicationArchive.getReadyAssessments?.(10);
  assert.equal(ready?.length, 1);
  assert.equal(ready?.[0]?.assessment.summary, "值得小范围试用。");
  assert.deepEqual(ready?.[0]?.candidate.evidence.map((evidence) => evidence.sourceUrl), [digest.sourceUrl]);
  assert.match(ready?.[0]?.candidate.selectionReason ?? "", /Builder 价值为“试用”/);

  const publisher = createReadyBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => now,
    createBriefId: () => "brief-ready-detail",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
  });
  assert.deepEqual(await publisher.publishDailyBrief(), { briefId: "brief-ready-detail", signalCount: 1, status: "published" });

  const response = await fetch(`${baseUrl}/api/retrieval/detail?id=brief-ready-detail%3Asignal%3A1`);
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.id, "brief-ready-detail:signal:1");
  assert.equal(detail.title, "github:openai/ready-brief");
  assert.equal(detail.summary, "值得小范围试用。");
  assert.deepEqual(detail.evidence, [{
    excerpts: digest.excerpts,
    label: digest.sourceTitle,
    source: digest.sourceName,
    url: digest.sourceUrl,
  }]);
  assert.deepEqual(detail.provenance, {
    configurationVersion: "profile@v1",
    modelRuntimeId: "ollama:qwen3",
    pipelineVersion: "assessment-pipeline@v1",
    rankingPolicyVersion: "evidence-first@v1",
  });
});

test("Builder Value 的跳过仅作为排序信号，仍保留可发布 Assessment", { concurrency: false }, async () => {
  const input = candidate("github:openai/skip");
  await seed(input);
  const digest = await attachDigest(input.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });
  const assessmentTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), workerId: "worker-b" });
  if (!assessmentTask) throw new Error("Fixture 缺少评估任务。");
  await postgresCandidateTaskArchive.completeAssessment({
    assessment: { assessmentOutcome: "sufficient-for-ranking", builderValue: "跳过", citations: { happened: [digest.sourceUrl], summary: [digest.sourceUrl], technicalBasis: [digest.sourceUrl], whyNow: [digest.sourceUrl] }, happened: "未确认新的发布或能力变化。", productOpportunity: "无", risk: "需要验证真实工作流。", summary: "暂不建议优先投入的代码任务 Agent。", technicalBasis: "通过本地任务执行与审批门控制操作。", topics: ["开发工具"], whyNow: "对需要减少重复代码操作的开发者，可先观察其审批流程是否稳定。" },
    task: assessmentTask,
  });
  const state = await getDatabasePool().query<{ evaluation_status: string; lifecycle_status: string }>("SELECT lifecycle_status, evaluation_status FROM radar_candidates WHERE id = $1", [input.canonicalIdentifier]);
  assert.deepEqual(state.rows, [{ evaluation_status: "ready", lifecycle_status: "已评估待发布" }]);
});

test("真实 PostgreSQL 将模型证据不足与运行时失败分开持久化", { concurrency: false }, async () => {
  const input = candidate("github:openai/insufficient");
  await seed(input);
  const digest = await attachDigest(input.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });
  const assessmentTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), workerId: "worker-b" });
  if (!assessmentTask) throw new Error("Fixture 缺少评估任务。");
  await postgresCandidateTaskArchive.completeAssessment({
    assessment: { assessmentOutcome: "insufficient-evidence", assessmentReason: "Primary Evidence 未说明具体使用场景。" },
    task: assessmentTask,
  });

  const [candidateState, taskState] = await Promise.all([
    getDatabasePool().query<{ evaluation_status: string; lifecycle_status: string }>("SELECT lifecycle_status, evaluation_status FROM radar_candidates WHERE id = $1", [input.canonicalIdentifier]),
    getDatabasePool().query<{ status: string }>("SELECT status FROM candidate_tasks WHERE id = $1", [assessmentTask.id]),
  ]);
  assert.deepEqual(candidateState.rows, [{ evaluation_status: "not-selected", lifecycle_status: "证据不足未入选" }]);
  assert.deepEqual(taskState.rows, [{ status: "completed" }]);
});

test("人工复评只重新入队当前已评估待发布 Candidate", { concurrency: false }, async () => {
  const input = candidate("github:openai/manual-reassessment");
  await seed(input);
  const digest = await attachDigest(input.canonicalIdentifier);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const enrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!enrichment) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: enrichment });
  const assessmentTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 1), workerId: "worker-b" });
  if (!assessmentTask) throw new Error("Fixture 缺少评估任务。");
  await postgresCandidateTaskArchive.completeAssessment({
    assessment: { assessmentOutcome: "sufficient-for-ranking", builderValue: "试用", citations: { happened: [digest.sourceUrl], summary: [digest.sourceUrl], technicalBasis: [digest.sourceUrl], whyNow: [digest.sourceUrl] }, happened: "未确认新的发布或能力变化。", productOpportunity: "待验证", risk: "需要验证真实工作流。", summary: "面向本地开发者的代码任务 Agent。", technicalBasis: "通过本地任务执行与审批门控制操作。", topics: ["开发工具"], whyNow: "需要在本地代码任务中减少重复操作的开发者，可以先用它验证审批流程。" },
    task: assessmentTask,
  });

  assert.equal(await postgresCandidateTaskArchive.requeueReadyAssessments({ configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" }), 1);
  const manualEnrichment = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 2), workerId: "worker-c" });
  if (!manualEnrichment) throw new Error("Fixture 缺少人工补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [digest], status: "enriched" }, task: manualEnrichment });
  const [candidateState, manualTasks, assessmentTasks] = await Promise.all([
    getDatabasePool().query<{ evaluation_status: string; lifecycle_status: string }>("SELECT lifecycle_status, evaluation_status FROM radar_candidates WHERE id = $1", [input.canonicalIdentifier]),
    getDatabasePool().query<{ configuration_version: string; runtime_id: string; status: string }>("SELECT configuration_version, runtime_id, status FROM candidate_tasks WHERE evidence_fingerprint LIKE 'manual-reassessment:%'"),
    getDatabasePool().query<{ task_count: number }>("SELECT COUNT(*)::integer AS task_count FROM candidate_tasks WHERE candidate_id = $1 AND task_kind = 'assessment'", [input.canonicalIdentifier]),
  ]);
  assert.deepEqual(candidateState.rows, [{ evaluation_status: "queued", lifecycle_status: "评估中" }]);
  assert.deepEqual(manualTasks.rows, [{ configuration_version: "profile@v1", runtime_id: "ollama:qwen3", status: "completed" }]);
  assert.deepEqual(assessmentTasks.rows, [{ task_count: 2 }]);
});

test("运行时切换不会自动复评，但新 Discovery Evidence 会重新入队", { concurrency: false }, async () => {
  const input = candidate("github:openai/reassessment-trigger");
  await seed(input);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const initialTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!initialTask) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [], status: "insufficient-evidence" }, task: initialTask });

  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v2", runtimeId: "ollama:qwen4" });
  const unchanged = await getDatabasePool().query<{ lifecycle_status: string; task_count: number }>(
    `SELECT candidate.lifecycle_status, COUNT(task.id)::integer AS task_count
    FROM radar_candidates candidate JOIN candidate_tasks task ON task.candidate_id = candidate.id
    WHERE candidate.id = $1 GROUP BY candidate.id`,
    [input.canonicalIdentifier],
  );
  assert.deepEqual(unchanged.rows, [{ lifecycle_status: "证据不足未入选", task_count: 1 }]);

  const changedDiscovery: Candidate = {
    ...input,
    evidence: [{ ...input.evidence[0]!, sourceTitle: `${input.title} release`, sourceUrl: `${input.url}?release=2` }],
  };
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: changedDiscovery, configurationVersion: "profile@v2", runtimeId: "ollama:qwen4" });
  const [state, changedTask] = await Promise.all([
    getDatabasePool().query<{ lifecycle_status: string }>("SELECT lifecycle_status FROM radar_candidates WHERE id = $1", [input.canonicalIdentifier]),
    getDatabasePool().query<{ configuration_version: string; status: string }>("SELECT configuration_version, status FROM candidate_tasks WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1", [input.canonicalIdentifier]),
  ]);
  assert.deepEqual(state.rows, [{ lifecycle_status: "待补证" }]);
  assert.deepEqual(changedTask.rows, [{ configuration_version: "profile@v2", status: "queued" }]);
});

test("租约过期后旧 Worker 的完成写入不会覆盖新 Worker 的租约", { concurrency: false }, async () => {
  const input = candidate("github:openai/stale-worker");
  await seed(input);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const oldTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1, now, workerId: "worker-old" });
  const newTask = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now: new Date(now.getTime() + 2), workerId: "worker-new" });
  if (!oldTask || !newTask) throw new Error("Fixture 缺少租约任务。");

  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [], status: "insufficient-evidence" }, task: oldTask });

  const state = await getDatabasePool().query<{ lifecycle_status: string; status: string }>(
    `SELECT candidate.lifecycle_status, task.status
    FROM radar_candidates candidate JOIN candidate_tasks task ON task.candidate_id = candidate.id
    WHERE candidate.id = $1`,
    [input.canonicalIdentifier],
  );
  assert.deepEqual(state.rows, [{ lifecycle_status: "补证中", status: "leased" }]);
});

test("未变化的 Discovery Evidence 不会把已完成补证重新排队", { concurrency: false }, async () => {
  const input = candidate("github:openai/unchanged");
  await seed(input);
  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });
  const task = await postgresCandidateTaskArchive.claimNext({ leaseMs: 1_000, now, workerId: "worker-a" });
  if (!task) throw new Error("Fixture 缺少补证任务。");
  await postgresCandidateTaskArchive.completeEnrichment({ result: { candidateCanonicalIdentifier: input.canonicalIdentifier, digests: [], status: "insufficient-evidence" }, task });

  await postgresCandidateTaskArchive.enqueueEnrichment({ candidate: input, configurationVersion: "profile@v1", runtimeId: "ollama:qwen3" });

  const state = await getDatabasePool().query<{ lifecycle_status: string; status: string }>(
    `SELECT candidate.lifecycle_status, task.status
    FROM radar_candidates candidate JOIN candidate_tasks task ON task.candidate_id = candidate.id
    WHERE candidate.id = $1`,
    [input.canonicalIdentifier],
  );
  assert.deepEqual(state.rows, [{ lifecycle_status: "证据不足未入选", status: "completed" }]);
});
