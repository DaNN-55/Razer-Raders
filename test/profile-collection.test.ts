import assert from "node:assert/strict";
import test from "node:test";
import { createProfileCandidateFilter, createProfileSourceConnectors } from "../src/lib/radar/profile-collection.ts";
import type { RadarProfile } from "../src/lib/radar/radar-profile.ts";

const profile: RadarProfile = {
  enabledConnectorIds: ["github-trending", "show-hn"],
  excludeTerms: ["ignore"],
  id: "profile@v2",
  includeTerms: ["agent"],
  runtime: { baseUrl: "http://127.0.0.1:11434", cycleBudgetSeconds: 1_800, kind: "ollama", maxAssessmentsPerCycle: 5, model: "qwen3-local:8b", modelConcurrency: 1 },
  version: 2,
};

test("Worker 从激活 Profile 构造连接器范围和 Candidate Filter", () => {
  assert.deepEqual(createProfileSourceConnectors(profile).map((connector) => connector.id), ["github-trending", "show-hn"]);
  const filter = createProfileCandidateFilter(profile);
  assert.equal(filter({ canonicalIdentifier: "github:agent/tool", title: "Agent tool" } as never), true);
  assert.equal(filter({ canonicalIdentifier: "github:agent/ignore", title: "Agent ignore" } as never), false);
});
