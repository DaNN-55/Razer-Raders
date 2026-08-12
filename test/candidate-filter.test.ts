import assert from "node:assert/strict";
import test from "node:test";
import { createEnvironmentCandidateFilter } from "../src/lib/radar/candidate-filter.ts";
import type { Candidate } from "../src/lib/radar/connectors/types.ts";

const candidate: Candidate = {
  canonicalIdentifier: "github:openai/codex",
  collectedAt: "2026-08-12T09:00:00.000Z",
  connectorId: "github-trending",
  evidence: [],
  signalType: "project",
  title: "openai/codex",
  url: "https://github.com/openai/codex",
};

test("部署环境中的 Candidate Filter 先应用包含词，再应用排除词", () => {
  assert.equal(createEnvironmentCandidateFilter({ RADAR_INCLUDE_TERMS: "openai, agent" })(candidate), true);
  assert.equal(createEnvironmentCandidateFilter({ RADAR_INCLUDE_TERMS: "agent" })(candidate), false);
  assert.equal(createEnvironmentCandidateFilter({ RADAR_EXCLUDE_TERMS: "codex" })(candidate), false);
});
