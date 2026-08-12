import type { SourceEvidence } from "./connectors/types.ts";
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

  async markConnectorFresh({ collectedAt, connectorId }) {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE connector_health SET status = '新鲜', tone = 'fresh', last_success_at = $2, detail = NULL WHERE connector_id = $1",
        [connectorId, collectedAt],
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

  async upsertSourceEvidence(evidence: SourceEvidence) {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO source_evidence (canonical_identifier, connector_id, source_name, source_url, collected_at, trust)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (canonical_identifier, connector_id, source_url)
        DO UPDATE SET collected_at = EXCLUDED.collected_at, updated_at = NOW()`,
        [
          evidence.canonicalIdentifier,
          evidence.connectorId,
          evidence.sourceName,
          evidence.sourceUrl,
          evidence.collectedAt,
          evidence.trust,
        ],
      );
    });
  },
};
