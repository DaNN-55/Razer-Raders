import assert from "node:assert/strict";
import test from "node:test";
import { createCandidateTaskWorker, type CandidateTaskArchive, type ClaimedCandidateTask } from "../src/lib/radar/task-queue.ts";
import { createQueueGetHandler } from "../src/lib/radar/task-queue-route.ts";

const enrichmentTask: ClaimedCandidateTask = {
  attemptCount: 1,
  candidate: {
    canonicalIdentifier: "github:openai/codex",
    collectedAt: "2026-08-13T01:00:00.000Z",
    connectorId: "github-trending",
    evidence: [],
    primaryEvidence: [],
    signalType: "project",
    subjectCanonicalIdentifier: "github:openai/codex",
    title: "openai/codex",
    url: "https://github.com/openai/codex",
  },
  configurationVersion: "profile@v1",
  claimedAt: "2026-08-13T01:00:00.000Z",
  evidenceFingerprint: "discovery-fingerprint",
  id: "task-1",
  kind: "enrichment",
  runtimeId: "ollama:qwen3",
  workerId: "worker-1",
};

test("队列 Worker 在同一周期内领取补证任务并将结果交给持久化边界", async () => {
  const completed: string[] = [];
  const archive: CandidateTaskArchive = {
    claimNext: async () => completed.length ? null : enrichmentTask,
    completeAssessment: async () => undefined,
    completeEnrichment: async ({ task }) => { completed.push(task.id); },
    enqueueEnrichment: async () => undefined,
    fail: async () => "retryable",
    getStatistics: async () => ({
      averageDurationMs: 0,
      completedThisCycle: 0,
      estimatedDrainCount: 0,
      estimatedDrainMs: 0,
      pendingByState: { "待补证": 0, "补证中": 0, "评估中": 0, "评估失败待重试": 0, "评估延迟": 0, "证据不足未入选": 0, "已评估未入选": 0, "已评估待发布": 0 },
      retryCount: 0,
    }),
    release: async () => undefined,
    requeueReadyAssessments: async () => 0,
  };
  const worker = createCandidateTaskWorker({
    archive,
    clock: () => new Date("2026-08-13T01:00:00.000Z"),
    enrich: async () => ({ candidateCanonicalIdentifier: enrichmentTask.candidate.canonicalIdentifier, digests: [], status: "insufficient-evidence" }),
    maxTasks: 5,
    runtime: { assess: async () => { throw new Error("不应评估"); }, id: "ollama:qwen3" },
    timeBudgetMs: 10_000,
    workerId: "worker-1",
  });

  assert.equal(await worker.runCycle(), 1);
  assert.deepEqual(completed, ["task-1"]);
});

test("只读队列接口返回生命周期待处理数与运行指标", async () => {
  const response = await createQueueGetHandler(async () => ({
    averageDurationMs: 120,
    completedThisCycle: 3,
    estimatedDrainCount: 4,
    estimatedDrainMs: 480,
    pendingByState: { "待补证": 1, "补证中": 0, "评估中": 1, "评估失败待重试": 1, "评估延迟": 0, "证据不足未入选": 0, "已评估未入选": 0, "已评估待发布": 1 },
    retryCount: 2,
  }))();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    averageDurationMs: 120,
    completedThisCycle: 3,
    estimatedDrainCount: 4,
    estimatedDrainMs: 480,
    pendingByState: { "待补证": 1, "补证中": 0, "评估中": 1, "评估失败待重试": 1, "评估延迟": 0, "证据不足未入选": 0, "已评估未入选": 0, "已评估待发布": 1 },
    retryCount: 2,
  });
});

test("队列 Worker 受配置并发限制，同时最多执行指定数量的任务", async () => {
  const tasks = [enrichmentTask, { ...enrichmentTask, id: "task-2", candidate: { ...enrichmentTask.candidate, canonicalIdentifier: "github:openai/second" } }];
  let active = 0;
  let maximumActive = 0;
  const archive: CandidateTaskArchive = {
    claimNext: async () => tasks.shift() ?? null,
    completeAssessment: async () => undefined,
    completeEnrichment: async () => undefined,
    enqueueEnrichment: async () => undefined,
    fail: async () => "retryable",
    getStatistics: async () => ({ averageDurationMs: 0, completedThisCycle: 0, estimatedDrainCount: 0, estimatedDrainMs: 0, pendingByState: { "待补证": 0, "补证中": 0, "评估中": 0, "评估失败待重试": 0, "评估延迟": 0, "证据不足未入选": 0, "已评估未入选": 0, "已评估待发布": 0 }, retryCount: 0 }),
    release: async () => undefined,
    requeueReadyAssessments: async () => 0,
  };
  const worker = createCandidateTaskWorker({
    archive,
    clock: () => new Date("2026-08-13T01:00:00.000Z"),
    concurrency: 2,
    enrich: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return { candidateCanonicalIdentifier: "github:openai/codex", digests: [], status: "insufficient-evidence" as const };
    },
    maxTasks: 5,
    runtime: { assess: async () => { throw new Error("不应评估"); }, id: "ollama:qwen3" },
    timeBudgetMs: 10_000,
    workerId: "worker-1",
  });

  assert.equal(await worker.runCycle(), 2);
  assert.equal(maximumActive, 2);
});

test("未配置模型时仍执行补证，并释放不能评估的任务", async () => {
  const assessmentTask = { ...enrichmentTask, id: "task-assessment", kind: "assessment" as const, candidate: { ...enrichmentTask.candidate, primaryEvidence: [{ canonicalIdentifier: "primary:github", contentFingerprint: "a".repeat(64), excerpts: ["Evidence"], fetchedAt: enrichmentTask.claimedAt, sourceKind: "github-repository-description" as const, sourceName: "GitHub", sourceTitle: "codex", sourceUrl: enrichmentTask.candidate.url }] } };
  const tasks = [enrichmentTask, assessmentTask];
  const completed: string[] = [];
  const released: string[] = [];
  const archive: CandidateTaskArchive = {
    claimNext: async () => tasks.shift() ?? null,
    completeAssessment: async () => undefined,
    completeEnrichment: async ({ task }) => { completed.push(task.id); },
    enqueueEnrichment: async () => undefined,
    fail: async () => "retryable",
    getStatistics: async () => ({ averageDurationMs: 0, completedThisCycle: 0, estimatedDrainCount: 0, estimatedDrainMs: 0, pendingByState: { "待补证": 0, "补证中": 0, "评估中": 0, "评估失败待重试": 0, "评估延迟": 0, "证据不足未入选": 0, "已评估未入选": 0, "已评估待发布": 0 }, retryCount: 0 }),
    release: async ({ task }) => { released.push(task.id); },
    requeueReadyAssessments: async () => 0,
  };

  const worker = createCandidateTaskWorker({
    archive,
    clock: () => new Date("2026-08-13T01:00:00.000Z"),
    enrich: async () => ({ candidateCanonicalIdentifier: enrichmentTask.candidate.canonicalIdentifier, digests: [], status: "insufficient-evidence" }),
    maxTasks: 5,
    timeBudgetMs: 10_000,
    workerId: "worker-1",
  });

  assert.equal(await worker.runCycle(), 2);
  assert.deepEqual(completed, ["task-1"]);
  assert.deepEqual(released, ["task-assessment"]);
});

test("模型报告证据不足时完成任务而不进入运行时失败重试", async () => {
  const assessmentTask: ClaimedCandidateTask = {
    ...enrichmentTask,
    id: "assessment-insufficient",
    kind: "assessment",
    candidate: {
      ...enrichmentTask.candidate,
      primaryEvidence: [{ canonicalIdentifier: "primary:github", contentFingerprint: "a".repeat(64), excerpts: ["A local coding agent."], fetchedAt: enrichmentTask.claimedAt, sourceKind: "github-repository-description", sourceName: "GitHub", sourceTitle: "agent", sourceUrl: enrichmentTask.candidate.url }],
    },
  };
  const completed: string[] = [];
  const failures: string[] = [];
  const archive: CandidateTaskArchive = {
    claimNext: async () => completed.length || failures.length ? null : assessmentTask,
    completeAssessment: async ({ task }) => { completed.push(task.id); },
    completeEnrichment: async () => undefined,
    enqueueEnrichment: async () => undefined,
    fail: async ({ task }) => { failures.push(task.id); return "retryable"; },
    getStatistics: async () => ({ averageDurationMs: 0, completedThisCycle: 0, estimatedDrainCount: 0, estimatedDrainMs: 0, pendingByState: { "待补证": 0, "补证中": 0, "评估中": 0, "评估失败待重试": 0, "评估延迟": 0, "证据不足未入选": 0, "已评估未入选": 0, "已评估待发布": 0 }, retryCount: 0 }),
    release: async () => undefined,
    requeueReadyAssessments: async () => 0,
  };
  const worker = createCandidateTaskWorker({
    archive,
    clock: () => new Date("2026-08-14T01:00:00.000Z"),
    enrich: async () => ({ candidateCanonicalIdentifier: assessmentTask.candidate.canonicalIdentifier, digests: [], status: "insufficient-evidence" }),
    maxTasks: 1,
    runtime: { assess: async () => ({ assessmentOutcome: "insufficient-evidence", assessmentReason: "Primary Evidence 未说明具体使用场景。" } as never), id: "ollama:qwen3" },
    timeBudgetMs: 10_000,
    workerId: "worker-1",
  });

  assert.equal(await worker.runCycle(), 1);
  assert.deepEqual(completed, ["assessment-insufficient"]);
  assert.deepEqual(failures, []);
});
