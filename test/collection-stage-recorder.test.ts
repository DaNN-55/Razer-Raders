import assert from "node:assert/strict";
import test from "node:test";
import { recordCollectionCycle } from "../src/lib/radar/collection-stage-recorder.ts";
import type { PublicationArchive } from "../src/lib/radar/brief-publication.ts";

test("采集结束后按 CST 日期将结果和 Collection Run 关联到 Pipeline History", async () => {
  const events: Parameters<PublicationArchive["recordPipelineStage"]>[0][] = [];
  await recordCollectionCycle({
    archive: {
      getCandidatesForPublication: async () => [],
      hasPublishedBrief: async () => false,
      markCandidateAssessmentDelayed: async () => undefined,
      publishBrief: async () => "published",
      recordPipelineStage: async (event) => { events.push(event); },
    },
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    result: { candidateCount: 2, connectorId: "github-trending", runId: "collection-run-1", status: "succeeded" },
  });

  assert.deepEqual(events, [{
    collectionRunId: "collection-run-1",
    detail: "保留 2 个 Candidate。",
    publicationDay: "2026-08-12",
    stage: "collection",
    status: "succeeded",
  }]);
});

test("部分条目失败会写入 Collection 阶段记录", async () => {
  const events: Parameters<PublicationArchive["recordPipelineStage"]>[0][] = [];
  await recordCollectionCycle({
    archive: {
      getCandidatesForPublication: async () => [],
      hasPublishedBrief: async () => false,
      markCandidateAssessmentDelayed: async () => undefined,
      publishBrief: async () => "published",
      recordPipelineStage: async (event) => { events.push(event); },
    },
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    result: {
      candidateCount: 1,
      connectorId: "show-hn",
      runId: "collection-run-partial",
      status: "succeeded",
      warnings: ["Show HN：HTTP 503"],
    },
  });

  assert.equal(events[0]?.detail, "保留 1 个 Candidate；部分条目失败：Show HN：HTTP 503");
});
