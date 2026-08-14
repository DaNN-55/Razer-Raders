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
      topics: [candidate.title.endsWith("two") ? "研究" : "开发工具"],
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

  await mobileNavigation.locator("button").nth(2).click();
  await expect(page.getByRole("heading", { name: "Radar Profile" })).toBeVisible();

  await mobileNavigation.locator("button").nth(0).click();
  await expect(page.getByRole("button", { name: /openai\/mobile-brief-one/ })).toBeVisible();

  await page.getByRole("button", { name: /openai\/mobile-brief-two/ }).click();

  await expect(page.getByText("openai/mobile-brief-two 已发布到移动阅读验收 Fixture。")).toBeVisible();
});

test("Builder 在紧凑屏幕默认折叠 Signal Card，并可阅读证据、保存及查看来源覆盖", async ({ page }) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ height: 844, width });
    await page.goto("/");
    await page.waitForTimeout(500);

    await expect(page.getByRole("button", { name: /openai\/mobile-brief-one/ })).toBeVisible();
    await expect(page.getByText("openai/mobile-brief-one 已发布到移动阅读验收 Fixture。")).toBeHidden();
    await expect(page.getByText("openai/mobile-brief-two 已发布到移动阅读验收 Fixture。")).toBeHidden();
    await expect(page.locator(".mobile-coverage [aria-label='本期来源覆盖度']")).toBeVisible();
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole("button", { name: /openai\/mobile-brief-one/ }).click();
  await expect(page.getByText("openai/mobile-brief-one 已发布到移动阅读验收 Fixture。")).toBeVisible();
  await expect(page.getByRole("link", { name: "openai/mobile-brief-one" })).toBeVisible();

  const save = page.getByRole("button", { name: "保存信号" });
  await save.click();
  await expect(page.getByRole("button", { name: "取消保存" })).toBeVisible();

  const mobileCoverage = page.locator(".mobile-coverage [aria-label='本期来源覆盖度']");
  await mobileCoverage.getByText("查看来源状态").click();
  await expect(mobileCoverage.getByText("GitHub Trending")).toBeVisible();
});

test("Builder 在紧凑视口可通过键盘应用并关闭 Topic Filter", async ({ page }) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ height: 844, width });
    await page.goto("/");
    await page.waitForTimeout(500);

    await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "打开筛选条件" })).toBeVisible();
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await page.waitForTimeout(500);
  const filterTrigger = page.getByRole("button", { name: "打开筛选条件" });
  await filterTrigger.click();

  const filterDrawer = page.getByRole("dialog", { name: "主题筛选" });
  await expect(filterDrawer).toBeVisible();
  await expect(page.getByRole("button", { name: "点击遮罩关闭主题筛选" })).toBeVisible();
  await expect(filterDrawer.getByRole("button", { name: "关闭主题筛选" })).toBeFocused();

  await page.keyboard.press("Tab");
  const topicFilter = page.getByRole("combobox", { name: "主题" });
  await expect(topicFilter).toBeFocused();
  for (let index = 0; index < 6; index += 1) await page.keyboard.press("ArrowDown");
  await expect(topicFilter).toHaveValue("研究");
  await expect(page.getByRole("button", { name: /openai\/mobile-brief-two/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /openai\/mobile-brief-one/ })).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(filterDrawer).toBeHidden();
  await expect(filterTrigger).toBeFocused();

  await filterTrigger.click();
  await expect(filterDrawer).toBeVisible();
  await page.setViewportSize({ height: 844, width: 1121 });
  await expect(filterDrawer).toBeHidden();
});

test("Builder 可在紧凑屏幕的 Radar Archive 中通过 URL 保留检索与详情上下文", async ({ page }) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ height: 844, width });
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.getByRole("navigation", { name: "移动端主导航" }).locator("button").nth(1).click();

    await expect(page).toHaveURL(/view=archive/);
    await expect(page.getByRole("heading", { name: "在信号与证据中回看" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByPlaceholder("搜索模型、工具、概念…").fill("mobile-brief-two");
  await page.getByRole("button", { name: "检索 Archive" }).click();
  await expect(page).toHaveURL(/archiveQuery=mobile-brief-two/);

  await page.getByRole("button", { name: /openai\/mobile-brief-two/ }).click();
  await expect(page).toHaveURL(/archiveSignal=/);
  await expect(page.getByRole("heading", { name: "openai/mobile-brief-two", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "openai/mobile-brief-two", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/archiveSignal=/);
  await expect(page.getByRole("heading", { name: "openai/mobile-brief-two", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: /openai\/mobile-brief-two/ })).toBeVisible();

  await page.goForward();
  await expect(page.getByRole("heading", { name: "openai/mobile-brief-two", exact: true })).toBeVisible();
});

test("Instance Administrator 可在紧凑屏幕加载并编辑 Profile，未授权写入会被保护", async ({ page }) => {
  const unauthorized = await page.request.put("/api/profile", { data: {} });
  expect(unauthorized.status()).toBe(401);

  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ height: 844, width });
    await page.goto("/?view=config");
    await page.waitForTimeout(500);

    await expect(page.getByRole("heading", { name: "Radar Profile" })).toBeVisible();
    await expect(page.getByPlaceholder("RADAR_ADMIN_TOKEN")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByPlaceholder("RADAR_ADMIN_TOKEN").fill("browser-e2e-admin-token");
  await page.getByRole("button", { name: "加载配置" }).click();
  await expect(page.getByText("来源连接器")).toBeVisible();

  await page.getByRole("spinbutton", { name: "采集间隔（分钟）" }).fill("120");
  await page.getByRole("button", { name: "校验并保存新版本" }).click();
  await expect(page.getByText("Compatible API 凭据未由部署环境配置。")).toBeVisible();
});
