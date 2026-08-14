import type { QueryResultRow } from "pg";
import type { Evidence, Signal } from "../../components/radar-data.ts";
import type { RadarRetrieval, RadarRetrievalFilter, RetrievedRadarSignal } from "./retrieval-contract.ts";

type RetrievalRow = QueryResultRow & {
  builder_value: Signal["builderValue"];
  evidence: Evidence[];
  happened: string;
  id: string;
  priority: Signal["priority"];
  product_opportunity: Signal["productOpportunity"];
  provenance_configuration_version: string;
  provenance_model_runtime_id: string;
  provenance_pipeline_version: string;
  provenance_ranking_policy_version: string;
  published_at: Date;
  risk: string;
  section_citations: RetrievedRadarSignal["sectionCitations"];
  signal_type: string;
  state: Signal["state"];
  subject_canonical_identifier: string;
  subject_title: string;
  summary: string;
  technical_basis: string;
  title: string;
  topics: string[];
  why_in_brief: string;
  why_now: string;
};

export type RadarRetrievalQuery = (text: string, values?: readonly unknown[]) => Promise<{ rows: QueryResultRow[] }>;

export function createRadarRetrievalReader({ query }: { query: RadarRetrievalQuery }) {
  return {
    async retrieve(filter: RadarRetrievalFilter): Promise<RadarRetrieval> {
      const conditions = ["snapshot.status = 'published'"];
      const values: unknown[] = [];
      const addValue = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      if (filter.from) conditions.push(`snapshot.published_at >= ${addValue(filter.from)}`);
      if (filter.to) conditions.push(`snapshot.published_at <= ${addValue(filter.to)}`);
      if (filter.topic) conditions.push(`signal.topics @> jsonb_build_array(${addValue(filter.topic)}::text)`);
      if (filter.signalType) conditions.push(`candidate.signal_type = ${addValue(filter.signalType)}`);
      if (filter.subject) conditions.push(`subject.canonical_identifier = ${addValue(filter.subject)}`);

      const limit = addValue(filter.limit + 1);
      const offset = addValue(filter.offset);
      const result = await query(
        `SELECT
          signal.id, signal.state, signal.priority, signal.title, signal.summary, signal.topics,
          signal.builder_value, signal.product_opportunity, signal.happened, signal.why_now, signal.why_in_brief,
          signal.technical_basis, signal.risk, signal.evidence, signal.section_citations,
          snapshot.published_at,
          snapshot.configuration_version AS provenance_configuration_version,
          snapshot.ranking_policy_version AS provenance_ranking_policy_version,
          snapshot.model_runtime_id AS provenance_model_runtime_id,
          snapshot.pipeline_version AS provenance_pipeline_version,
          candidate.signal_type,
          subject.canonical_identifier AS subject_canonical_identifier,
          subject.title AS subject_title
        FROM radar_signals signal
        JOIN brief_snapshots snapshot ON snapshot.id = signal.brief_id
        JOIN radar_candidates candidate ON candidate.id = signal.candidate_id
        JOIN radar_subjects subject ON subject.id = candidate.subject_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY snapshot.published_at DESC, signal.id ASC
        LIMIT ${limit} OFFSET ${offset}`,
        values,
      ) as { rows: RetrievalRow[] };
      const hasMore = result.rows.length > filter.limit;
      const rows = hasMore ? result.rows.slice(0, filter.limit) : result.rows;
      const verifiedEvidence = (signal: RetrievalRow) => {
        const citations = new Set(Object.values(signal.section_citations ?? {}).flat());
        return signal.evidence.filter((evidence) => citations.has(evidence.url));
      };
      return {
        availability: rows.length > 0 ? "results" : "empty",
        pagination: { hasMore, limit: filter.limit, offset: filter.offset },
        results: rows.map((signal) => ({
          builderValue: signal.builder_value,
          evidence: verifiedEvidence(signal),
          happened: signal.happened,
          id: signal.id,
          priority: signal.priority,
          productOpportunity: signal.product_opportunity,
          provenance: {
            configurationVersion: signal.provenance_configuration_version,
            modelRuntimeId: signal.provenance_model_runtime_id,
            pipelineVersion: signal.provenance_pipeline_version,
            rankingPolicyVersion: signal.provenance_ranking_policy_version,
          },
          publishedAt: signal.published_at.toISOString(),
          risk: signal.risk,
          sectionCitations: signal.section_citations,
          signalType: signal.signal_type,
          state: signal.state,
          subject: { canonicalIdentifier: signal.subject_canonical_identifier, title: signal.subject_title },
          summary: signal.summary,
          technicalBasis: signal.technical_basis,
          title: signal.title,
          topics: signal.topics,
          ...(signal.why_in_brief ? { whyInBrief: signal.why_in_brief } : {}),
          whyNow: signal.why_now,
        })),
      };
    },
  };
}
