import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentPrompt } from "../src/lib/radar/assessment-prompt.ts";

test("评估提示词限定 Builder Value 和 Product Opportunity 的契约枚举", () => {
  const prompt = createAssessmentPrompt({
    evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
    priority: "值得关注",
    selectionReason: "GitHub Trending 在 Observation Window 内新发现。",
    signalState: "新出现",
    title: "openai/codex",
  });

  assert.match(prompt, /builderValue 只能是“试用”、“学习”、“跟进”或“跳过”/);
  assert.match(prompt, /productOpportunity 只能是“无”、“待验证”或“值得探索”/);
  assert.match(prompt, /每个 citations\.happened、citations\.whyNow、citations\.technicalBasis 都必须是至少含一条 Evidence URL 的数组/);
});
