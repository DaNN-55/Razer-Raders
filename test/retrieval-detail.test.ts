import assert from "node:assert/strict";
import test from "node:test";
import { createRadarRetrievalDetailGetHandler } from "../src/lib/radar/retrieval-detail-route.ts";
import { createRadarRetrievalReader } from "../src/lib/radar/retrieval-reader.ts";

test("Radar Retrieval 按 Signal ID 读取已发布 Snapshot 中冻结的完整详情与 Evidence 摘录", async () => {
  let recordedQuery = "";
  let recordedValues: readonly unknown[] | undefined;
  const reader = createRadarRetrievalReader({
    query: async (text, values) => {
      recordedQuery = text;
      recordedValues = values;
      return {
        rows: [{
          builder_value: "试用",
          evidence: [{
            excerpts: ["Codex 是一个帮助 Builder 在本地代码任务中完成实现、验证与审查的开源工具。"],
            label: "openai/codex",
            source: "GitHub README",
            url: "https://github.com/openai/codex",
          }],
          happened: "openai/codex 已发布。",
          id: "brief-0812:signal:1",
          priority: "高优先级",
          product_opportunity: "待验证",
          provenance_configuration_version: "profile@v1",
          provenance_model_runtime_id: "ollama:qwen3:8b",
          provenance_pipeline_version: "assessment-pipeline@v1",
          provenance_ranking_policy_version: "v0.1",
          published_at: new Date("2026-08-12T01:00:00.000Z"),
          risk: "需验证。",
          section_citations: { happened: ["https://github.com/openai/codex"], technicalBasis: ["https://github.com/openai/codex"], whyNow: ["https://github.com/openai/codex"] },
          state: "新出现",
          summary: "适合试用。",
          technical_basis: "TypeScript。",
          title: "openai/codex",
          topics: ["开发工具"],
          why_in_brief: "具备立即试用价值。",
          why_now: "当前出现。",
        }],
      };
    },
  });

  const detail = await reader.retrieveDetail("brief-0812:signal:1");

  assert.equal(detail?.id, "brief-0812:signal:1");
  assert.deepEqual(detail?.evidence, [{
    excerpts: ["Codex 是一个帮助 Builder 在本地代码任务中完成实现、验证与审查的开源工具。"],
    label: "openai/codex",
    source: "GitHub README",
    url: "https://github.com/openai/codex",
  }]);
  assert.deepEqual(detail?.provenance, {
    configurationVersion: "profile@v1",
    modelRuntimeId: "ollama:qwen3:8b",
    pipelineVersion: "assessment-pipeline@v1",
    rankingPolicyVersion: "v0.1",
  });
  assert.match(recordedQuery, /snapshot\.status = 'published'/);
  assert.match(recordedQuery, /signal\.id = \$1/);
  assert.doesNotMatch(recordedQuery, /radar_candidates|radar_subjects/);
  assert.deepEqual(recordedValues, ["brief-0812:signal:1"]);
});

test("Radar Retrieval 详情 API 按 Signal ID 返回冻结详情", async () => {
  let receivedId = "";
  const response = await createRadarRetrievalDetailGetHandler(async (signalId) => {
    receivedId = signalId;
    return { id: signalId } as never;
  })(new Request("http://radar.local/api/retrieval/detail?id=brief-0812%3Asignal%3A1"));

  assert.equal(response.status, 200);
  assert.equal(receivedId, "brief-0812:signal:1");
  assert.equal((await response.json()).id, "brief-0812:signal:1");
});

test("Radar Retrieval 详情 API 对不存在或未发布的 Signal 返回明确错误", async () => {
  const response = await createRadarRetrievalDetailGetHandler(async () => null)(
    new Request("http://radar.local/api/retrieval/detail?id=missing-signal"),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "未找到已发布的历史 Signal Card。" });
});

test("Radar Retrieval 详情 API 拒绝缺少 Signal ID 的请求", async () => {
  const response = await createRadarRetrievalDetailGetHandler(async () => {
    throw new Error("无效查询不应读取 Archive。");
  })(new Request("http://radar.local/api/retrieval/detail"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "id 必须是有效的 Radar Signal ID。" });
});
