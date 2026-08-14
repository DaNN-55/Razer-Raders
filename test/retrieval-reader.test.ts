import assert from "node:assert/strict";
import test from "node:test";
import { createRadarRetrievalReader } from "../src/lib/radar/retrieval-reader.ts";

test("Radar Retrieval 只查询已发布 Snapshot，并将组合过滤和稳定分页交给 Archive", async () => {
  let recordedQuery = "";
  let recordedValues: readonly unknown[] | undefined;
  const reader = createRadarRetrievalReader({
    query: async (text, values) => {
      recordedQuery = text;
      recordedValues = values;
      return {
        rows: [{
          builder_value: "试用",
          evidence: [
            { label: "codex", source: "GitHub Trending", url: "https://github.com/openai/codex" },
            { label: "unverified", source: "GitHub Trending", url: "https://github.com/openai/unverified" },
          ],
          happened: "openai/codex 已发布。",
          id: "brief:signal:1",
          priority: "高优先级",
          product_opportunity: "待验证",
          provenance_configuration_version: "profile@v1",
          provenance_model_runtime_id: "ollama:qwen3:8b",
          provenance_pipeline_version: "assessment-pipeline@v1",
          provenance_ranking_policy_version: "v0.1",
          published_at: new Date("2026-08-12T01:00:00.000Z"),
          risk: "需验证。",
          section_citations: { happened: ["https://github.com/openai/codex"], technicalBasis: ["https://github.com/openai/codex"], whyNow: ["https://github.com/openai/codex"] },
          signal_type: "project",
          state: "新出现",
          subject_canonical_identifier: "github:openai/codex",
          subject_title: "openai/codex",
          summary: "适合试用。",
          technical_basis: "TypeScript。",
          title: "openai/codex",
          topics: ["开发工具"],
          why_now: "当前出现。",
        }],
      };
    },
  });

  const result = await reader.retrieve({
    from: new Date("2026-08-10T00:00:00.000Z"),
    limit: 10,
    offset: 5,
    query: "codex agent",
    signalType: "project",
    subject: "github:openai/codex",
    to: new Date("2026-08-12T23:59:59.000Z"),
    topic: "开发工具",
  });

  assert.equal(result.availability, "results");
  assert.deepEqual(result.pagination, { hasMore: false, limit: 10, offset: 5 });
  assert.deepEqual(result.results[0], {
    builderValue: "试用",
    evidence: [{ label: "codex", source: "GitHub Trending", url: "https://github.com/openai/codex" }],
    happened: "openai/codex 已发布。",
    id: "brief:signal:1",
    priority: "高优先级",
    productOpportunity: "待验证",
    provenance: {
      configurationVersion: "profile@v1",
      modelRuntimeId: "ollama:qwen3:8b",
      pipelineVersion: "assessment-pipeline@v1",
      rankingPolicyVersion: "v0.1",
    },
    publishedAt: "2026-08-12T01:00:00.000Z",
    risk: "需验证。",
    sectionCitations: { happened: ["https://github.com/openai/codex"], technicalBasis: ["https://github.com/openai/codex"], whyNow: ["https://github.com/openai/codex"] },
    signalType: "project",
    state: "新出现",
    subject: { canonicalIdentifier: "github:openai/codex", title: "openai/codex" },
    summary: "适合试用。",
    technicalBasis: "TypeScript。",
    title: "openai/codex",
    topics: ["开发工具"],
    whyNow: "当前出现。",
  });
  assert.match(recordedQuery, /snapshot\.status = 'published'/);
  assert.match(recordedQuery, /websearch_to_tsquery\('simple'/);
  assert.match(recordedQuery, /ILIKE '%' \|\| \$3 \|\| '%'/);
  assert.match(recordedQuery, /signal\.topics @> jsonb_build_array/);
  assert.match(recordedQuery, /ORDER BY snapshot\.published_at DESC, signal\.id ASC/);
  assert.deepEqual(recordedValues, [
    new Date("2026-08-10T00:00:00.000Z"),
    new Date("2026-08-12T23:59:59.000Z"),
    "codex agent",
    "开发工具",
    "project",
    "github:openai/codex",
    11,
    5,
  ]);
});
