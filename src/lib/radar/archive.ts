import type { QueryResultRow } from "pg";
import type { Evidence, Signal } from "@/components/radar-data";
import { getDatabasePool } from "@/lib/radar/database";
import type { RadarConnector } from "@/lib/radar/brief";

type SignalRow = QueryResultRow & {
  builder_value: Signal["builderValue"];
  display_index: number;
  evidence: Evidence[];
  happened: string;
  id: string;
  priority: Signal["priority"];
  product_opportunity: Signal["productOpportunity"];
  risk: string;
  sources: string[];
  state: Signal["state"];
  summary: string;
  technical_basis: string;
  title: string;
  topics: string[];
  why_now: string;
};

type ConnectorRow = QueryResultRow & RadarConnector;

type BriefRow = QueryResultRow & {
  id: string;
  published_at: Date;
};

type AssessmentStateRow = QueryResultRow & {
  candidate_count: number;
};

type EvaluatingCandidateRow = QueryResultRow & {
  canonical_identifier: string;
  last_collected_at: Date;
  priority: string;
  ranking_score: number;
  selection_reason: string;
  signal_state: string;
  title: string;
};

export async function getLatestPublishedBrief() {
  const database = getDatabasePool();
  const brief = await database.query<BriefRow>("SELECT id, published_at FROM brief_snapshots WHERE status = 'published' ORDER BY published_at DESC LIMIT 1");
  const snapshot = brief.rows[0];
  if (!snapshot) return null;

  const signals = await database.query<SignalRow>(
    `SELECT id, display_index, state, priority, title, summary, topics, sources, builder_value, product_opportunity,
      happened, why_now, technical_basis, risk, evidence
    FROM radar_signals
    WHERE brief_id = $1
    ORDER BY display_index ASC`,
    [snapshot.id],
  );

  return {
    publishedAt: snapshot.published_at.toISOString(),
    signals: signals.rows.map((signal) => ({
      builderValue: signal.builder_value,
      evidence: signal.evidence,
      happened: signal.happened,
      id: signal.id,
      index: String(signal.display_index).padStart(2, "0"),
      priority: signal.priority,
      productOpportunity: signal.product_opportunity,
      risk: signal.risk,
      sources: signal.sources,
      state: signal.state,
      summary: signal.summary,
      technicalBasis: signal.technical_basis,
      title: signal.title,
      topics: signal.topics,
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

export async function getAssessmentState() {
  const database = getDatabasePool();
  const result = await database.query<AssessmentStateRow>(
    `SELECT COUNT(*)::integer AS candidate_count
    FROM radar_candidates
    WHERE evaluation_status = 'evaluating'
      AND last_collected_at >= NOW() - INTERVAL '7 days'`,
  );
  const candidateCount = result.rows[0]?.candidate_count ?? 0;

  return candidateCount > 0
    ? { candidateCount, status: "evaluating" as const }
    : { candidateCount: 0, status: "unpublished" as const };
}

export async function getEvaluatingCandidates(limit = 50) {
  const database = getDatabasePool();
  const result = await database.query<EvaluatingCandidateRow>(
    `SELECT canonical_identifier, title, signal_state, priority, ranking_score, selection_reason, last_collected_at
    FROM radar_candidates
    WHERE evaluation_status = 'evaluating'
      AND last_collected_at >= NOW() - INTERVAL '7 days'
    ORDER BY ranking_score DESC, last_collected_at DESC
    LIMIT $1`,
    [limit],
  );

  return result.rows.map((candidate) => ({
    canonicalIdentifier: candidate.canonical_identifier,
    lastCollectedAt: candidate.last_collected_at.toISOString(),
    priority: candidate.priority,
    rankingScore: candidate.ranking_score,
    selectionReason: candidate.selection_reason,
    signalState: candidate.signal_state,
    title: candidate.title,
  }));
}
