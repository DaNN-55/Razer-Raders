import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import type { AssessmentWithContent, GroundedAssessment, ModelRuntime } from "../../src/lib/radar/assessment-contract.ts";
import { postgresBriefPublicationArchive } from "../../src/lib/radar/brief-publication-archive.ts";
import { createBriefPublisher, type PublicationCandidate } from "../../src/lib/radar/brief-publication.ts";
import { recordCollectionCycle } from "../../src/lib/radar/collection-stage-recorder.ts";
import { postgresAssessmentPipelineArchive } from "../../src/lib/radar/assessment-pipeline-archive.ts";
import { createAssessmentPipeline, type SourceConnector } from "../../src/lib/radar/assessment-pipeline.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";
import type { Candidate } from "../../src/lib/radar/connectors/types.ts";
import { collectHuggingFaceTrending } from "../../src/lib/radar/connectors/hugging-face-trending.ts";
import { collectShowHn } from "../../src/lib/radar/connectors/show-hn.ts";
import { createOllamaRuntimeFromEnvironment } from "../../src/lib/radar/ollama-runtime.ts";
import { getActiveRadarProfile, listRadarProfileVersions, rollbackRadarProfile, saveRadarProfile } from "../../src/lib/radar/profile-archive.ts";
import { createInitialRadarProfileConfig } from "../../src/lib/radar/radar-profile.ts";

const candidate: PublicationCandidate = {
  canonicalIdentifier: "github:openai/codex",
  evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
  priority: "值得关注",
  rankingPolicyVersion: "v0.1",
  rankingScore: 1,
  selectionReason: "GitHub Trending 在 Observation Window 内新发现。",
  signalState: "新出现",
  title: "openai/codex",
};

const validAssessment: GroundedAssessment = {
  builderValue: "试用",
  citations: {
    happened: ["https://github.com/openai/codex"],
    technicalBasis: ["https://github.com/openai/codex"],
    whyNow: ["https://github.com/openai/codex"],
  },
  happened: "openai/codex 出现在 GitHub Trending。",
  productOpportunity: "待验证",
  risk: "尚未在目标工作流中验证。",
  summary: "Builder 可以先做小范围试用。",
  technicalBasis: "该项目公开提供 TypeScript 源码。",
  topics: ["开发工具"],
  whyNow: "它在当前 Observation Window 内被收集。",
};

const baseUrl = process.env.RADAR_E2E_BASE_URL;
if (!baseUrl) throw new Error("RADAR_E2E_BASE_URL 未配置。请通过 pnpm test:e2e 运行。");

function fixedRuntime(assessment: GroundedAssessment, id = "compatible:fixed-e2e"): ModelRuntime {
  return { assess: async () => assessment, id };
}

function candidateAwareRuntime(id: string): ModelRuntime {
  return {
    assess: async (publicationCandidate) => {
      const sourceUrl = publicationCandidate.evidence[0]?.sourceUrl;
      if (!sourceUrl) throw new Error("Fixture Candidate 缺少证据。");
      return {
        ...validAssessment,
        citations: { happened: [sourceUrl], technicalBasis: [sourceUrl], whyNow: [sourceUrl] },
        happened: `${publicationCandidate.title} 出现在 GitHub Trending。`,
        summary: `${publicationCandidate.title} 值得 Builder 小范围试用。`,
      };
    },
    id,
  };
}

async function seedCandidate() {
  const database = getDatabasePool();
  const now = new Date();
  await database.query(
    "INSERT INTO radar_subjects (id, canonical_identifier, title, signal_type) VALUES ($1, $2, $3, $4)",
    ["subject:github:openai/codex", candidate.canonicalIdentifier, candidate.title, "project"],
  );
  await database.query(
    `INSERT INTO radar_candidates (
      id, canonical_identifier, subject_canonical_identifier, connector_id, subject_id, signal_type, title, source_url,
      first_collected_at, last_collected_at, evaluation_status, signal_state, priority, ranking_score, ranking_policy_version,
      observation_count, selection_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'evaluating', $10, $11, $12, 'v0.1', 1, $13)`,
    [
      candidate.canonicalIdentifier,
      candidate.canonicalIdentifier,
      candidate.canonicalIdentifier,
      "github-trending",
      "subject:github:openai/codex",
      "project",
      candidate.title,
      candidate.evidence[0]!.sourceUrl,
      now,
      candidate.signalState,
      candidate.priority,
      candidate.rankingScore,
      candidate.selectionReason,
    ],
  );
  const evidence = await database.query<{ id: number }>(
    `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_title, source_url, collected_at, trust)
    VALUES ($1, $2, $3, $4, $5, $6, 'untrusted') RETURNING id`,
    [
      candidate.evidence[0]!.canonicalIdentifier,
      "github-trending",
      candidate.evidence[0]!.sourceName,
      candidate.evidence[0]!.sourceTitle,
      candidate.evidence[0]!.sourceUrl,
      now,
    ],
  );
  const evidenceId = evidence.rows[0]?.id;
  if (evidenceId === undefined) throw new Error("E2E Fixture 未能写入 Source Evidence。");
  await database.query(
    "INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association) VALUES ($1, $2, 'primary')",
    [candidate.canonicalIdentifier, evidenceId],
  );
}

async function seedSecondCandidate() {
  const database = getDatabasePool();
  const secondCandidate: PublicationCandidate = {
    ...candidate,
    canonicalIdentifier: "github:openai/openai-agents-js",
    evidence: [{ canonicalIdentifier: "github:openai/openai-agents-js", sourceName: "GitHub Trending", sourceTitle: "openai/openai-agents-js", sourceUrl: "https://github.com/openai/openai-agents-js" }],
    title: "openai/openai-agents-js",
  };
  const now = new Date();
  await database.query(
    "INSERT INTO radar_subjects (id, canonical_identifier, title, signal_type) VALUES ($1, $2, $3, $4)",
    ["subject:github:openai/openai-agents-js", secondCandidate.canonicalIdentifier, secondCandidate.title, "project"],
  );
  await database.query(
    `INSERT INTO radar_candidates (
      id, canonical_identifier, subject_canonical_identifier, connector_id, subject_id, signal_type, title, source_url,
      first_collected_at, last_collected_at, evaluation_status, signal_state, priority, ranking_score, ranking_policy_version,
      observation_count, selection_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'evaluating', $10, $11, $12, 'v0.1', 1, $13)`,
    [
      secondCandidate.canonicalIdentifier,
      secondCandidate.canonicalIdentifier,
      secondCandidate.canonicalIdentifier,
      "github-trending",
      "subject:github:openai/openai-agents-js",
      "project",
      secondCandidate.title,
      secondCandidate.evidence[0]!.sourceUrl,
      now,
      secondCandidate.signalState,
      secondCandidate.priority,
      secondCandidate.rankingScore,
      secondCandidate.selectionReason,
    ],
  );
  const evidence = await database.query<{ id: number }>(
    `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_title, source_url, collected_at, trust)
    VALUES ($1, $2, $3, $4, $5, $6, 'untrusted') RETURNING id`,
    [
      secondCandidate.evidence[0]!.canonicalIdentifier,
      "github-trending",
      secondCandidate.evidence[0]!.sourceName,
      secondCandidate.evidence[0]!.sourceTitle,
      secondCandidate.evidence[0]!.sourceUrl,
      now,
    ],
  );
  const evidenceId = evidence.rows[0]?.id;
  if (evidenceId === undefined) throw new Error("E2E Fixture 未能写入第二条 Source Evidence。");
  await database.query(
    "INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association) VALUES ($1, $2, 'primary')",
    [secondCandidate.canonicalIdentifier, evidenceId],
  );
}

async function seedUnpublishedCandidate() {
  const database = getDatabasePool();
  const unpublishedCandidate = {
    canonicalIdentifier: "github:openai/unpublished",
    sourceUrl: "https://github.com/openai/unpublished",
    title: "openai/unpublished",
  };
  const now = new Date();
  await database.query(
    "INSERT INTO radar_subjects (id, canonical_identifier, title, signal_type) VALUES ($1, $2, $3, $4)",
    ["subject:github:openai/unpublished", unpublishedCandidate.canonicalIdentifier, unpublishedCandidate.title, "project"],
  );
  await database.query(
    `INSERT INTO radar_candidates (
      id, canonical_identifier, subject_canonical_identifier, connector_id, subject_id, signal_type, title, source_url,
      first_collected_at, last_collected_at, evaluation_status, signal_state, priority, ranking_score, ranking_policy_version,
      observation_count, selection_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'evaluating', $10, $11, $12, 'v0.1', 1, $13)`,
    [
      unpublishedCandidate.canonicalIdentifier,
      unpublishedCandidate.canonicalIdentifier,
      unpublishedCandidate.canonicalIdentifier,
      "github-trending",
      "subject:github:openai/unpublished",
      "project",
      unpublishedCandidate.title,
      unpublishedCandidate.sourceUrl,
      now,
      candidate.signalState,
      candidate.priority,
      candidate.rankingScore,
      candidate.selectionReason,
    ],
  );
  const evidence = await database.query<{ id: number }>(
    `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_title, source_url, collected_at, trust)
    VALUES ($1, $2, $3, $4, $5, $6, 'untrusted') RETURNING id`,
    [unpublishedCandidate.canonicalIdentifier, "github-trending", "GitHub Trending", unpublishedCandidate.title, unpublishedCandidate.sourceUrl, now],
  );
  const evidenceId = evidence.rows[0]?.id;
  if (evidenceId === undefined) throw new Error("E2E Fixture 未能写入未发布 Source Evidence。");
  await database.query(
    "INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association) VALUES ($1, $2, 'primary')",
    [unpublishedCandidate.canonicalIdentifier, evidenceId],
  );
}

async function seedUncitedEvidence() {
  const database = getDatabasePool();
  const now = new Date();
  const evidence = await database.query<{ id: number }>(
    `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_title, source_url, collected_at, trust)
    VALUES ($1, $2, $3, $4, $5, $6, 'untrusted') RETURNING id`,
    ["github:openai/codex:uncited", "github-trending", "GitHub Trending", "uncited evidence", "https://github.com/openai/uncited", now],
  );
  const evidenceId = evidence.rows[0]?.id;
  if (evidenceId === undefined) throw new Error("E2E Fixture 未能写入未引用 Source Evidence。");
  await database.query(
    "INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association) VALUES ($1, $2, 'related')",
    [candidate.canonicalIdentifier, evidenceId],
  );
}

function recollectedCandidate(): Candidate {
  return {
    canonicalIdentifier: candidate.canonicalIdentifier,
    collectedAt: "2026-08-12T01:20:00.000Z",
    connectorId: "github-trending",
    evidence: [{
      canonicalIdentifier: candidate.evidence[0]!.canonicalIdentifier,
      collectedAt: "2026-08-12T01:20:00.000Z",
      connectorId: "github-trending",
      sourceName: candidate.evidence[0]!.sourceName,
      sourceTitle: candidate.evidence[0]!.sourceTitle,
      sourceUrl: candidate.evidence[0]!.sourceUrl,
      trust: "untrusted",
    }],
    signalType: "project",
    subjectCanonicalIdentifier: candidate.canonicalIdentifier,
    title: candidate.title,
    url: candidate.evidence[0]!.sourceUrl,
  };
}

beforeEach(async () => {
  await getDatabasePool().query(
    "TRUNCATE TABLE pipeline_runs, radar_signals, brief_snapshots, candidate_evidence_digests, evidence_digests, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects, radar_profile_state, radar_profile_versions RESTART IDENTITY CASCADE",
  );
  await seedCandidate();
});

after(async () => {
  await getDatabasePool().end();
});

test("Radar Profile 在 PostgreSQL 中版本化保存，并允许回滚到已验证的旧版本", { concurrency: false }, async () => {
  const environment = {
    RADAR_MODEL_RUNTIME: "ollama",
    RADAR_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    RADAR_OLLAMA_MODEL: "qwen3-local:8b",
  };
  const initial = await saveRadarProfile(createInitialRadarProfileConfig(environment), async () => undefined);
  assert.equal(initial.id, "profile@v1");
  assert.equal(initial.runtime.model, "qwen3-local:8b");

  const saved = await saveRadarProfile({ ...initial, includeTerms: ["agent"] }, async () => undefined);
  assert.equal(saved.id, "profile@v2");
  assert.deepEqual((await getActiveRadarProfile())?.includeTerms, ["agent"]);
  assert.deepEqual((await listRadarProfileVersions()).map((profile) => profile.id), ["profile@v2", "profile@v1"]);

  const rolledBack = await rollbackRadarProfile(initial.id);
  assert.equal(rolledBack.id, "profile@v1");
  assert.deepEqual((await getActiveRadarProfile())?.includeTerms, []);
});

test("旧 Official Release Profile 保留原始版本并安全映射为 GitHub Trending", { concurrency: false }, async () => {
  const configuration = {
    ...createInitialRadarProfileConfig({
      RADAR_MODEL_RUNTIME: "ollama",
      RADAR_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      RADAR_OLLAMA_MODEL: "qwen3-local:8b",
    }),
    enabledConnectorIds: ["official-watchlist"],
    officialWatchlist: [{ allowedHosts: ["openai.example"], name: "OpenAI Release", url: "https://openai.example/news" }],
  };
  await getDatabasePool().query(
    "INSERT INTO radar_profile_versions (id, version, configuration) VALUES ('profile@v1', 1, $1)",
    [JSON.stringify(configuration)],
  );
  await getDatabasePool().query(
    "INSERT INTO radar_profile_state (singleton, active_profile_id) VALUES (TRUE, 'profile@v1')",
  );

  assert.deepEqual((await getActiveRadarProfile())?.enabledConnectorIds, ["github-trending"]);
  assert.deepEqual((await listRadarProfileVersions()).map((profile) => profile.enabledConnectorIds), [["github-trending"]]);
  assert.deepEqual((await rollbackRadarProfile("profile@v1")).enabledConnectorIds, ["github-trending"]);
  const stored = await getDatabasePool().query<{ configuration: { officialWatchlist: unknown; enabledConnectorIds: string[] } }>(
    "SELECT configuration FROM radar_profile_versions WHERE id = 'profile@v1'",
  );
  assert.deepEqual(stored.rows[0]?.configuration.enabledConnectorIds, ["official-watchlist"]);
  assert.equal(Array.isArray(stored.rows[0]?.configuration.officialWatchlist), true);
});

test("固定 Runtime 经真实 PostgreSQL 按日发布后，API 读取 Snapshot、Provenance 与执行历史", { concurrency: false }, async () => {
  const publicationCandidates = await postgresBriefPublicationArchive.getCandidatesForPublication();
  assert.deepEqual(publicationCandidates, [candidate]);
  const collectionRun = await getDatabasePool().query(
    "INSERT INTO collection_runs (id, connector_id, started_at, finished_at, status, candidate_count) VALUES ($1, $2, $3, $3, 'succeeded', 1)",
    ["collection-run-e2e", "github-trending", new Date("2026-08-12T01:00:00.000Z")],
  );
  assert.equal(collectionRun.rowCount, 1);
  await recordCollectionCycle({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    result: { candidateCount: 1, connectorId: "github-trending", runId: "collection-run-e2e", status: "succeeded" },
  });

  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-published",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: fixedRuntime(validAssessment),
  }).publishDailyBrief();

  assert.deepEqual(result, { briefId: "brief-e2e-published", signalCount: 1, status: "published" });
  const storedSignals = await getDatabasePool().query<{ section_citations: AssessmentWithContent["citations"]; title: string }>(
    "SELECT title, section_citations FROM radar_signals WHERE brief_id = $1",
    ["brief-e2e-published"],
  );
  assert.equal(storedSignals.rows[0]?.title, "openai/codex");
  assert.deepEqual(storedSignals.rows[0]?.section_citations, validAssessment.citations);
  const snapshot = await getDatabasePool().query<{
    configuration_version: string;
    model_runtime_id: string;
    pipeline_version: string;
    publication_day: string;
    ranking_policy_version: string;
  }>("SELECT publication_day::text AS publication_day, configuration_version, ranking_policy_version, model_runtime_id, pipeline_version FROM brief_snapshots WHERE id = $1", ["brief-e2e-published"]);
  assert.deepEqual(snapshot.rows[0], {
    configuration_version: "profile@v1",
    model_runtime_id: "compatible:fixed-e2e",
    pipeline_version: "assessment-pipeline@v1",
    publication_day: "2026-08-12",
    ranking_policy_version: "v0.1",
  });
  const stages = await getDatabasePool().query<{ collection_run_id: string | null; stage: string; status: string }>("SELECT collection_run_id, stage, status FROM pipeline_runs ORDER BY id");
  assert.deepEqual(stages.rows, [
    { collection_run_id: "collection-run-e2e", stage: "collection", status: "succeeded" },
    { collection_run_id: null, stage: "assessment", status: "started" },
    { collection_run_id: null, stage: "assessment", status: "succeeded" },
    { collection_run_id: null, stage: "validation", status: "started" },
    { collection_run_id: null, stage: "validation", status: "succeeded" },
    { collection_run_id: null, stage: "publication", status: "started" },
    { collection_run_id: null, stage: "publication", status: "succeeded" },
  ]);

  const response = await fetch(`${baseUrl}/api/brief`);
  const brief = await response.json();
  assert.equal(response.status, 200);
  assert.equal(brief.mode, "archive");
  assert.equal(brief.availability, "published");
  assert.equal(brief.signals[0]?.title, "openai/codex");
  assert.deepEqual(brief.provenance, {
    configurationVersion: "profile@v1",
    modelRuntimeId: "compatible:fixed-e2e",
    pipelineVersion: "assessment-pipeline@v1",
    rankingPolicyVersion: "v0.1",
  });
  assert.deepEqual(brief.signals[0]?.evidence, [{ label: "openai/codex", source: "GitHub Trending", url: "https://github.com/openai/codex" }]);
});

test("无效固定 Runtime 被拒绝后，真实 Archive 不会产生 Snapshot", { concurrency: false }, async () => {
  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-rejected",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: fixedRuntime({ ...validAssessment, citations: { happened: [], technicalBasis: [], whyNow: [] } }),
  }).publishDailyBrief();

  assert.deepEqual(result, { reason: "openai/codex：缺少 happened 的事实引用。", status: "rejected" });
  const snapshots = await getDatabasePool().query("SELECT id FROM brief_snapshots");
  assert.equal(snapshots.rowCount, 0);

  const response = await fetch(`${baseUrl}/api/brief`);
  const brief = await response.json();
  assert.equal(brief.availability, "evaluating");
  assert.deepEqual(brief.signals, []);
});

test("固定 Ollama 传输 Fixture 经相同 Publication Validation 发布 Brief Snapshot", { concurrency: false }, async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const runtime = createOllamaRuntimeFromEnvironment({
    RADAR_OLLAMA_BASE_URL: "http://ollama.fixture:11434",
    RADAR_OLLAMA_MODEL: "qwen3:8b",
  }, async (input, init) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body);
    return Response.json({ done: true, response: JSON.stringify(validAssessment) });
  });
  assert.ok(runtime);

  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-ollama",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime,
  }).publishDailyBrief();

  assert.deepEqual(result, { briefId: "brief-e2e-ollama", signalCount: 1, status: "published" });
  assert.equal(requestedUrl, "http://ollama.fixture:11434/api/generate");
  assert.match(requestedBody, /openai\/codex/);
  const snapshot = await getDatabasePool().query<{ model_runtime_id: string }>(
    "SELECT model_runtime_id FROM brief_snapshots WHERE id = $1",
    ["brief-e2e-ollama"],
  );
  assert.deepEqual(snapshot.rows, [{ model_runtime_id: "ollama:qwen3:8b" }]);
});

test("固定 Ollama 传输失败会按 Assessment Delay 呈现，不会发布 Snapshot", { concurrency: false }, async () => {
  let attempts = 0;
  const runtime = createOllamaRuntimeFromEnvironment({
    RADAR_OLLAMA_BASE_URL: "http://ollama.fixture:11434",
    RADAR_OLLAMA_MODEL: "qwen3:8b",
  }, async () => {
    attempts += 1;
    return new Response("model unavailable", { status: 503 });
  });
  assert.ok(runtime);

  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-ollama-delayed",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime,
  }).publishDailyBrief();

  assert.deepEqual(result, {
    reason: "openai/codex：Ollama Runtime 请求失败：HTTP 503（已重试 3 次）",
    status: "delayed",
  });
  assert.equal(attempts, 3);
  const response = await fetch(`${baseUrl}/api/brief`);
  const brief = await response.json();
  assert.equal(response.status, 200);
  assert.equal(brief.availability, "assessment-delayed");
  assert.deepEqual(brief.assessmentDelay, {
    candidateCount: 1,
    detail: "Ollama Runtime 请求失败：HTTP 503（已重试 3 次）",
  });
  const snapshots = await getDatabasePool().query("SELECT id FROM brief_snapshots");
  assert.equal(snapshots.rowCount, 0);
});

test("固定失败 Runtime 耗尽重试后，API 明确呈现 Assessment Delay，后续采集可恢复", { concurrency: false }, async () => {
  let attempts = 0;
  const delayed = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-delayed",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: {
      assess: async () => {
        attempts += 1;
        throw new Error("Compatible Runtime 请求失败：HTTP 503");
      },
      id: "compatible:unavailable-e2e",
    },
  }).publishDailyBrief();

  assert.equal(delayed.status, "delayed");
  assert.equal(attempts, 3);
  const delayedCandidates = await getDatabasePool().query<{ assessment_delay_detail: string; evaluation_status: string }>(
    "SELECT evaluation_status, assessment_delay_detail FROM radar_candidates",
  );
  assert.deepEqual(delayedCandidates.rows, [{
    assessment_delay_detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
    evaluation_status: "assessment-delayed",
  }]);

  const delayedResponse = await fetch(`${baseUrl}/api/brief`);
  const delayedBrief = await delayedResponse.json();
  assert.equal(delayedResponse.status, 200);
  assert.equal(delayedBrief.availability, "assessment-delayed");
  assert.deepEqual(delayedBrief.assessmentDelay, {
    candidateCount: 1,
    detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
  });
  assert.deepEqual(delayedBrief.signals, []);

  await postgresAssessmentPipelineArchive.upsertCandidate(recollectedCandidate());
  const recollectedCandidateState = await getDatabasePool().query<{ assessment_delay_detail: string | null; evaluation_status: string }>(
    "SELECT evaluation_status, assessment_delay_detail FROM radar_candidates",
  );
  assert.deepEqual(recollectedCandidateState.rows, [{ assessment_delay_detail: null, evaluation_status: "evaluating" }]);
  const recovered = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:30:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-recovered",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: fixedRuntime(validAssessment),
  }).publishDailyBrief();

  assert.deepEqual(recovered, { briefId: "brief-e2e-recovered", signalCount: 1, status: "published" });
  const recoveredResponse = await fetch(`${baseUrl}/api/brief`);
  const recoveredBrief = await recoveredResponse.json();
  assert.equal(recoveredBrief.availability, "published");
  assert.equal(recoveredBrief.assessmentDelay, undefined);
});

test("重复采集已发布 Candidate 不会将它重新放入待评估队列", { concurrency: false }, async () => {
  const published = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-no-republish",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: fixedRuntime(validAssessment),
  }).publishDailyBrief();
  assert.equal(published.status, "published");

  await postgresAssessmentPipelineArchive.upsertCandidate(recollectedCandidate());
  const state = await getDatabasePool().query<{ assessment_delay_detail: string | null; evaluation_status: string }>(
    "SELECT evaluation_status, assessment_delay_detail FROM radar_candidates",
  );
  assert.deepEqual(state.rows, [{ assessment_delay_detail: null, evaluation_status: "published" }]);
  assert.deepEqual(await postgresBriefPublicationArchive.getCandidatesForPublication(), []);
});

test("单一 Source Connector 降级不会阻断已发布 Brief，并在恢复后更新公开 Health", { concurrency: false }, async () => {
  const published = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-e2e-connector-health",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: fixedRuntime(validAssessment),
  }).publishDailyBrief();
  assert.equal(published.status, "published");

  const failingConnector: SourceConnector = {
    collect: async () => { throw new Error("HTTP 429"); },
    id: "github-trending",
  };
  const collection = await createAssessmentPipeline({
    archive: postgresAssessmentPipelineArchive,
    clock: () => new Date("2026-08-12T02:00:00.000Z"),
    createRunId: () => "collection-run-e2e-connector-failed",
    modelRuntime: { id: "fixture-runtime" },
    sourceConnectors: [failingConnector],
  }).runCollectionCycle("github-trending");
  assert.deepEqual(collection, {
    connectorId: "github-trending",
    errorMessage: "HTTP 429",
    runId: "collection-run-e2e-connector-failed",
    status: "failed",
  });
  const degradedResponse = await fetch(`${baseUrl}/api/brief`);
  const degradedBrief = await degradedResponse.json();
  assert.equal(degradedBrief.availability, "published");
  assert.equal(degradedBrief.signals[0]?.title, "openai/codex");
  assert.deepEqual(degradedBrief.connectors.find((connector: { name: string }) => connector.name === "GitHub Trending"), {
    caption: "公开趋势页 + 仓库补证",
    detail: "HTTP 429",
    name: "GitHub Trending",
    status: "采集失败",
    tone: "muted",
  });

  await postgresAssessmentPipelineArchive.markConnectorFresh({ collectedAt: "2026-08-12T02:00:00.000Z", connectorId: "github-trending" });
  const recoveredResponse = await fetch(`${baseUrl}/api/brief`);
  const recoveredBrief = await recoveredResponse.json();
  assert.deepEqual(recoveredBrief.connectors.find((connector: { name: string }) => connector.name === "GitHub Trending"), {
    caption: "公开趋势页 + 仓库补证",
    detail: null,
    name: "GitHub Trending",
    status: "新鲜",
    tone: "fresh",
  });
});

test("Hugging Face Trending 固定 Fixture 经真实 Archive 保留 Candidate、Evidence 与独立 Health", { concurrency: false }, async () => {
  const connector: SourceConnector = {
    collect: () => collectHuggingFaceTrending(async () => ({
      body: '<article class="overview-card-wrapper"><a href="/Qwen/Qwen3-8B"><h4>Qwen/Qwen3-8B</h4></a></article>',
      contentType: "text/html",
      url: "https://huggingface.co/models?sort=trending",
    })),
    id: "hugging-face-trending",
  };
  const result = await createAssessmentPipeline({
    archive: postgresAssessmentPipelineArchive,
    clock: () => new Date("2026-08-12T02:00:00.000Z"),
    createRunId: () => "collection-run-e2e-hugging-face",
    modelRuntime: { id: "fixture-runtime" },
    sourceConnectors: [connector],
  }).runCollectionCycle("hugging-face-trending");

  assert.deepEqual(result, {
    candidateCount: 1,
    connectorId: "hugging-face-trending",
    runId: "collection-run-e2e-hugging-face",
    status: "succeeded",
  });
  const candidateAndEvidence = await getDatabasePool().query<{
    canonical_identifier: string;
    source_title: string;
    source_url: string;
    trust: string;
  }>(
    `SELECT candidate.canonical_identifier, evidence.source_title, evidence.source_url, evidence.trust
    FROM radar_candidates candidate
    JOIN candidate_source_evidence candidate_evidence ON candidate_evidence.candidate_id = candidate.id
    JOIN source_evidence evidence ON evidence.id = candidate_evidence.evidence_id
    WHERE candidate.canonical_identifier = 'hugging-face:qwen/qwen3-8b'`,
  );
  assert.deepEqual(candidateAndEvidence.rows, [{
    canonical_identifier: "hugging-face:qwen/qwen3-8b",
    source_title: "Qwen/Qwen3-8B",
    source_url: "https://huggingface.co/Qwen/Qwen3-8B",
    trust: "untrusted",
  }]);

  const response = await fetch(`${baseUrl}/api/brief`);
  const brief = await response.json();
  assert.deepEqual(brief.connectors.find((item: { name: string }) => item.name === "Hugging Face"), {
    caption: "模型与 Spaces 热度",
    detail: null,
    name: "Hugging Face",
    status: "新鲜",
    tone: "fresh",
  });
});

test("Hugging Face 采集失败只更新自身 Health，GitHub 仍可独立成功", { concurrency: false }, async () => {
  let runNumber = 0;
  const pipeline = createAssessmentPipeline({
    archive: postgresAssessmentPipelineArchive,
    clock: () => new Date("2026-08-12T02:00:00.000Z"),
    createRunId: () => `collection-run-e2e-independent-health-${++runNumber}`,
    modelRuntime: { id: "fixture-runtime" },
    sourceConnectors: [
      {
        collect: async () => {
          throw new Error("Hugging Face unavailable");
        },
        id: "hugging-face-trending",
      },
      {
        collect: async () => ({
          candidates: [],
          collectedAt: "2026-08-12T02:00:00.000Z",
          connectorId: "github-trending",
          connectorVersion: "github-trending@fixture",
          warnings: [],
        }),
        id: "github-trending",
      },
    ],
  });

  assert.equal((await pipeline.runCollectionCycle("hugging-face-trending")).status, "failed");
  assert.equal((await pipeline.runCollectionCycle("github-trending")).status, "succeeded");
  const health = await getDatabasePool().query<{
    connector_id: string;
    detail: string | null;
    status: string;
  }>(
    "SELECT connector_id, status, detail FROM connector_health WHERE connector_id IN ('github-trending', 'hugging-face-trending') ORDER BY connector_id",
  );
  assert.deepEqual(health.rows, [
    { connector_id: "github-trending", detail: null, status: "新鲜" },
    { connector_id: "hugging-face-trending", detail: "Hugging Face unavailable", status: "采集失败" },
  ]);
});

test("Show HN 外链证据在真实 Archive 保持 Related Signal，独立帖子不强制合并", { concurrency: false }, async () => {
  const connector: SourceConnector = {
    collect: () => collectShowHn(async () => ({
      body: `
        <tr class="athing submission" id="49270040"><td><span class="titleline"><a href="https://demo.example">Show HN: First demo</a></span></td></tr>
        <tr class="athing submission" id="49270041"><td><span class="titleline"><a href="https://demo.example">Show HN: Second demo</a></span></td></tr>
      `,
      contentType: "text/html",
      url: "https://news.ycombinator.com/show",
    })),
    id: "show-hn",
  };
  const result = await createAssessmentPipeline({
    archive: postgresAssessmentPipelineArchive,
    clock: () => new Date("2026-08-12T02:00:00.000Z"),
    createRunId: () => "collection-run-e2e-show-hn",
    modelRuntime: { id: "fixture-runtime" },
    sourceConnectors: [connector],
  }).runCollectionCycle("show-hn");

  assert.deepEqual(result, { candidateCount: 2, connectorId: "show-hn", runId: "collection-run-e2e-show-hn", status: "succeeded" });
  const stored = await getDatabasePool().query<{
    association: string;
    candidate_id: string;
    source_title: string;
    source_url: string;
  }>(
    `SELECT candidate_evidence.association, candidate_evidence.candidate_id, evidence.source_title, evidence.source_url
    FROM candidate_source_evidence candidate_evidence
    JOIN source_evidence evidence ON evidence.id = candidate_evidence.evidence_id
    WHERE candidate_evidence.candidate_id LIKE 'show-hn:%'
    ORDER BY candidate_evidence.candidate_id`,
  );
  assert.deepEqual(stored.rows, [
    { association: "related", candidate_id: "show-hn:49270040", source_title: "Show HN: First demo", source_url: "https://demo.example/" },
    { association: "related", candidate_id: "show-hn:49270041", source_title: "Show HN: Second demo", source_url: "https://demo.example/" },
  ]);
  const health = await getDatabasePool().query<{ detail: string | null; status: string }>(
    "SELECT status, detail FROM connector_health WHERE connector_id = 'show-hn'",
  );
  assert.deepEqual(health.rows, [{ detail: null, status: "新鲜" }]);
});

test("Show HN 采集失败只更新自身 Connector Health", { concurrency: false }, async () => {
  const connector: SourceConnector = {
    collect: async () => { throw new Error("Show HN unavailable"); },
    id: "show-hn",
  };
  const result = await createAssessmentPipeline({
    archive: postgresAssessmentPipelineArchive,
    clock: () => new Date("2026-08-12T02:00:00.000Z"),
    createRunId: () => "collection-run-e2e-show-hn-failed",
    modelRuntime: { id: "fixture-runtime" },
    sourceConnectors: [connector],
  }).runCollectionCycle("show-hn");
  assert.deepEqual(result, {
    connectorId: "show-hn",
    errorMessage: "Show HN unavailable",
    runId: "collection-run-e2e-show-hn-failed",
    status: "failed",
  });
  const health = await getDatabasePool().query<{ detail: string | null; status: string }>(
    "SELECT status, detail FROM connector_health WHERE connector_id = 'show-hn'",
  );
  assert.deepEqual(health.rows, [{ detail: "Show HN unavailable", status: "采集失败" }]);
});

test("跨日发布不会改写前一日 Snapshot 与 Provenance", { concurrency: false }, async () => {
  const publish = (id: string, publishedAt: string, pipelineVersion: string, runtimeId: string) => createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(publishedAt),
    configurationVersion: "profile@v1",
    createBriefId: () => id,
    isCitationAccessible: async () => true,
    pipelineVersion,
    runtime: candidateAwareRuntime(runtimeId),
  }).publishDailyBrief();

  assert.deepEqual(await publish("brief-e2e-day-one", "2026-08-12T01:00:00.000Z", "assessment-pipeline@v1", "compatible:fixed-e2e-v1"), {
    briefId: "brief-e2e-day-one",
    signalCount: 1,
    status: "published",
  });
  await seedSecondCandidate();
  assert.deepEqual(await publish("brief-e2e-day-two", "2026-08-13T01:00:00.000Z", "assessment-pipeline@v2", "compatible:fixed-e2e-v2"), {
    briefId: "brief-e2e-day-two",
    signalCount: 1,
    status: "published",
  });

  const firstSnapshot = await getDatabasePool().query<{
    model_runtime_id: string;
    pipeline_version: string;
    ranking_policy_version: string;
    title: string;
  }>(
    `SELECT snapshot.pipeline_version, snapshot.ranking_policy_version, snapshot.model_runtime_id, signal.title
    FROM brief_snapshots snapshot
    JOIN radar_signals signal ON signal.brief_id = snapshot.id
    WHERE snapshot.id = $1`,
    ["brief-e2e-day-one"],
  );
  assert.deepEqual(firstSnapshot.rows, [{
    model_runtime_id: "compatible:fixed-e2e-v1",
    pipeline_version: "assessment-pipeline@v1",
    ranking_policy_version: "v0.1",
    title: "openai/codex",
  }]);
});

test("Radar Retrieval 仅返回已发布 Archive，可组合筛选、稳定分页并明确空状态", { concurrency: false }, async () => {
  const publish = (id: string, publishedAt: string) => createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(publishedAt),
    configurationVersion: "profile@v1",
    createBriefId: () => id,
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: candidateAwareRuntime("ollama:qwen3:8b"),
  }).publishDailyBrief();

  await seedUncitedEvidence();
  assert.equal((await publish("brief-e2e-retrieval-one", "2026-08-12T01:00:00.000Z")).status, "published");
  await seedSecondCandidate();
  assert.equal((await publish("brief-e2e-retrieval-two", "2026-08-13T01:00:00.000Z")).status, "published");
  await seedUnpublishedCandidate();

  const filteredResponse = await fetch(`${baseUrl}/api/retrieval?from=2026-08-12T00:00:00.000Z&to=2026-08-13T23:59:59.000Z&topic=%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7&signalType=project&subject=github%3Aopenai%2Fopenai-agents-js&limit=1&offset=0`);
  const filtered = await filteredResponse.json();
  assert.equal(filteredResponse.status, 200);
  assert.deepEqual(filtered.pagination, { hasMore: false, limit: 1, offset: 0 });
  assert.equal(filtered.availability, "results");
  assert.equal(filtered.results.length, 1);
  assert.equal(filtered.results[0]?.title, "openai/openai-agents-js");
  assert.equal(filtered.results[0]?.subject.canonicalIdentifier, "github:openai/openai-agents-js");
  assert.deepEqual(filtered.results[0]?.evidence, [{ label: "openai/openai-agents-js", source: "GitHub Trending", url: "https://github.com/openai/openai-agents-js" }]);
  assert.deepEqual(filtered.results[0]?.provenance, {
    configurationVersion: "profile@v1",
    modelRuntimeId: "ollama:qwen3:8b",
    pipelineVersion: "assessment-pipeline@v1",
    rankingPolicyVersion: "v0.1",
  });

  const firstPage = await fetch(`${baseUrl}/api/retrieval?limit=1&offset=0`);
  const firstPagePayload = await firstPage.json();
  assert.equal(firstPagePayload.results[0]?.title, "openai/openai-agents-js");
  assert.deepEqual(firstPagePayload.pagination, { hasMore: true, limit: 1, offset: 0 });
  const secondPage = await fetch(`${baseUrl}/api/retrieval?limit=1&offset=1`);
  const secondPagePayload = await secondPage.json();
  assert.equal(secondPagePayload.results[0]?.title, "openai/codex");
  assert.deepEqual(secondPagePayload.pagination, { hasMore: false, limit: 1, offset: 1 });

  const emptyResponse = await fetch(`${baseUrl}/api/retrieval?topic=%E4%B8%8D%E5%AD%98%E5%9C%A8`);
  const empty = await emptyResponse.json();
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(empty, { availability: "empty", pagination: { hasMore: false, limit: 20, offset: 0 }, results: [] });
  assert.doesNotMatch(JSON.stringify(firstPagePayload), /unpublished/);
  assert.doesNotMatch(JSON.stringify(secondPagePayload), /uncited/);
});
