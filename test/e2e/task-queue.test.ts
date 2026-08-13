import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { postgresAssessmentPipelineArchive } from "../../src/lib/radar/assessment-pipeline-archive.ts";
import { postgresBriefPublicationArchive } from "../../src/lib/radar/brief-publication-archive.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";
import type { EvidenceDigest } from "../../src/lib/radar/evidence-enrichment.ts";
import { postgresCandidateTaskArchive } from "../../src/lib/radar/task-queue.ts";
import type { Candidate } from "../../src/lib/radar/connectors/types.ts";

const now = new Date("2026-08-13T01:00:00.000Z");

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
  await getDatabasePool().query("TRUNCATE TABLE candidate_tasks, candidate_evidence_digests, evidence_digests, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects RESTART IDENTITY CASCADE");
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

test("已完成的队列评估可作为日报的唯一发布输入", { concurrency: false }, async () => {
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
      builderValue: "试用",
      citations: { happened: [digest.sourceUrl], technicalBasis: [digest.sourceUrl], whyNow: [digest.sourceUrl] },
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
