import assert from "node:assert/strict";
import test from "node:test";
import type { RadarRetrieval } from "../src/lib/radar/retrieval-contract.ts";
import { createRadarRetrievalGetHandler } from "../src/lib/radar/retrieval-route.ts";

test("Radar Retrieval API 将组合筛选与稳定分页传给只读检索边界", async () => {
  const payload: RadarRetrieval = {
    availability: "empty",
    pagination: { hasMore: false, limit: 10, offset: 5 },
    results: [],
  };
  let receivedFilter: unknown;
  const response = await createRadarRetrievalGetHandler(async (filter) => {
    receivedFilter = filter;
    return payload;
  })(new Request("http://radar.local/api/retrieval?from=2026-08-10T00:00:00.000Z&to=2026-08-12T00:00:00.000Z&topic=%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7&signalType=project&subject=github%3Aopenai%2Fcodex&limit=10&offset=5"));

  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilter, {
    from: new Date("2026-08-10T00:00:00.000Z"),
    limit: 10,
    offset: 5,
    signalType: "project",
    subject: "github:openai/codex",
    to: new Date("2026-08-12T00:00:00.000Z"),
    topic: "开发工具",
  });
  assert.deepEqual(await response.json(), payload);
});

test("Radar Retrieval API 拒绝无效的分页参数", async () => {
  const response = await createRadarRetrievalGetHandler(async () => {
    throw new Error("无效查询不应触及 Archive。");
  })(new Request("http://radar.local/api/retrieval?limit=0"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "limit 必须是 1 到 50 的整数。" });
});

test("Radar Retrieval API 只接受 ISO 日期时间", async () => {
  const response = await createRadarRetrievalGetHandler(async () => {
    throw new Error("无效查询不应触及 Archive。");
  })(new Request("http://radar.local/api/retrieval?from=2026"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "from 必须是有效的 ISO 日期时间。" });
});

test("Radar Retrieval API 拒绝不存在的 ISO 日历日期", async () => {
  const response = await createRadarRetrievalGetHandler(async () => {
    throw new Error("无效查询不应触及 Archive。");
  })(new Request("http://radar.local/api/retrieval?to=2026-02-29T00:00:00Z"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "to 必须是有效的 ISO 日期时间。" });
});
