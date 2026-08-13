import type { QueryResultRow } from "pg";
import type { PublicationArchive, PublicationCandidate, PublishedSignalInput, ReadyPublicationAssessment } from "./brief-publication.ts";
import type { GroundedAssessment } from "./assessment-contract.ts";
import type { BriefProvenance } from "./brief-contract.ts";
import { getDatabasePool, withTransaction } from "./database.ts";

type CandidateRow = QueryResultRow & {
  canonical_identifier: string;
  evidence: PublicationCandidate["evidence"];
  priority: PublicationCandidate["priority"];
  ranking_policy_version: string;
  ranking_score: number;
  selection_reason: string;
  signal_state: PublicationCandidate["signalState"];
  title: string;
};

type ReadyCandidateRow = CandidateRow & {
  assessment_result: GroundedAssessment;
  configuration_version: string;
  runtime_id: string;
};

function hasPublicationEvidence(value: CandidateRow): boolean {
  return Array.isArray(value.evidence)
      && value.evidence.length > 0
    && value.evidence.every((evidence) => typeof evidence.canonicalIdentifier === "string"
      && typeof evidence.sourceName === "string"
      && typeof evidence.sourceTitle === "string"
      && typeof evidence.sourceUrl === "string");
}

export const postgresBriefPublicationArchive: PublicationArchive = {
  async getCandidatesForPublication(limit = 10) {
    const result = await getDatabasePool().query<CandidateRow>(
      `SELECT candidate.canonical_identifier, candidate.title, candidate.signal_state, candidate.priority,
        candidate.ranking_score, candidate.ranking_policy_version, candidate.selection_reason,
        jsonb_agg(jsonb_build_object(
          'canonicalIdentifier', evidence.canonical_identifier,
          'sourceName', evidence.source_name,
          'sourceTitle', evidence.source_title,
          'sourceUrl', evidence.source_url
        ) ORDER BY evidence.id) AS evidence
      FROM radar_candidates candidate
      JOIN candidate_source_evidence candidate_evidence ON candidate_evidence.candidate_id = candidate.id
      JOIN source_evidence evidence ON evidence.id = candidate_evidence.evidence_id
      WHERE candidate.evaluation_status = 'evaluating'
        AND candidate.last_collected_at >= NOW() - INTERVAL '7 days'
      GROUP BY candidate.id
      ORDER BY candidate.ranking_score DESC, candidate.last_collected_at DESC
      LIMIT $1`,
      [limit],
    );
    return result.rows.filter(hasPublicationEvidence).map((candidate) => ({
      canonicalIdentifier: candidate.canonical_identifier,
      evidence: candidate.evidence,
      priority: candidate.priority,
      rankingPolicyVersion: candidate.ranking_policy_version,
      rankingScore: candidate.ranking_score,
      selectionReason: candidate.selection_reason,
      signalState: candidate.signal_state,
      title: candidate.title,
    }));
  },

  async getReadyAssessments(limit = 10) {
    const result = await getDatabasePool().query<ReadyCandidateRow>(
      `SELECT candidate.canonical_identifier, candidate.title, candidate.signal_state, candidate.priority,
        candidate.ranking_score, candidate.ranking_policy_version, candidate.selection_reason,
        assessment.configuration_version, assessment.runtime_id, candidate.assessment_result,
        COALESCE(jsonb_agg(jsonb_build_object(
          'canonicalIdentifier', digest.canonical_identifier,
          'excerpts', digest.excerpts,
          'sourceName', digest.source_name,
          'sourceTitle', digest.source_title,
          'sourceUrl', digest.source_url
        ) ORDER BY digest.id) FILTER (WHERE digest.id IS NOT NULL), '[]'::jsonb) AS evidence
      FROM radar_candidates candidate
      JOIN candidate_tasks assessment ON assessment.candidate_id = candidate.id
        AND assessment.task_kind = 'assessment' AND assessment.status = 'completed'
        AND assessment.id = candidate.assessment_task_id
      LEFT JOIN candidate_task_evidence_digests task_digest ON task_digest.task_id = assessment.id
      LEFT JOIN evidence_digests digest ON digest.id = task_digest.digest_id
      WHERE candidate.evaluation_status = 'ready'
        AND candidate.last_collected_at >= NOW() - INTERVAL '7 days'
      GROUP BY candidate.id, assessment.id
      ORDER BY candidate.ranking_score DESC, candidate.last_collected_at DESC
      LIMIT $1`,
      [limit],
    );
    return result.rows.filter(hasPublicationEvidence).map((candidate) => ({
      assessment: candidate.assessment_result,
      candidate: {
        canonicalIdentifier: candidate.canonical_identifier,
        evidence: candidate.evidence,
        priority: candidate.priority,
        rankingPolicyVersion: candidate.ranking_policy_version,
        rankingScore: candidate.ranking_score,
        selectionReason: candidate.selection_reason,
        signalState: candidate.signal_state,
        title: candidate.title,
      },
      configurationVersion: candidate.configuration_version,
      runtimeId: candidate.runtime_id,
    } satisfies ReadyPublicationAssessment));
  },

  async hasPublishedBrief(publicationDay) {
    const result = await getDatabasePool().query(
      "SELECT 1 FROM brief_snapshots WHERE status = 'published' AND publication_day = $1 LIMIT 1",
      [publicationDay],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async markCandidateAssessmentDelayed({ candidateId, detail }) {
    await getDatabasePool().query(
      `UPDATE radar_candidates
      SET assessment_delay_detail = $2, evaluation_status = 'assessment-delayed', updated_at = NOW()
      WHERE id = $1`,
      [candidateId, detail],
    );
  },

  async publishBrief({ id, provenance, publicationDay, publishedAt, signals }: { id: string; provenance: BriefProvenance; publicationDay: string; publishedAt: string; signals: readonly PublishedSignalInput[] }) {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('razer-raders:brief:' || $1))", [publicationDay]);
      const existing = await client.query("SELECT 1 FROM brief_snapshots WHERE status = 'published' AND publication_day = $1 LIMIT 1", [publicationDay]);
      if (existing.rowCount) return "already-published" as const;

      await client.query(
        `INSERT INTO brief_snapshots (
          id, published_at, publication_day, status, configuration_version, ranking_policy_version, model_runtime_id, pipeline_version
        ) VALUES ($1, $2, $3, 'published', $4, $5, $6, $7)`,
        [
          id,
          publishedAt,
          publicationDay,
          provenance.configurationVersion,
          provenance.rankingPolicyVersion,
          provenance.modelRuntimeId,
          provenance.pipelineVersion,
        ],
      );
      for (const [index, signal] of signals.entries()) {
        await client.query(
          `INSERT INTO radar_signals (
            id, brief_id, candidate_id, display_index, state, priority, title, summary, topics, sources,
            builder_value, product_opportunity, happened, why_now, technical_basis, risk, evidence, section_citations
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )`,
          [
            `${id}:signal:${index + 1}`,
            id,
            signal.candidateId,
            index + 1,
            signal.state,
            signal.priority,
            signal.title,
            signal.summary,
            JSON.stringify(signal.topics),
            JSON.stringify(signal.sources),
            signal.builderValue,
            signal.productOpportunity,
            signal.happened,
            signal.whyNow,
            signal.technicalBasis,
            signal.risk,
            JSON.stringify(signal.evidence),
            JSON.stringify(signal.sectionCitations),
          ],
        );
        await client.query("UPDATE radar_candidates SET assessment_delay_detail = NULL, evaluation_status = 'published', updated_at = NOW() WHERE id = $1", [signal.candidateId]);
      }
      return "published" as const;
    });
  },

  async recordPipelineStage({ collectionRunId, detail, publicationDay, stage, status }) {
    await getDatabasePool().query(
      `INSERT INTO pipeline_runs (publication_day, collection_run_id, stage, status, detail, started_at, finished_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), CASE WHEN $4 = 'started' THEN NULL ELSE NOW() END)`,
      [publicationDay, collectionRunId ?? null, stage, status, detail ?? null],
    );
  },
};
