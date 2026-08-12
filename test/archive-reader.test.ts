import assert from "node:assert/strict";
import test from "node:test";
import { createArchiveReader, type ArchiveQuery } from "../src/lib/radar/archive-reader.ts";

const now = new Date("2026-08-12T09:00:00.000Z");
const windowStart = "2026-08-05T09:00:00.000Z";

test("固定时钟下仅查询七天 Observation Window 内的评估 Candidate，并按得分排序", async () => {
  const queries: { text: string; values: readonly unknown[] | undefined }[] = [];
  const query: ArchiveQuery = async (text, values) => {
    queries.push({ text, values });
    if (text.includes("assessment_delay_detail")) return { rows: [{ assessment_delay_detail: null, candidate_count: 0 }] };
    if (text.includes("COUNT(*)")) return { rows: [{ candidate_count: 2 }] };
    return {
      rows: [
        {
          canonical_identifier: "github:high-score",
          last_collected_at: new Date("2026-08-12T08:00:00.000Z"),
          priority: "高优先级",
          ranking_score: 3,
          selection_reason: "第 3 次收集。",
          signal_state: "持续升温",
          title: "High score candidate",
        },
        {
          canonical_identifier: "github:lower-score",
          last_collected_at: new Date("2026-08-12T08:30:00.000Z"),
          priority: "值得关注",
          ranking_score: 1,
          selection_reason: "新发现。",
          signal_state: "新出现",
          title: "Lower score candidate",
        },
      ],
    };
  };
  const archive = createArchiveReader({ now: () => now, query });

  assert.deepEqual(await archive.getAssessmentState(), { candidateCount: 2, status: "evaluating" });
  assert.deepEqual(await archive.getEvaluatingCandidates(2), [
    {
      canonicalIdentifier: "github:high-score",
      lastCollectedAt: "2026-08-12T08:00:00.000Z",
      priority: "高优先级",
      rankingScore: 3,
      selectionReason: "第 3 次收集。",
      signalState: "持续升温",
      title: "High score candidate",
    },
    {
      canonicalIdentifier: "github:lower-score",
      lastCollectedAt: "2026-08-12T08:30:00.000Z",
      priority: "值得关注",
      rankingScore: 1,
      selectionReason: "新发现。",
      signalState: "新出现",
      title: "Lower score candidate",
    },
  ]);
  assert.deepEqual(queries.map((query) => query.values), [
    [new Date(windowStart)],
    [new Date(windowStart)],
    [new Date(windowStart), 2],
  ]);
  assert.ok(queries.every((query) => query.text.includes("last_collected_at >= $1")));
  assert.match(queries[2]?.text ?? "", /ORDER BY ranking_score DESC, last_collected_at DESC/);
});

test("固定时钟下，窗口外的 Candidate 不会让评估状态变为可见", async () => {
  const query: ArchiveQuery = async (text, values) => {
    assert.ok(text.includes("COUNT(*)"));
    assert.deepEqual(values, [new Date(windowStart)]);
    return text.includes("assessment_delay_detail")
      ? { rows: [{ assessment_delay_detail: null, candidate_count: 0 }] }
      : { rows: [{ candidate_count: 0 }] };
  };

  const state = await createArchiveReader({ now: () => now, query }).getAssessmentState();

  assert.deepEqual(state, { candidateCount: 0, status: "unpublished" });
});

test("固定时钟下，运行时耗尽重试的 Candidate 会以 Assessment Delay 对外可见", async () => {
  const state = await createArchiveReader({
    now: () => now,
    query: async (text, values) => {
      assert.deepEqual(values, [new Date(windowStart)]);
      if (!text.includes("assessment_delay_detail")) throw new Error("存在 Assessment Delay 时不应继续读取评估队列。");
      return { rows: [{ assessment_delay_detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）", candidate_count: 2 }] };
    },
  }).getAssessmentState();

  assert.deepEqual(state, {
    candidateCount: 2,
    detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
    status: "assessment-delayed",
  });
});
