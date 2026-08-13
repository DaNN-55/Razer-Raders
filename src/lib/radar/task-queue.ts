import { createHash, randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { GroundedAssessment, ModelRuntime } from "./assessment-contract.ts";
import { validateAssessment, type PublicationCandidate } from "./brief-publication.ts";
import type { Candidate, SourceEvidence } from "./connectors/types.ts";
import type { EvidenceDigest, EvidenceEnrichmentResult } from "./evidence-enrichment.ts";
import { getDatabasePool, withTransaction } from "./database.ts";

const maxRuntimeAttempts = 3;

export type CandidateTaskKind = "assessment" | "enrichment";
export type CandidateTaskStatus = "completed" | "delayed" | "leased" | "queued" | "retryable";
export type CandidateLifecycleStatus = "待补证" | "补证中" | "评估中" | "评估失败待重试" | "评估延迟" | "证据不足未入选" | "已评估未入选" | "已评估待发布";

export type QueuedCandidate = Candidate & {
  primaryEvidence: readonly EvidenceDigest[];
};

export type ClaimedCandidateTask = {
  attemptCount: number;
  candidate: QueuedCandidate;
  configurationVersion: string;
  evidenceFingerprint: string;
  id: string;
  kind: CandidateTaskKind;
  runtimeId: string;
  claimedAt: string;
  workerId: string;
};

export type QueueStatistics = {
  averageDurationMs: number;
  completedThisCycle: number;
  estimatedDrainCount: number;
  estimatedDrainMs: number;
  pendingByState: Record<CandidateLifecycleStatus, number>;
  retryCount: number;
};

type TaskRow = QueryResultRow & {
  attempt_count: number;
  candidate_id: string;
  configuration_version: string;
  evidence_fingerprint: string;
  id: string;
  runtime_id: string;
  task_kind: CandidateTaskKind;
  claimed_by: string;
  claimed_at: Date;
};

type CandidateRow = QueryResultRow & {
  canonical_identifier: string;
  collected_at: Date;
  connector_id: Candidate["connectorId"];
  signal_type: Candidate["signalType"];
  subject_canonical_identifier: string;
  title: string;
  source_url: string;
};

type DigestRow = QueryResultRow & {
  canonical_identifier: string;
  content_fingerprint: string;
  excerpts: string[];
  fetched_at: Date;
  source_kind: EvidenceDigest["sourceKind"];
  source_name: string;
  source_title: string;
  source_url: string;
};

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function asDigest(row: DigestRow): EvidenceDigest {
  return {
    canonicalIdentifier: row.canonical_identifier,
    contentFingerprint: row.content_fingerprint,
    excerpts: row.excerpts,
    fetchedAt: row.fetched_at.toISOString(),
    sourceKind: row.source_kind,
    sourceName: row.source_name,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
  };
}

function emptyStatistics(): QueueStatistics {
  return {
    averageDurationMs: 0,
    completedThisCycle: 0,
    estimatedDrainCount: 0,
    estimatedDrainMs: 0,
    pendingByState: {
      "待补证": 0,
      "补证中": 0,
      "评估中": 0,
      "评估失败待重试": 0,
      "评估延迟": 0,
      "证据不足未入选": 0,
      "已评估未入选": 0,
      "已评估待发布": 0,
    },
    retryCount: 0,
  };
}

export type CandidateTaskArchive = {
  claimNext: (input: { leaseMs: number; now: Date; workerId: string }) => Promise<ClaimedCandidateTask | null>;
  completeAssessment: (input: { assessment: GroundedAssessment; task: ClaimedCandidateTask }) => Promise<void>;
  completeEnrichment: (input: { result: EvidenceEnrichmentResult; task: ClaimedCandidateTask }) => Promise<void>;
  enqueueEnrichment: (input: { candidate: Candidate; configurationVersion: string; force?: boolean; runtimeId: string }) => Promise<void>;
  fail: (input: { errorMessage: string; task: ClaimedCandidateTask }) => Promise<"delayed" | "retryable">;
  getStatistics: (input: { cycleStartedAt: Date }) => Promise<QueueStatistics>;
  release: (input: { task: ClaimedCandidateTask }) => Promise<void>;
};

export const postgresCandidateTaskArchive: CandidateTaskArchive = {
  async enqueueEnrichment({ candidate, configurationVersion, force = false, runtimeId }) {
    const evidenceFingerprint = fingerprint(candidate.evidence.map((evidence) => [evidence.canonicalIdentifier, evidence.sourceTitle, evidence.sourceUrl]));
    await withTransaction(async (client) => {
      const candidateState = await client.query<{ lifecycle_status: CandidateLifecycleStatus }>("SELECT lifecycle_status FROM radar_candidates WHERE id = $1", [candidate.canonicalIdentifier]);
      if (candidateState.rows[0]?.lifecycle_status === "已评估待发布" && !force) return;
      const queuedTask = await client.query(
        `INSERT INTO candidate_tasks (id, candidate_id, task_kind, status, evidence_fingerprint, configuration_version, runtime_id)
        VALUES ($1, $2, 'enrichment', 'queued', $3, $4, $5)
        ON CONFLICT (candidate_id, task_kind, evidence_fingerprint, configuration_version)
        DO UPDATE SET status = CASE WHEN candidate_tasks.status IN ('retryable', 'delayed') OR $6 THEN 'queued' ELSE candidate_tasks.status END,
          last_error = CASE WHEN candidate_tasks.status IN ('retryable', 'delayed') OR $6 THEN NULL ELSE candidate_tasks.last_error END,
          completed_at = CASE WHEN candidate_tasks.status IN ('retryable', 'delayed') OR $6 THEN NULL ELSE candidate_tasks.completed_at END
        WHERE candidate_tasks.status IN ('retryable', 'delayed') OR $6
        RETURNING id`,
        [randomUUID(), candidate.canonicalIdentifier, evidenceFingerprint, configurationVersion, runtimeId, force],
      );
      if (!queuedTask.rowCount) return;
      await client.query(
        `UPDATE radar_candidates
        SET lifecycle_status = '待补证', evaluation_status = 'queued', assessment_result = NULL, assessment_fingerprint = NULL, assessment_task_id = NULL, updated_at = NOW()
        WHERE id = $1 AND (lifecycle_status <> '已评估待发布' OR $2)`,
        [candidate.canonicalIdentifier, force],
      );
    });
  },

  async claimNext({ leaseMs, now, workerId }) {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const task = await withTransaction(async (client) => {
      await client.query(
        `UPDATE candidate_tasks
        SET status = 'retryable', lease_expires_at = NULL, last_error = COALESCE(last_error, 'Worker 租约已过期。')
        WHERE status = 'leased' AND lease_expires_at <= $1`,
        [now],
      );
      const result = await client.query<TaskRow>(
        `WITH next_task AS (
          SELECT task.id
          FROM candidate_tasks task
          JOIN radar_candidates candidate ON candidate.id = task.candidate_id
          WHERE task.status IN ('queued', 'retryable')
            AND candidate.last_collected_at >= $1::timestamptz - INTERVAL '7 days'
          ORDER BY CASE task.task_kind WHEN 'enrichment' THEN 0 ELSE 1 END,
            EXISTS (SELECT 1 FROM candidate_evidence_digests digest_link WHERE digest_link.candidate_id = candidate.id) DESC,
            (SELECT COUNT(*) FROM candidate_source_evidence source_link WHERE source_link.candidate_id = candidate.id) DESC,
            candidate.observation_count DESC, candidate.last_collected_at DESC, candidate.ranking_score DESC, task.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE candidate_tasks task
        SET status = 'leased', attempt_count = task.attempt_count + 1, claimed_by = $3, claimed_at = $1, lease_expires_at = $2,
          last_error = NULL
        FROM next_task
        WHERE task.id = next_task.id
        RETURNING task.id, task.candidate_id, task.task_kind, task.evidence_fingerprint, task.configuration_version, task.runtime_id, task.attempt_count, task.claimed_by, task.claimed_at`,
        [now, leaseExpiresAt, workerId],
      );
      const claimed = result.rows[0] ?? null;
      if (claimed) {
        await client.query(
          "UPDATE radar_candidates SET lifecycle_status = $2, evaluation_status = 'queued', updated_at = NOW() WHERE id = $1",
          [claimed.candidate_id, claimed.task_kind === "enrichment" ? "补证中" : "评估中"],
        );
      }
      return claimed;
    });
    if (!task) return null;
    const database = getDatabasePool();
    const [candidateResult, evidenceResult, digestResult] = await Promise.all([
      database.query<CandidateRow>(
        `SELECT canonical_identifier, connector_id, signal_type, subject_canonical_identifier, title, source_url, last_collected_at AS collected_at
        FROM radar_candidates WHERE id = $1`,
        [task.candidate_id],
      ),
      database.query<QueryResultRow & { canonical_identifier: string; collected_at: Date; connector_id: Candidate["connectorId"]; source_name: string; source_title: string; source_url: string; trust: "untrusted" }>(
        `SELECT evidence.canonical_identifier, evidence.collected_at, evidence.connector_id, evidence.source_name, evidence.source_title, evidence.source_url, evidence.trust
        FROM candidate_source_evidence candidate_evidence
        JOIN source_evidence evidence ON evidence.id = candidate_evidence.evidence_id
        WHERE candidate_evidence.candidate_id = $1 ORDER BY evidence.id`,
        [task.candidate_id],
      ),
      database.query<DigestRow>(
        `SELECT digest.canonical_identifier, digest.source_kind, digest.source_name, digest.source_title, digest.source_url,
          digest.fetched_at, digest.content_fingerprint, digest.excerpts
        FROM candidate_evidence_digests candidate_digest
        JOIN evidence_digests digest ON digest.id = candidate_digest.digest_id
        LEFT JOIN candidate_task_evidence_digests task_digest ON task_digest.digest_id = digest.id AND task_digest.task_id = $2
        WHERE candidate_digest.candidate_id = $1
          AND ($3 = 'enrichment' OR task_digest.task_id IS NOT NULL)
        ORDER BY digest.id`,
        [task.candidate_id, task.id, task.task_kind],
      ),
    ]);
    const candidate = candidateResult.rows[0];
    if (!candidate) throw new Error("任务关联的 Candidate 已不存在。");
    return {
      attemptCount: task.attempt_count,
      candidate: {
        canonicalIdentifier: candidate.canonical_identifier,
        collectedAt: candidate.collected_at.toISOString(),
        connectorId: candidate.connector_id,
        evidence: evidenceResult.rows.map((evidence) => ({
          canonicalIdentifier: evidence.canonical_identifier,
          collectedAt: evidence.collected_at.toISOString(),
          connectorId: evidence.connector_id,
          sourceName: evidence.source_name,
          sourceTitle: evidence.source_title,
          sourceUrl: evidence.source_url,
          trust: evidence.trust,
        } satisfies SourceEvidence)),
        primaryEvidence: digestResult.rows.map(asDigest),
        signalType: candidate.signal_type,
        subjectCanonicalIdentifier: candidate.subject_canonical_identifier,
        title: candidate.title,
        url: candidate.source_url,
      },
      configurationVersion: task.configuration_version,
      claimedAt: task.claimed_at.toISOString(),
      evidenceFingerprint: task.evidence_fingerprint,
      id: task.id,
      kind: task.task_kind,
      runtimeId: task.runtime_id,
      workerId: task.claimed_by,
    };
  },

  async completeEnrichment({ result, task }) {
    await withTransaction(async (client) => {
      const completedTask = await client.query(
        `UPDATE candidate_tasks SET status = 'completed', completed_at = NOW(), duration_ms = EXTRACT(EPOCH FROM (NOW() - claimed_at)) * 1000,
          lease_expires_at = NULL
        WHERE id = $1 AND status = 'leased' AND claimed_by = $2 AND claimed_at = $3
        RETURNING candidate_id`,
        [task.id, task.workerId, task.claimedAt],
      );
      if (!completedTask.rowCount) return;
      if (result.status === "enriched") {
        const assessmentFingerprint = fingerprint(result.digests.map((digest) => [digest.canonicalIdentifier, digest.contentFingerprint]));
        const assessmentTask = await client.query(
          `INSERT INTO candidate_tasks (id, candidate_id, task_kind, status, evidence_fingerprint, configuration_version, runtime_id)
          VALUES ($1, $2, 'assessment', 'queued', $3, $4, $5)
          ON CONFLICT (candidate_id, task_kind, evidence_fingerprint, configuration_version) DO NOTHING
          RETURNING id`,
          [randomUUID(), task.candidate.canonicalIdentifier, assessmentFingerprint, task.configurationVersion, task.runtimeId],
        );
        const assessmentTaskId = assessmentTask.rows[0]?.id;
        if (assessmentTaskId) {
          for (const digest of result.digests) {
            await client.query(
              `INSERT INTO candidate_task_evidence_digests (task_id, digest_id)
              SELECT $1, candidate_digest.digest_id
              FROM candidate_evidence_digests candidate_digest
              JOIN evidence_digests digest ON digest.id = candidate_digest.digest_id
              WHERE candidate_digest.candidate_id = $2
                AND digest.canonical_identifier = $3
                AND digest.content_fingerprint = $4
              ON CONFLICT DO NOTHING`,
              [assessmentTaskId, task.candidate.canonicalIdentifier, digest.canonicalIdentifier, digest.contentFingerprint],
            );
          }
          await client.query("UPDATE radar_candidates SET lifecycle_status = '评估中', evaluation_status = 'queued', updated_at = NOW() WHERE id = $1", [task.candidate.canonicalIdentifier]);
        }
      } else {
        await client.query("UPDATE radar_candidates SET lifecycle_status = '证据不足未入选', evaluation_status = 'not-selected', updated_at = NOW() WHERE id = $1", [task.candidate.canonicalIdentifier]);
      }
    });
  },

  async completeAssessment({ assessment, task }) {
    await withTransaction(async (client) => {
      const completedTask = await client.query(
        `UPDATE candidate_tasks SET status = 'completed', completed_at = NOW(), duration_ms = EXTRACT(EPOCH FROM (NOW() - claimed_at)) * 1000,
          lease_expires_at = NULL
        WHERE id = $1 AND status = 'leased' AND claimed_by = $2 AND claimed_at = $3
        RETURNING candidate_id`,
        [task.id, task.workerId, task.claimedAt],
      );
      if (!completedTask.rowCount) return;
      const selectedForPublication = assessment.builderValue !== "跳过";
      await client.query(
        `UPDATE radar_candidates
        SET lifecycle_status = $2, evaluation_status = $3, assessment_result = $4, assessment_fingerprint = $5, assessment_task_id = $6, updated_at = NOW()
        WHERE id = $1`,
        [task.candidate.canonicalIdentifier, selectedForPublication ? "已评估待发布" : "已评估未入选", selectedForPublication ? "ready" : "not-selected", JSON.stringify(assessment), task.evidenceFingerprint, task.id],
      );
    });
  },

  async fail({ errorMessage, task }) {
    const delayed = task.kind === "assessment" && task.attemptCount >= maxRuntimeAttempts;
    const status = delayed ? "delayed" : "retryable" as const;
    await withTransaction(async (client) => {
      const failedTask = await client.query(
        `UPDATE candidate_tasks
        SET status = $2, last_error = $3, lease_expires_at = NULL, completed_at = CASE WHEN $2 = 'delayed' THEN NOW() ELSE NULL END,
          duration_ms = EXTRACT(EPOCH FROM (NOW() - claimed_at)) * 1000
        WHERE id = $1 AND status = 'leased' AND claimed_by = $4 AND claimed_at = $5`,
        [task.id, status, errorMessage, task.workerId, task.claimedAt],
      );
      if (!failedTask.rowCount) return;
      await client.query(
        `UPDATE radar_candidates
        SET lifecycle_status = $2, evaluation_status = CASE WHEN $2 = '评估延迟' THEN 'assessment-delayed' ELSE 'queued' END,
          assessment_delay_detail = CASE WHEN $2 = '评估延迟' THEN $3 ELSE assessment_delay_detail END, updated_at = NOW()
        WHERE id = $1`,
        [task.candidate.canonicalIdentifier, delayed ? "评估延迟" : task.kind === "assessment" ? "评估失败待重试" : "待补证", errorMessage],
      );
    });
    return status;
  },

  async getStatistics({ cycleStartedAt }) {
    const database = getDatabasePool();
    const [states, metrics, pendingTasks] = await Promise.all([
      database.query<{ lifecycle_status: CandidateLifecycleStatus; candidate_count: number }>(
        "SELECT lifecycle_status, COUNT(*)::integer AS candidate_count FROM radar_candidates GROUP BY lifecycle_status",
      ),
      database.query<{ average_duration_ms: number | null; completed_this_cycle: number; retry_count: number }>(
        `SELECT COALESCE(AVG(duration_ms), 0)::integer AS average_duration_ms,
          COUNT(*) FILTER (WHERE completed_at >= $1)::integer AS completed_this_cycle,
          COUNT(*) FILTER (WHERE attempt_count > 1)::integer AS retry_count
        FROM candidate_tasks`,
        [cycleStartedAt],
      ),
      database.query<{ candidate_count: number }>("SELECT COUNT(*)::integer AS candidate_count FROM candidate_tasks WHERE status IN ('queued', 'retryable', 'leased')"),
    ]);
    const statistics = emptyStatistics();
    for (const state of states.rows) statistics.pendingByState[state.lifecycle_status] = state.candidate_count;
    const metric = metrics.rows[0];
    statistics.averageDurationMs = metric?.average_duration_ms ?? 0;
    statistics.completedThisCycle = metric?.completed_this_cycle ?? 0;
    statistics.retryCount = metric?.retry_count ?? 0;
    statistics.estimatedDrainCount = pendingTasks.rows[0]?.candidate_count ?? 0;
    statistics.estimatedDrainMs = statistics.estimatedDrainCount * statistics.averageDurationMs;
    return statistics;
  },

  async release({ task }) {
    await withTransaction(async (client) => {
      const releasedTask = await client.query<{ candidate_id: string }>(
        `UPDATE candidate_tasks
        SET status = 'queued', attempt_count = GREATEST(attempt_count - 1, 0), claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL
        WHERE id = $1 AND status = 'leased' AND claimed_by = $2 AND claimed_at = $3
        RETURNING candidate_id`,
        [task.id, task.workerId, task.claimedAt],
      );
      const candidateId = releasedTask.rows[0]?.candidate_id;
      if (candidateId) await client.query(
        "UPDATE radar_candidates SET lifecycle_status = '评估失败待重试', evaluation_status = 'queued', updated_at = NOW() WHERE id = $1",
        [candidateId],
      );
    });
  },
};

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "任务执行失败。";
}

export function createCandidateTaskWorker(input: {
  archive: CandidateTaskArchive;
  clock: () => Date;
  enrich: (candidate: Candidate, configurationVersion: string) => Promise<EvidenceEnrichmentResult>;
  getRuntime?: (configurationVersion: string) => Promise<ModelRuntime | null>;
  leaseMs?: number;
  concurrency?: number;
  maxTasks: number;
  runtime?: ModelRuntime;
  timeBudgetMs: number;
  workerId: string;
}) {
  const { archive, clock, enrich, maxTasks, runtime, timeBudgetMs, workerId } = input;
  const concurrency = input.concurrency ?? 1;
  const leaseMs = input.leaseMs ?? Math.max(timeBudgetMs, 60_000);

  return {
    async runCycle() {
      const deadline = clock().getTime() + timeBudgetMs;
      let completed = 0;
      let runtimeUnavailable = false;
      while (completed < maxTasks && clock().getTime() < deadline && !runtimeUnavailable) {
        const batch: ClaimedCandidateTask[] = [];
        while (batch.length < concurrency && completed + batch.length < maxTasks && clock().getTime() < deadline) {
          const task = await archive.claimNext({ leaseMs, now: clock(), workerId });
          if (!task) break;
          batch.push(task);
        }
        if (!batch.length) break;
        await Promise.all(batch.map(async (task) => {
          try {
          if (task.kind === "enrichment") {
            const result = await enrich(task.candidate, task.configurationVersion);
            if (result.status === "failed") await archive.fail({ errorMessage: result.errorMessage ?? "补证失败。", task });
            else await archive.completeEnrichment({ result, task });
          } else {
            const taskRuntime = input.getRuntime ? await input.getRuntime(task.configurationVersion) : runtime ?? null;
            if (!taskRuntime || taskRuntime.id !== task.runtimeId) {
              runtimeUnavailable = true;
              await archive.release({ task });
              return;
            }
            if (!task.candidate.primaryEvidence.length) throw new Error("缺少 Primary Evidence，不能进入模型评估。");
            const assessableCandidate = {
              canonicalIdentifier: task.candidate.canonicalIdentifier,
              evidence: task.candidate.primaryEvidence.map((evidence) => ({
                canonicalIdentifier: evidence.canonicalIdentifier,
                excerpts: evidence.excerpts,
                sourceName: evidence.sourceName,
                sourceTitle: evidence.sourceTitle,
                sourceUrl: evidence.sourceUrl,
              })),
              priority: "值得关注",
              rankingPolicyVersion: "v0.1",
              rankingScore: 0,
              selectionReason: "持久化队列完成补证后进入评估。",
              signalState: "新出现",
              title: task.candidate.title,
            } satisfies PublicationCandidate;
            const assessment = await taskRuntime.assess(assessableCandidate, { signal: AbortSignal.timeout(Math.max(1, deadline - clock().getTime())) });
            const validationError = validateAssessment(assessableCandidate, assessment);
            if (validationError) throw new Error(validationError);
            await archive.completeAssessment({ assessment, task });
          }
          } catch (error) {
            await archive.fail({ errorMessage: failureMessage(error), task });
          }
        }));
        completed += batch.length;
      }
      return completed;
    },
  };
}
