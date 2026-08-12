import assert from "node:assert/strict";
import test from "node:test";
import { signals } from "../src/components/radar-data.ts";
import { getAssessmentBanner, getBriefHeading } from "../src/components/brief-presentation.ts";
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
