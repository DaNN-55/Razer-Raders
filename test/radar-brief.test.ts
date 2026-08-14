import assert from "node:assert/strict";
import test from "node:test";
import { signals } from "../src/components/radar-data.ts";
import { getAssessmentBanner, getBriefCoverageLabel, getBriefFormatLabel, getBriefHeading, getBriefPage, getSignalCardSections } from "../src/components/brief-presentation.ts";
import { createArchiveRadarBrief, createUnpublishedRadarBrief } from "../src/lib/radar/brief-contract.ts";
import { createBriefGetHandler } from "../src/lib/radar/brief-route.ts";

test("已发布 Daily Brief 与新 Candidate 评估队列并存时，不会把未发布内容混入公开信号", () => {
  const publishedSignal = signals[0];
  if (!publishedSignal) throw new Error("Fixture 缺少已发布 Radar Signal。");

  const brief = createArchiveRadarBrief({
    assessment: { candidateCount: 2, status: "evaluating" },
    brief: {
      publishedAt: "2026-08-12T01:00:00.000Z",
      provenance: { configurationVersion: "profile@v1", modelRuntimeId: "compatible:fixture", pipelineVersion: "assessment-pipeline@v1", rankingPolicyVersion: "v0.1" },
      signals: [publishedSignal],
    },
    connectors: [{ caption: "公开趋势页", name: "GitHub Trending", status: "新鲜", tone: "fresh" }],
    topicOptions: ["全部主题"],
  });

  assert.equal(brief.availability, "evaluating");
  assert.equal(brief.pendingCandidateCount, 2);
  assert.deepEqual(brief.signals, [publishedSignal]);
  assert.equal(getBriefHeading({ ...brief, hasPublishedSignals: true, visibleSignalCount: 1 }), "今天，值得你分心的 1 个 AI 信号");
  assert.equal(getAssessmentBanner({ ...brief, hasPublishedSignals: true, visibleSignalCount: 1 }), "另有 2 个新 Candidate 正在评估，不会混入当前已发布日报。");
});

test("已发布 Daily Brief 保留发布时的 Brief Coverage Summary", () => {
  const publishedSignal = signals[0];
  if (!publishedSignal) throw new Error("Fixture 缺少已发布 Radar Signal。");
  const coverage = [
    { connectorId: "github-trending", isEnabled: true, name: "GitHub Trending", status: "新鲜", tone: "fresh" },
    { connectorId: "show-hn", isEnabled: false, name: "Show HN", status: "未启用", tone: "muted" },
  ];

  const brief = createArchiveRadarBrief({
    assessment: { candidateCount: 0, status: "unpublished" },
    brief: {
      coverage,
      publishedAt: "2026-08-12T01:00:00.000Z",
      provenance: { configurationVersion: "profile@v1", modelRuntimeId: "compatible:fixture", pipelineVersion: "assessment-pipeline@v1", rankingPolicyVersion: "v0.1" },
      signals: [publishedSignal],
    },
    connectors: [],
    topicOptions: ["全部主题"],
  });

  assert.deepEqual(brief.coverage, coverage);
});

test("Brief Coverage Summary 只统计新鲜的已启用来源", () => {
  assert.equal(getBriefCoverageLabel([
    { connectorId: "github-trending", isEnabled: true, name: "GitHub Trending", status: "新鲜", tone: "fresh" },
    { connectorId: "hugging-face-trending", isEnabled: true, name: "Hugging Face", status: "部分失败", tone: "delayed" },
    { connectorId: "show-hn", isEnabled: false, name: "Show HN", status: "未启用", tone: "muted" },
  ]), "本期覆盖 1/2 个已启用来源");
});

test("Brief API 输出 evaluating 状态但只携带已发布 Snapshot", async () => {
  const publishedSignal = signals[0];
  if (!publishedSignal) throw new Error("Fixture 缺少已发布 Radar Signal。");
  const payload = createArchiveRadarBrief({
    assessment: { candidateCount: 1, status: "evaluating" },
    brief: {
      publishedAt: "2026-08-12T01:00:00.000Z",
      provenance: { configurationVersion: "profile@v1", modelRuntimeId: "compatible:fixture", pipelineVersion: "assessment-pipeline@v1", rankingPolicyVersion: "v0.1" },
      signals: [publishedSignal],
    },
    connectors: [],
    topicOptions: ["全部主题"],
  });

  const response = await createBriefGetHandler(async () => payload)();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
});

test("Brief API 将 Assessment Delay 与已有已发布日报同时透明呈现", async () => {
  const publishedSignal = signals[0];
  if (!publishedSignal) throw new Error("Fixture 缺少已发布 Radar Signal。");
  const payload = createArchiveRadarBrief({
    assessment: {
      candidateCount: 2,
      detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
      status: "assessment-delayed",
    },
    brief: {
      publishedAt: "2026-08-12T01:00:00.000Z",
      provenance: { configurationVersion: "profile@v1", modelRuntimeId: "compatible:fixture", pipelineVersion: "assessment-pipeline@v1", rankingPolicyVersion: "v0.1" },
      signals: [publishedSignal],
    },
    connectors: [{ caption: "公开趋势页", detail: "HTTP 429", name: "GitHub Trending", status: "采集失败", tone: "muted" }],
    topicOptions: ["全部主题"],
  });

  const response = await createBriefGetHandler(async () => payload)();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ...payload,
    assessmentDelay: {
      candidateCount: 2,
      detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
    },
    availability: "assessment-delayed",
    signals: [publishedSignal],
  });
});

test("未配置数据库时，公开 Brief 不再回退到 Fixture", async () => {
  const brief = createUnpublishedRadarBrief(["全部主题"]);

  assert.deepEqual(brief, {
    availability: "unpublished",
    connectors: [],
    mode: "archive",
    pendingCandidateCount: 0,
    publishedAt: "",
    signals: [],
    topicOptions: ["全部主题"],
  });
});

test("首页将已发布 Snapshot 按固定五条分页，且不会重排内容", () => {
  const baseSignal = signals[0];
  if (!baseSignal) throw new Error("Fixture 缺少已发布 Radar Signal。");
  const snapshot = Array.from({ length: 15 }, (_, index) => ({ ...baseSignal, id: `signal-${index + 1}`, index: String(index + 1).padStart(2, "0") }));

  assert.deepEqual(getBriefPage(snapshot, 0), { pageCount: 3, pageIndex: 0, signals: snapshot.slice(0, 5) });
  assert.deepEqual(getBriefPage(snapshot, 1), { pageCount: 3, pageIndex: 1, signals: snapshot.slice(5, 10) });
  assert.deepEqual(getBriefPage(snapshot, 2), { pageCount: 3, pageIndex: 2, signals: snapshot.slice(10, 15) });
  assert.deepEqual(getBriefPage([...snapshot, { ...baseSignal, id: "signal-16", index: "16" }], 3), { pageCount: 4, pageIndex: 3, signals: [{ ...baseSignal, id: "signal-16", index: "16" }] });
});

test("Daily Brief 依据 Pipeline Provenance 标示新版或旧版评估格式", () => {
  assert.equal(getBriefFormatLabel("evidence-first-assessment@v1"), "证据补全版");
  assert.equal(getBriefFormatLabel("legacy-assessment@v1"), "旧版评估格式");
  assert.equal(getBriefFormatLabel("assessment-pipeline@v1"), "旧版评估格式");
});

test("Signal Card 不重复顶部简介，并将入选原因弱化为最后一段", () => {
  const signal = signals[0];
  if (!signal) throw new Error("Fixture 缺少已发布 Radar Signal。");
  const sections = getSignalCardSections({ ...signal, whyInBrief: "Builder 价值为“试用”；2 条 Primary Evidence；3 个发现来源。" });

  assert.deepEqual(sections.map((section) => section.title), ["发生了什么", "为什么值得关注", "它靠什么实现", "风险与未知", "为什么它进入今日简报"]);
  assert.equal(sections[4].isSelectionReason, true);
  assert.equal(sections[4].body, "Builder 价值为“试用”；2 条 Primary Evidence；3 个发现来源。");
});
