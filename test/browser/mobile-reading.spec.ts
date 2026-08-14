import { expect, test } from "@playwright/test";
import type { GroundedAssessment, ModelRuntime } from "../../src/lib/radar/assessment-contract.ts";
import { postgresBriefPublicationArchive } from "../../src/lib/radar/brief-publication-archive.ts";
import { createBriefPublisher, type PublicationCandidate } from "../../src/lib/radar/brief-publication.ts";
import { getDatabasePool } from "../../src/lib/radar/database.ts";
import { seedPublicationCandidate } from "../e2e/publication-fixture.ts";

const candidates: PublicationCandidate[] = [
  {
    canonicalIdentifier: "github:openai/mobile-brief-one",
    evidence: [{ canonicalIdentifier: "github:openai/mobile-brief-one", sourceName: "GitHub Trending", sourceTitle: "openai/mobile-brief-one", sourceUrl: "https://github.com/openai/mobile-brief-one" }],
    priority: "值得关注",
    rankingPolicyVersion: "v0.1",
    rankingScore: 2,
    selectionReason: "GitHub Trending 在 Observation Window 内新发现。",
    signalState: "新出现",
    title: "openai/mobile-brief-one",
  },
  {
    canonicalIdentifier: "github:openai/mobile-brief-two",
    evidence: [{ canonicalIdentifier: "github:openai/mobile-brief-two", sourceName: "GitHub Trending", sourceTitle: "openai/mobile-brief-two", sourceUrl: "https://github.com/openai/mobile-brief-two" }],
    priority: "高优先级",
    rankingPolicyVersion: "v0.1",
    rankingScore: 3,
    selectionReason: "GitHub Trending 在 Observation Window 内持续升温。",
    signalState: "持续升温",
    title: "openai/mobile-brief-two",
  },
];

function runtime(): ModelRuntime {
  return {
    assess: async (candidate) => ({
      builderValue: "试用",
      citations: {
        happened: [candidate.evidence[0]!.sourceUrl],
        technicalBasis: [candidate.evidence[0]!.sourceUrl],
        whyNow: [candidate.evidence[0]!.sourceUrl],
      },
      happened: `${candidate.title} 已发布到移动阅读验收 Fixture。`,
      productOpportunity: "待验证",
      risk: "仍需在真实工作流中验证。",
      summary: `${candidate.title} 适合移动端验收。`,
      technicalBasis: "公开仓库提供可验证的实现依据。",
      topics: ["开发工具"],
      whyNow: "当前 Observation Window 内出现新的可验证证据。",
    }) satisfies GroundedAssessment,
    id: "compatible:mobile-browser-e2e",
  };
}

test.beforeEach(async () => {
  await getDatabasePool().query(
    "TRUNCATE TABLE pipeline_runs, radar_signals, brief_snapshots, candidate_evidence_digests, evidence_digests, candidate_source_evidence, source_evidence, radar_candidates, radar_subjects, radar_profile_state, radar_profile_versions RESTART IDENTITY CASCADE",
  );
  await Promise.all(candidates.map((candidate) => seedPublicationCandidate(candidate, new Date("2026-08-14T01:00:00.000Z"))));
  await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date("2026-08-14T01:00:00.000Z"),
    configurationVersion: "profile@v1",
    createBriefId: () => "brief-mobile-browser",
    isCitationAccessible: async () => true,
    pipelineVersion: "assessment-pipeline@v1",
    runtime: runtime(),
  }).publishDailyBrief();
});

test.afterAll(async () => {
  await getDatabasePool().end();
});

test("Builder 能在 390px Public Brief 中切换并展开 Signal Card", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await page.waitForTimeout(500);

  await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: /openai\/mobile-brief-one/ })).toBeVisible();

  const mobileNavigation = page.getByRole("navigation", { name: "移动端主导航" });
  await mobileNavigation.locator("button").nth(1).click();
  await expect(page.getByRole("heading", { name: "在信号与证据中回看" })).toBeVisible();

  await mobileNavigation.locator("button").nth(0).click();
  await expect(page.getByRole("button", { name: /openai\/mobile-brief-one/ })).toBeVisible();

  await page.getByRole("button", { name: /openai\/mobile-brief-two/ }).click();

  await expect(page.getByText("openai/mobile-brief-two 已发布到移动阅读验收 Fixture。")).toBeVisible();
});
