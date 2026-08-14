import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { postgresAssessmentPipelineArchive } from "../../src/lib/radar/assessment-pipeline-archive.ts";
import { postgresEvidenceDigestArchive } from "../../src/lib/radar/evidence-digest-archive.ts";
import { createEvidenceEnricher } from "../../src/lib/radar/evidence-enrichment.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";
import type { Candidate } from "../../src/lib/radar/connectors/types.ts";

const candidate: Candidate = {
  canonicalIdentifier: "github:openai/codex",
  collectedAt: "2026-08-13T02:00:00.000Z",
  connectorId: "github-trending",
  evidence: [],
  signalType: "project",
  subjectCanonicalIdentifier: "github:openai/codex",
  title: "openai/codex",
  url: "https://github.com/openai/codex",
};

beforeEach(async () => {
  await getDatabasePool().query("TRUNCATE TABLE candidate_evidence_digests, evidence_digests, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects RESTART IDENTITY CASCADE");
  await postgresAssessmentPipelineArchive.upsertCandidate(candidate);
});

after(async () => {
  await getDatabasePool().end();
});

test("真实 PostgreSQL 保存有限 Digest、来源关联并按未变指纹复用", { concurrency: false }, async () => {
  const body = '<meta name="description" content="A local coding agent for developers to automate code reviews and implementation from a terminal.">';
  const enricher = createEvidenceEnricher({
    archive: postgresEvidenceDigestArchive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => ({ body, contentType: "text/html", url: source.url }),
  });

  await enricher.enrich(candidate);
  await enricher.enrich(candidate);
  const relatedCandidate: Candidate = {
    ...candidate,
    canonicalIdentifier: "show-hn:42",
    connectorId: "show-hn",
    evidence: [{
      canonicalIdentifier: "show-hn:42:link",
      collectedAt: candidate.collectedAt,
      connectorId: "show-hn",
      sourceName: "Hacker News Show HN",
      sourceTitle: "Show HN: Codex",
      sourceUrl: candidate.url,
      trust: "untrusted",
    }],
    subjectCanonicalIdentifier: "show-hn:42",
    url: "https://news.ycombinator.com/item?id=42",
  };
  await postgresAssessmentPipelineArchive.upsertCandidate(relatedCandidate);
  await enricher.enrich(relatedCandidate);

  const result = await getDatabasePool().query<{
    candidate_id: string;
    content_fingerprint: string;
    excerpts: string[];
    source_name: string;
    source_url: string;
  }>(
    `SELECT candidate_digest.candidate_id, digest.source_name, digest.source_url, digest.content_fingerprint, digest.excerpts
    FROM evidence_digests digest
    JOIN candidate_evidence_digests candidate_digest ON candidate_digest.digest_id = digest.id
    ORDER BY candidate_digest.candidate_id`,
  );

  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => row.candidate_id), [candidate.canonicalIdentifier, relatedCandidate.canonicalIdentifier].sort());
  assert.equal(result.rows[0]?.source_name, "GitHub repository description");
  assert.equal(result.rows[0]?.source_url, candidate.url);
  assert.equal(result.rows[0]?.content_fingerprint.length, 64);
  assert.deepEqual(result.rows[0]?.excerpts, ["A local coding agent for developers to automate code reviews and implementation from a terminal."]);
  assert.ok(!JSON.stringify(result.rows[0]).includes("<meta"));
});
