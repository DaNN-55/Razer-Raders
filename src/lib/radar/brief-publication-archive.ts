import type { QueryResultRow } from "pg";
import type { PublicationArchive, PublicationCandidate, PublishedSignalInput } from "./brief-publication.ts";
import { getDatabasePool, withTransaction } from "./database.ts";

type CandidateRow = QueryResultRow & {
  canonical_identifier: string;
  evidence: PublicationCandidate["evidence"];
  priority: PublicationCandidate["priority"];
  ranking_score: number;
  selection_reason: string;
  signal_state: PublicationCandidate["signalState"];
  title: string;
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
  async getCandidatesForPublication() {
    const result = await getDatabasePool().query<CandidateRow>(
      `SELECT candidate.canonical_identifier, candidate.title, candidate.signal_state, candidate.priority,
        candidate.ranking_score, candidate.selection_reason,
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
      LIMIT 10`,
    );
    return result.rows.filter(hasPublicationEvidence).map((candidate) => ({
      canonicalIdentifier: candidate.canonical_identifier,
      evidence: candidate.evidence,
      priority: candidate.priority,
      rankingScore: candidate.ranking_score,
      selectionReason: candidate.selection_reason,
      signalState: candidate.signal_state,
      title: candidate.title,
    }));
  },

  async hasPublishedBrief() {
    const result = await getDatabasePool().query("SELECT 1 FROM brief_snapshots WHERE status = 'published' LIMIT 1");
    return (result.rowCount ?? 0) > 0;
  },

  async publishBrief({ id, publishedAt, signals }: { id: string; publishedAt: string; signals: readonly PublishedSignalInput[] }) {
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('razer-raders:first-published-brief'))");
      const existing = await client.query("SELECT 1 FROM brief_snapshots WHERE status = 'published' LIMIT 1");
      if (existing.rowCount) throw new Error("首份 Brief 已发布，拒绝覆盖不可变 Snapshot。");

      await client.query(
        "INSERT INTO brief_snapshots (id, published_at, status) VALUES ($1, $2, 'published')",
        [id, publishedAt],
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
        await client.query("UPDATE radar_candidates SET evaluation_status = 'published', updated_at = NOW() WHERE id = $1", [signal.candidateId]);
      }
    });
  },
};
