import type { PublicationCandidate } from "../../src/lib/radar/brief-publication.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";

export async function seedPublicationCandidate(candidate: PublicationCandidate, collectedAt = new Date()) {
  const evidence = candidate.evidence[0];
  if (!evidence) throw new Error("Fixture Candidate 缺少 Source Evidence。");

  const database = getDatabasePool();
  const subjectId = `subject:${candidate.canonicalIdentifier}`;
  await database.query(
    "INSERT INTO radar_subjects (id, canonical_identifier, title, signal_type) VALUES ($1, $2, $3, $4)",
    [subjectId, candidate.canonicalIdentifier, candidate.title, "project"],
  );
  await database.query(
    `INSERT INTO radar_candidates (
      id, canonical_identifier, subject_canonical_identifier, connector_id, subject_id, signal_type, title, source_url,
      first_collected_at, last_collected_at, evaluation_status, signal_state, priority, ranking_score, ranking_policy_version,
      observation_count, selection_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'evaluating', $10, $11, $12, $13, 1, $14)`,
    [
      candidate.canonicalIdentifier,
      candidate.canonicalIdentifier,
      candidate.canonicalIdentifier,
      "github-trending",
      subjectId,
      "project",
      candidate.title,
      evidence.sourceUrl,
      collectedAt,
      candidate.signalState,
      candidate.priority,
      candidate.rankingScore,
      candidate.rankingPolicyVersion,
      candidate.selectionReason,
    ],
  );
  const insertedEvidence = await database.query<{ id: number }>(
    `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_title, source_url, collected_at, trust)
    VALUES ($1, $2, $3, $4, $5, $6, 'untrusted') RETURNING id`,
    [evidence.canonicalIdentifier, "github-trending", evidence.sourceName, evidence.sourceTitle, evidence.sourceUrl, collectedAt],
  );
  const evidenceId = insertedEvidence.rows[0]?.id;
  if (evidenceId === undefined) throw new Error("Fixture 未能写入 Source Evidence。");
  await database.query(
    "INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association) VALUES ($1, $2, 'primary')",
    [candidate.canonicalIdentifier, evidenceId],
  );
}
