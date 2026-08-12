import type { Candidate, SourceEvidence } from "./connectors/types.ts";
import { getDatabasePool, withTransaction } from "./database.ts";
import type { AssessmentPipelineArchive } from "./assessment-pipeline.ts";

export const postgresAssessmentPipelineArchive: AssessmentPipelineArchive = {
  async failCollectionRun({ errorMessage, finishedAt, runId }) {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE collection_runs SET finished_at = $2, status = 'failed', error_message = $3 WHERE id = $1",
        [runId, finishedAt, errorMessage],
      );
    });
  },

  async markConnectorFailed({ connectorId, detail }) {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE connector_health SET status = '采集失败', tone = 'muted', detail = $2 WHERE connector_id = $1",
        [connectorId, detail],
      );
    });
  },

  async markConnectorFresh({ collectedAt, connectorId, detail }) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE connector_health
        SET status = CASE WHEN $3::text IS NULL THEN '新鲜' ELSE '部分失败' END,
          tone = CASE WHEN $3::text IS NULL THEN 'fresh' ELSE 'delayed' END,
          last_success_at = $2,
          detail = $3
        WHERE connector_id = $1`,
        [connectorId, collectedAt, detail ?? null],
      );
    });
  },

  async startCollectionRun({ connectorId, runId, startedAt }) {
    await getDatabasePool().query(
      "INSERT INTO collection_runs (id, connector_id, started_at, status) VALUES ($1, $2, $3, 'running')",
      [runId, connectorId, startedAt],
    );
  },

  async succeedCollectionRun({ candidateCount, finishedAt, runId }) {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE collection_runs SET finished_at = $2, status = 'succeeded', candidate_count = $3 WHERE id = $1",
        [runId, finishedAt, candidateCount],
      );
    });
  },

  async upsertCandidate(candidate: Candidate) {
    const subjectId = `subject:${candidate.subjectCanonicalIdentifier}`;
    const candidateId = candidate.canonicalIdentifier;
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO radar_subjects (id, canonical_identifier, title, signal_type)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (canonical_identifier)
        DO UPDATE SET title = EXCLUDED.title, signal_type = EXCLUDED.signal_type, updated_at = NOW()`,
        [subjectId, candidate.subjectCanonicalIdentifier, candidate.title, candidate.signalType],
      );
      await client.query(
        `INSERT INTO radar_candidates (id, canonical_identifier, subject_canonical_identifier, connector_id, subject_id, signal_type, title, source_url,
          first_collected_at, last_collected_at, evaluation_status, signal_state, priority, ranking_score, ranking_policy_version,
          observation_count, selection_reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'evaluating', '新出现', '值得关注', 1, 'v0.1', 1, $10)
        ON CONFLICT (canonical_identifier)
        DO UPDATE SET connector_id = EXCLUDED.connector_id, title = EXCLUDED.title, source_url = EXCLUDED.source_url,
          last_collected_at = EXCLUDED.last_collected_at, observation_count = radar_candidates.observation_count + 1,
          evaluation_status = CASE
            WHEN radar_candidates.evaluation_status = 'assessment-delayed' THEN 'evaluating'
            ELSE radar_candidates.evaluation_status
          END,
          assessment_delay_detail = CASE
            WHEN radar_candidates.evaluation_status = 'assessment-delayed' THEN NULL
            ELSE radar_candidates.assessment_delay_detail
          END,
          signal_state = '持续升温', priority = CASE WHEN radar_candidates.observation_count + 1 >= 2 THEN '高优先级' ELSE '值得关注' END,
          ranking_score = radar_candidates.ranking_score + 1,
          selection_reason = '在 Observation Window 内第 ' || (radar_candidates.observation_count + 1) || ' 次被收集，仍处于评估队列。',
          updated_at = NOW()`,
        [
          candidateId,
          candidate.canonicalIdentifier,
          candidate.subjectCanonicalIdentifier,
          candidate.connectorId,
          subjectId,
          candidate.signalType,
          candidate.title,
          candidate.url,
          candidate.collectedAt,
          `${candidate.connectorId} 在 Observation Window 内新发现此 Candidate。`,
        ],
      );
    });
    return { id: candidateId };
  },

  async upsertSourceEvidence({ association, candidateId, evidence }: { association: "primary" | "related"; candidateId: string; evidence: SourceEvidence }) {
    await withTransaction(async (client) => {
      const result = await client.query<{ id: number }>(
        `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_title, source_url, collected_at, trust)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (canonical_identifier, connector_id, source_url)
        DO UPDATE SET source_title = EXCLUDED.source_title, collected_at = EXCLUDED.collected_at, updated_at = NOW()
        RETURNING id`,
        [
          evidence.canonicalIdentifier,
          evidence.connectorId,
          evidence.sourceName,
          evidence.sourceTitle,
          evidence.sourceUrl,
          evidence.collectedAt,
          evidence.trust,
        ],
      );
      const evidenceId = result.rows[0]?.id;
      if (evidenceId === undefined) throw new Error("无法保存 Source Evidence。");
      await client.query(
        `INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association)
        VALUES ($1, $2, $3)
        ON CONFLICT (candidate_id, evidence_id)
        DO UPDATE SET association = EXCLUDED.association`,
        [candidateId, evidenceId, association],
      );
    });
  },
};
