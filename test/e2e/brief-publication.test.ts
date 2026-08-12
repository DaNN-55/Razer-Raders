import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import type { GroundedAssessment, ModelRuntime } from "../../src/lib/radar/assessment-contract.ts";
import { postgresBriefPublicationArchive } from "../../src/lib/radar/brief-publication-archive.ts";
import { createBriefPublisher, type PublicationCandidate } from "../../src/lib/radar/brief-publication.ts";
import { recordCollectionCycle } from "../../src/lib/radar/collection-stage-recorder.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";

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

beforeEach(async () => {
  await getDatabasePool().query(
    "TRUNCATE TABLE pipeline_runs, radar_signals, brief_snapshots, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects RESTART IDENTITY CASCADE",
  );
  await seedCandidate();
});

after(async () => {
  await getDatabasePool().end();
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
  const storedSignals = await getDatabasePool().query<{ section_citations: GroundedAssessment["citations"]; title: string }>(
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
