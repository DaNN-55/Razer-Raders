import type { QueryResultRow } from "pg";
import type { Evidence, Signal } from "@/components/radar-data";
import { getDatabasePool } from "@/lib/radar/database";
import { createArchiveReader, type ArchiveQuery } from "@/lib/radar/archive-reader";
import type { AssessmentState, PublishedBrief, RadarConnector } from "@/lib/radar/brief-contract";

type SignalRow = QueryResultRow & {
  builder_value: Signal["builderValue"];
  display_index: number;
  evidence: Evidence[];
  happened: string;
  id: string;
  priority: Signal["priority"];
  product_opportunity: Signal["productOpportunity"];
  risk: string;
  section_citations: Partial<Record<"happened" | "summary" | "technicalBasis" | "whyNow", string[]>>;
  sources: string[];
  state: Signal["state"];
  summary: string;
  technical_basis: string;
  title: string;
  topics: string[];
  why_in_brief: string;
  why_now: string;
};

type ConnectorRow = QueryResultRow & RadarConnector;

type BriefRow = QueryResultRow & {
  configuration_version: string;
  id: string;
  model_runtime_id: string;
  pipeline_version: string;
  published_at: Date;
  ranking_policy_version: string;
};

function createProductionArchiveReader() {
  const database = getDatabasePool();
  return createArchiveReader({
    now: () => new Date(),
    query: ((text, values) => database.query(text, values as unknown[])) as ArchiveQuery,
  });
}

export async function getLatestPublishedBrief(): Promise<PublishedBrief | null> {
  const database = getDatabasePool();
  const brief = await database.query<BriefRow>(
    `SELECT id, published_at, configuration_version, ranking_policy_version, model_runtime_id, pipeline_version
    FROM brief_snapshots
    WHERE status = 'published'
    ORDER BY publication_day DESC
    LIMIT 1`,
  );
  const snapshot = brief.rows[0];
  if (!snapshot) return null;

  const signals = await database.query<SignalRow>(
    `SELECT id, display_index, state, priority, title, summary, topics, sources, builder_value, product_opportunity,
      happened, why_now, why_in_brief, technical_basis, risk, evidence, section_citations
    FROM radar_signals
    WHERE brief_id = $1
    ORDER BY display_index ASC`,
    [snapshot.id],
  );

  return {
    publishedAt: snapshot.published_at.toISOString(),
    provenance: {
      configurationVersion: snapshot.configuration_version,
      modelRuntimeId: snapshot.model_runtime_id,
      pipelineVersion: snapshot.pipeline_version,
      rankingPolicyVersion: snapshot.ranking_policy_version,
    },
    signals: signals.rows.map((signal) => ({
      builderValue: signal.builder_value,
      evidence: signal.evidence,
      happened: signal.happened,
      id: signal.id,
      index: String(signal.display_index).padStart(2, "0"),
      priority: signal.priority,
      productOpportunity: signal.product_opportunity,
      risk: signal.risk,
      sectionCitations: signal.section_citations,
      sources: signal.sources,
      state: signal.state,
      summary: signal.summary,
      technicalBasis: signal.technical_basis,
      title: signal.title,
      topics: signal.topics,
      ...(signal.why_in_brief ? { whyInBrief: signal.why_in_brief } : {}),
      whyNow: signal.why_now,
    } satisfies Signal)),
  };
}

export async function getConnectorHealth(): Promise<readonly RadarConnector[]> {
  const database = getDatabasePool();
  const result = await database.query<ConnectorRow>(
    "SELECT name, caption, status, tone, detail FROM connector_health ORDER BY CASE connector_id WHEN 'github-trending' THEN 1 WHEN 'hugging-face-trending' THEN 2 WHEN 'show-hn' THEN 3 WHEN 'official-watchlist' THEN 4 ELSE 5 END",
  );

  return result.rows;
}

export async function getAssessmentState(): Promise<AssessmentState> {
  return createProductionArchiveReader().getAssessmentState();
}

export async function getEvaluatingCandidates(limit = 50) {
  return createProductionArchiveReader().getEvaluatingCandidates(limit);
}
