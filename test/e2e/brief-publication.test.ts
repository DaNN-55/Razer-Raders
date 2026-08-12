import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import type { GroundedAssessment, ModelRuntime } from "../../src/lib/radar/assessment-contract.ts";
import { postgresBriefPublicationArchive } from "../../src/lib/radar/brief-publication-archive.ts";
import { createBriefPublisher, type PublicationCandidate } from "../../src/lib/radar/brief-publication.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";

const candidate: PublicationCandidate = {
  canonicalIdentifier: "github:openai/codex",
  evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
  priority: "值得关注",
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

function fixedRuntime(assessment: GroundedAssessment): ModelRuntime {
  return { assess: async () => assessment, id: "compatible:fixed-e2e" };
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

beforeEach(async () => {
  await getDatabasePool().query(
    "TRUNCATE TABLE radar_signals, brief_snapshots, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects RESTART IDENTITY CASCADE",
  );
  await seedCandidate();
});

after(async () => {
  await getDatabasePool().end();
});

test("固定 Runtime 经真实 PostgreSQL 发布后，API 仅读取新 Snapshot", { concurrency: false }, async () => {
  const publicationCandidates = await postgresBriefPublicationArchive.getCandidatesForPublication();
  assert.deepEqual(publicationCandidates, [candidate]);

  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-e2e-published",
    isCitationAccessible: async () => true,
    runtime: fixedRuntime(validAssessment),
  }).publishFirstBrief();

  assert.deepEqual(result, { briefId: "brief-e2e-published", signalCount: 1, status: "published" });
  const storedSignals = await getDatabasePool().query<{ section_citations: GroundedAssessment["citations"]; title: string }>(
    "SELECT title, section_citations FROM radar_signals WHERE brief_id = $1",
    ["brief-e2e-published"],
  );
  assert.equal(storedSignals.rows[0]?.title, "openai/codex");
  assert.deepEqual(storedSignals.rows[0]?.section_citations, validAssessment.citations);

  const response = await fetch(`${baseUrl}/api/brief`);
  const brief = await response.json();
  assert.equal(response.status, 200);
  assert.equal(brief.mode, "archive");
  assert.equal(brief.availability, "published");
  assert.equal(brief.signals[0]?.title, "openai/codex");
  assert.deepEqual(brief.signals[0]?.evidence, [{ label: "openai/codex", source: "GitHub Trending", url: "https://github.com/openai/codex" }]);
});

test("无效固定 Runtime 被拒绝后，真实 Archive 不会产生 Snapshot", { concurrency: false }, async () => {
  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-e2e-rejected",
    isCitationAccessible: async () => true,
    runtime: fixedRuntime({ ...validAssessment, citations: { happened: [], technicalBasis: [], whyNow: [] } }),
  }).publishFirstBrief();

  assert.deepEqual(result, { reason: "openai/codex：缺少 happened 的事实引用。", status: "rejected" });
  const snapshots = await getDatabasePool().query("SELECT id FROM brief_snapshots");
  assert.equal(snapshots.rowCount, 0);

  const response = await fetch(`${baseUrl}/api/brief`);
  const brief = await response.json();
  assert.equal(brief.availability, "evaluating");
  assert.deepEqual(brief.signals, []);
});
