import assert from "node:assert/strict";
import test from "node:test";
import { createInitialRadarProfileConfig, parseRadarProfileConfig } from "../src/lib/radar/radar-profile.ts";

const profile = {
  collectionIntervalMs: 7_200_000,
  enabledConnectorIds: ["github-trending", "show-hn"],
  excludeTerms: ["irrelevant"],
  includeTerms: ["agent"],
  runtime: {
    baseUrl: "http://127.0.0.1:11434",
    cycleBudgetSeconds: 1_800,
    kind: "ollama",
    maxAssessmentsPerCycle: 5,
    model: "qwen3-local:8b",
    modelConcurrency: 1,
  },
};

test("Radar Profile 只接受受限的非敏感运行时配置与三个内置来源", () => {
  assert.deepEqual(parseRadarProfileConfig(profile), profile);
  assert.throws(
    () => parseRadarProfileConfig({ ...profile, runtime: { ...profile.runtime, baseUrl: "https://key@example.com" } }),
    /不能包含凭据/,
  );
  assert.throws(
    () => parseRadarProfileConfig({ ...profile, enabledConnectorIds: ["official-watchlist"], officialWatchlist: [] }),
    /未知 Connector/,
  );
});

test("初始 Profile 从既有部署环境迁移，凭据不会进入配置", () => {
  const initial = createInitialRadarProfileConfig({
    RADAR_COLLECTION_INTERVAL_MS: "3600000",
    RADAR_INCLUDE_TERMS: "Agent, 推理",
    RADAR_MODEL_RUNTIME: "ollama",
    RADAR_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    RADAR_OLLAMA_MODEL: "qwen3-local:8b",
  });
  assert.deepEqual(initial.runtime, {
    baseUrl: "http://127.0.0.1:11434",
    cycleBudgetSeconds: 1_800,
    kind: "ollama",
    maxAssessmentsPerCycle: 5,
    model: "qwen3-local:8b",
    modelConcurrency: 1,
  });
  assert.deepEqual(initial.includeTerms, ["agent", "推理"]);
});
