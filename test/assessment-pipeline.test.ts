import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssessmentPipeline,
  type AssessmentPipelineArchive,
  type ModelRuntime,
  type SourceConnector,
} from "../src/lib/radar/assessment-pipeline.ts";
import type { Candidate, CollectionResult, SourceEvidence } from "../src/lib/radar/connectors/types.ts";

type RecordedRun = {
  candidateCount: number;
  connectorId: string;
  errorMessage?: string;
  finishedAt?: string;
  id: string;
  startedAt: string;
  status: "failed" | "running" | "succeeded";
};

class InMemoryRadarArchive implements AssessmentPipelineArchive {
  readonly candidates = new Map<string, Candidate>();
  readonly connectorHealth = new Map<string, { detail: string | null; lastSuccessAt: string | null; status: string; tone: string }>();
  readonly evidence = new Map<string, SourceEvidence>();
  readonly runs = new Map<string, RecordedRun>();

  async failCollectionRun(input: { errorMessage: string; finishedAt: string; runId: string }) {
    const run = this.runs.get(input.runId);
    if (!run) throw new Error("找不到采集运行记录。");
    run.errorMessage = input.errorMessage;
    run.finishedAt = input.finishedAt;
    run.status = "failed";
  }

  async markConnectorFailed(input: { connectorId: string; detail: string }) {
    this.connectorHealth.set(input.connectorId, { detail: input.detail, lastSuccessAt: null, status: "采集失败", tone: "muted" });
  }

  async markConnectorFresh(input: { collectedAt: string; connectorId: string }) {
    this.connectorHealth.set(input.connectorId, { detail: null, lastSuccessAt: input.collectedAt, status: "新鲜", tone: "fresh" });
  }

  async startCollectionRun(input: { connectorId: string; runId: string; startedAt: string }) {
    this.runs.set(input.runId, { candidateCount: 0, connectorId: input.connectorId, id: input.runId, startedAt: input.startedAt, status: "running" });
  }

  async succeedCollectionRun(input: { candidateCount: number; finishedAt: string; runId: string }) {
    const run = this.runs.get(input.runId);
    if (!run) throw new Error("找不到采集运行记录。");
    run.candidateCount = input.candidateCount;
    run.finishedAt = input.finishedAt;
    run.status = "succeeded";
  }

  async upsertSourceEvidence(evidence: SourceEvidence) {
    this.evidence.set(`${evidence.canonicalIdentifier}:${evidence.connectorId}:${evidence.sourceUrl}`, evidence);
  }

  async upsertCandidate(candidate: Candidate) {
    this.candidates.set(candidate.canonicalIdentifier, candidate);
  }
}

const fixtureRuntime: ModelRuntime = { id: "fixture-runtime" };

function collectionResult(collectedAt: string): CollectionResult {
  const evidence: SourceEvidence = {
    canonicalIdentifier: "github:openai/codex",
    collectedAt,
    connectorId: "github-trending",
    sourceName: "GitHub Trending",
    sourceUrl: "https://github.com/openai/codex",
    trust: "untrusted",
  };

  return {
    candidates: [{
      canonicalIdentifier: evidence.canonicalIdentifier,
      collectedAt,
      connectorId: evidence.connectorId,
      evidence: [evidence],
      signalType: "project",
      title: "openai/codex",
      url: evidence.sourceUrl,
    }],
    collectedAt,
    connectorId: "github-trending",
    connectorVersion: "github-trending@fixture",
    warnings: [],
  };
}

test("固定 Connector Fixture 在重复采集后保留一条 Source Evidence，并更新健康状态和运行记录", async () => {
  const archive = new InMemoryRadarArchive();
  const collections = [
    collectionResult("2026-08-12T01:00:00.000Z"),
    collectionResult("2026-08-12T03:00:00.000Z"),
  ];
  const connector: SourceConnector = {
    id: "github-trending",
    collect: async () => collections.shift() ?? collectionResult("2026-08-12T03:00:00.000Z"),
  };
  const runIds = ["run-1", "run-2"];
  const clockValues = [
    new Date("2026-08-12T01:00:01.000Z"),
    new Date("2026-08-12T01:00:02.000Z"),
    new Date("2026-08-12T03:00:01.000Z"),
    new Date("2026-08-12T03:00:02.000Z"),
  ];
  const pipeline = createAssessmentPipeline({
    archive,
    clock: () => clockValues.shift() ?? new Date("2026-08-12T03:00:02.000Z"),
    createRunId: () => runIds.shift() ?? "unexpected-run",
    modelRuntime: fixtureRuntime,
    sourceConnectors: [connector],
  });

  const first = await pipeline.runCollectionCycle("github-trending");
  const second = await pipeline.runCollectionCycle("github-trending");

  assert.deepEqual(first, { candidateCount: 1, connectorId: "github-trending", runId: "run-1", status: "succeeded" });
  assert.deepEqual(second, { candidateCount: 1, connectorId: "github-trending", runId: "run-2", status: "succeeded" });
  assert.equal(archive.evidence.size, 1);
  assert.equal(archive.candidates.size, 1);
  assert.equal([...archive.evidence.values()][0]?.collectedAt, "2026-08-12T03:00:00.000Z");
  assert.deepEqual(archive.connectorHealth.get("github-trending"), {
    detail: null,
    lastSuccessAt: "2026-08-12T03:00:00.000Z",
    status: "新鲜",
    tone: "fresh",
  });
  assert.deepEqual([...archive.runs.values()].map(({ candidateCount, id, status }) => ({ candidateCount, id, status })), [
    { candidateCount: 1, id: "run-1", status: "succeeded" },
    { candidateCount: 1, id: "run-2", status: "succeeded" },
  ]);
});

test("Candidate Filter 会阻止不在 Radar Profile 范围内的 Candidate 及其 Source Evidence 进入评估归档", async () => {
  const archive = new InMemoryRadarArchive();
  const connector: SourceConnector = {
    id: "github-trending",
    collect: async () => collectionResult("2026-08-12T07:00:00.000Z"),
  };
  const pipeline = createAssessmentPipeline({
    archive,
    candidateFilter: () => false,
    clock: () => new Date("2026-08-12T07:00:01.000Z"),
    createRunId: () => "filtered-run",
    modelRuntime: fixtureRuntime,
    sourceConnectors: [connector],
  });

  const result = await pipeline.runCollectionCycle("github-trending");

  assert.deepEqual(result, { candidateCount: 1, connectorId: "github-trending", runId: "filtered-run", status: "succeeded" });
  assert.equal(archive.candidates.size, 0);
  assert.equal(archive.evidence.size, 0);
});

test("Connector Fixture 失败时记录失败运行和 Connector Health，而不把错误交给 Web 请求", async () => {
  const archive = new InMemoryRadarArchive();
  const connector: SourceConnector = {
    id: "github-trending",
    collect: async () => { throw new Error("HTTP 429"); },
  };
  const pipeline = createAssessmentPipeline({
    archive,
    clock: () => new Date("2026-08-12T05:00:00.000Z"),
    createRunId: () => "failed-run",
    modelRuntime: fixtureRuntime,
    sourceConnectors: [connector],
  });

  const result = await pipeline.runCollectionCycle("github-trending");

  assert.deepEqual(result, { connectorId: "github-trending", errorMessage: "HTTP 429", runId: "failed-run", status: "failed" });
  assert.deepEqual(archive.runs.get("failed-run"), {
    candidateCount: 0,
    connectorId: "github-trending",
    errorMessage: "HTTP 429",
    finishedAt: "2026-08-12T05:00:00.000Z",
    id: "failed-run",
    startedAt: "2026-08-12T05:00:00.000Z",
    status: "failed",
  });
  assert.deepEqual(archive.connectorHealth.get("github-trending"), {
    detail: "HTTP 429",
    lastSuccessAt: null,
    status: "采集失败",
    tone: "muted",
  });
});
