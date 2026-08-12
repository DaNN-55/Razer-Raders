import type { QueryResultRow } from "pg";
import type { AssessmentState } from "./brief-contract.ts";

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

export type ArchiveQuery = (text: string, values?: readonly unknown[]) => Promise<{ rows: QueryResultRow[] }>;

export function createArchiveReader({ now, query }: { now: () => Date; query: ArchiveQuery }) {
  const observationWindowStart = () => new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    async getAssessmentState(): Promise<AssessmentState> {
      const result = await query(
        `SELECT COUNT(*)::integer AS candidate_count
        FROM radar_candidates
        WHERE evaluation_status = 'evaluating'
          AND last_collected_at >= $1`,
        [observationWindowStart()],
      ) as { rows: AssessmentStateRow[] };
      const candidateCount = result.rows[0]?.candidate_count ?? 0;

      return candidateCount > 0
        ? { candidateCount, status: "evaluating" as const }
        : { candidateCount: 0, status: "unpublished" as const };
    },

    async getEvaluatingCandidates(limit = 50) {
      const result = await query(
        `SELECT canonical_identifier, title, signal_state, priority, ranking_score, selection_reason, last_collected_at
        FROM radar_candidates
        WHERE evaluation_status = 'evaluating'
          AND last_collected_at >= $1
        ORDER BY ranking_score DESC, last_collected_at DESC
        LIMIT $2`,
        [observationWindowStart(), limit],
      ) as { rows: EvaluatingCandidateRow[] };

      return result.rows.map((candidate) => ({
        canonicalIdentifier: candidate.canonical_identifier,
        lastCollectedAt: candidate.last_collected_at.toISOString(),
        priority: candidate.priority,
        rankingScore: candidate.ranking_score,
        selectionReason: candidate.selection_reason,
        signalState: candidate.signal_state,
        title: candidate.title,
      }));
    },
  };
}
