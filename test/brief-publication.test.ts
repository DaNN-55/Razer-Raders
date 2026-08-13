import assert from "node:assert/strict";
import test from "node:test";
import type { GroundedAssessment, ModelRuntime } from "../src/lib/radar/assessment-contract.ts";
import { createBriefPublisher, createReadyBriefPublisher, type PublicationArchive, type PublicationCandidate, type ReadyPublicationAssessment } from "../src/lib/radar/brief-publication.ts";
import { createArchiveRadarBrief } from "../src/lib/radar/brief-contract.ts";

const candidate: PublicationCandidate = {
  canonicalIdentifier: "github:openai/codex",
  evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
  priority: "值得关注",
  rankingPolicyVersion: "v0.1",
  rankingScore: 1,
  selectionReason: "GitHub Trending 在 Observation Window 内新发现。",
  signalState: "新出现",
  title: "openai/codex",
};

const validAssessment: GroundedAssessment = {
  builderValue: "试用",
  citations: {
    happened: ["https://github.com/openai/codex"],
    technicalBasis: ["https://github.com/openai/codex"],
    whyNow: ["https://github.com/openai/codex"],
  },
  happened: "openai/codex 出现在 GitHub Trending。",
  productOpportunity: "待验证",
  risk: "尚未在目标工作流中验证。",
  summary: "Builder 可以先做小范围试用。",
  technicalBasis: "该项目公开提供 TypeScript 源码。",
  topics: ["开发工具"],
  whyNow: "它在当前 Observation Window 内被收集。",
};

class InMemoryPublicationArchive implements PublicationArchive {
  private readonly candidates: readonly PublicationCandidate[];
  readyAssessments: readonly ReadyPublicationAssessment[] = [];
  delayedCandidates: { candidateId: string; detail: string }[] = [];
  published: Parameters<PublicationArchive["publishBrief"]>[0] | null = null;
  publishedDays: string[] = [];
  requestedLimit: number | undefined;
  stages: { detail?: string; publicationDay: string; stage: string; status: string }[] = [];

  constructor(candidates: readonly PublicationCandidate[]) {
    this.candidates = candidates;
  }

  async getCandidatesForPublication(limit?: number) {
    this.requestedLimit = limit;
    return this.candidates.slice(0, limit);
  }

  async getReadyAssessments(limit?: number) {
    this.requestedLimit = limit;
    return this.readyAssessments.slice(0, limit);
  }

  async markCandidateAssessmentDelayed(input: { candidateId: string; detail: string }) {
    this.delayedCandidates.push(input);
  }

  async hasPublishedBrief(publicationDay: string) {
    return this.publishedDays.includes(publicationDay);
  }

  async publishBrief(input: Parameters<PublicationArchive["publishBrief"]>[0]) {
    if (this.publishedDays.includes(input.publicationDay)) return "already-published" as const;
    this.published = input;
    this.publishedDays.push(input.publicationDay);
    return "published" as const;
  }

  async recordPipelineStage(input: Parameters<PublicationArchive["recordPipelineStage"]>[0]) {
    this.stages.push(input);
  }
}

function runtimeFor(assessment: GroundedAssessment): ModelRuntime {
  return { assess: async () => assessment, id: "compatible:fixture" };
}

function createFixturePublisher(input: Omit<Parameters<typeof createBriefPublisher>[0], "configurationVersion" | "pipelineVersion">) {
  return createBriefPublisher({
    ...input,
    configurationVersion: "profile@v1",
    pipelineVersion: "assessment-pipeline@v1",
  });
}

test("固定 Runtime 通过质量门后发布含 Section Citation 与 Provenance 的当日 Brief Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const publisher = createFixturePublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-1",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(validAssessment),
  });

  const result = await publisher.publishDailyBrief();

  assert.deepEqual(result, { briefId: "brief-1", signalCount: 1, status: "published" });
  assert.deepEqual(archive.published, {
    id: "brief-1",
    publishedAt: "2026-08-12T01:00:00.000Z",
    publicationDay: "2026-08-12",
    provenance: {
      configurationVersion: "profile@v1",
      modelRuntimeId: "compatible:fixture",
      pipelineVersion: "assessment-pipeline@v1",
      rankingPolicyVersion: "v0.1",
    },
    signals: [{
      builderValue: "试用",
      candidateId: "github:openai/codex",
      evidence: [{ label: "openai/codex", source: "GitHub Trending", url: "https://github.com/openai/codex" }],
      happened: "openai/codex 出现在 GitHub Trending。",
      priority: "值得关注",
      productOpportunity: "待验证",
      risk: "尚未在目标工作流中验证。",
      sectionCitations: validAssessment.citations,
      sources: ["GitHub Trending"],
      state: "新出现",
      summary: "Builder 可以先做小范围试用。",
      technicalBasis: "该项目公开提供 TypeScript 源码。",
      title: "openai/codex",
      topics: ["开发工具"],
      whyNow: "它在当前 Observation Window 内被收集。",
    }],
  });
  assert.deepEqual(archive.stages, [
    { publicationDay: "2026-08-12", stage: "assessment", status: "started" },
    { publicationDay: "2026-08-12", stage: "assessment", status: "succeeded" },
    { publicationDay: "2026-08-12", stage: "validation", status: "started" },
    { publicationDay: "2026-08-12", stage: "validation", status: "succeeded" },
    { publicationDay: "2026-08-12", stage: "publication", status: "started" },
    { publicationDay: "2026-08-12", stage: "publication", status: "succeeded" },
  ]);
});

test("日报只消费持久化完成的评估，不会再次调用模型", async () => {
  const archive = new InMemoryPublicationArchive([]);
  archive.readyAssessments = [{
    assessment: validAssessment,
    candidate,
    configurationVersion: "profile@v1",
    runtimeId: "compatible:fixture",
  }];
  const result = await createReadyBriefPublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "ready-brief",
    isCitationAccessible: async () => true,
    maxAssessments: 1,
    pipelineVersion: "assessment-pipeline@v1",
  }).publishDailyBrief();

  assert.deepEqual(result, { briefId: "ready-brief", signalCount: 1, status: "published" });
  assert.equal(archive.requestedLimit, 1);
  assert.equal(archive.published?.provenance.modelRuntimeId, "compatible:fixture");
});

test("发布器使用 Profile 指定的评估上限、并发和时间预算", async () => {
  const archive = new InMemoryPublicationArchive([candidate, candidate]);
  let active = 0;
  let maximumActive = 0;
  const result = await createFixturePublisher({
    archive,
    assessmentBudgetMs: 60_000,
    assessmentConcurrency: 2,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-concurrent",
    isCitationAccessible: async () => true,
    maxAssessments: 2,
    runtime: {
      assess: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        return validAssessment;
      },
      id: "compatible:concurrent-fixture",
    },
  }).publishDailyBrief();

  assert.equal(result.status, "published");
  assert.equal(archive.requestedLimit, 2);
  assert.equal(maximumActive, 2);

  const exhausted = new InMemoryPublicationArchive([candidate]);
  const delayed = await createFixturePublisher({
    archive: exhausted,
    assessmentBudgetMs: 0,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-budget-exhausted",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(validAssessment),
  }).publishDailyBrief();
  assert.deepEqual(delayed, { reason: "openai/codex：本轮评估时间预算已耗尽。", status: "delayed" });
});

test("日报发布在同一 CST 日期幂等，跨日创建新的不可变 Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const publish = (publishedAt: string, id: string) => createFixturePublisher({
    archive,
    clock: () => new Date(publishedAt),
    createBriefId: () => id,
    isCitationAccessible: async () => true,
    runtime: runtimeFor(validAssessment),
  }).publishDailyBrief();

  assert.deepEqual(await publish("2026-08-12T01:00:00.000Z", "brief-0812"), { briefId: "brief-0812", signalCount: 1, status: "published" });
  assert.deepEqual(await publish("2026-08-12T04:00:00.000Z", "brief-0812-again"), { status: "already-published" });
  assert.deepEqual(await publish("2026-08-13T01:00:00.000Z", "brief-0813"), { briefId: "brief-0813", signalCount: 1, status: "published" });
  assert.deepEqual(archive.publishedDays, ["2026-08-12", "2026-08-13"]);
});

test("校验或运行时失败会留下可诊断的阶段记录，且不发布 Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const result = await createFixturePublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-failed",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, risk: "" }),
  }).publishDailyBrief();

  assert.deepEqual(result, { reason: "openai/codex：缺少必填字段：risk", status: "rejected" });
  assert.equal(archive.published, null);
  assert.deepEqual(archive.stages, [
    { publicationDay: "2026-08-12", stage: "assessment", status: "started" },
    { publicationDay: "2026-08-12", stage: "assessment", status: "succeeded" },
    { publicationDay: "2026-08-12", stage: "validation", status: "started" },
    { detail: "缺少必填字段：risk", publicationDay: "2026-08-12", stage: "validation", status: "failed" },
  ]);
});

test("固定失败 Runtime 在三次评估后延迟 Candidate，而不发布不完整日报", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  let attempts = 0;

  const result = await createFixturePublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-delayed",
    isCitationAccessible: async () => true,
    runtime: {
      assess: async () => {
        attempts += 1;
        throw new Error("Compatible Runtime 请求失败：HTTP 503");
      },
      id: "compatible:unavailable-fixture",
    },
  }).publishDailyBrief();

  assert.deepEqual(result, {
    reason: "openai/codex：Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
    status: "delayed",
  });
  assert.equal(attempts, 3);
  assert.equal(archive.published, null);
  assert.deepEqual(archive.delayedCandidates, [{
    candidateId: "github:openai/codex",
    detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
  }]);
  assert.deepEqual(archive.stages.at(-1), {
    detail: "Compatible Runtime 请求失败：HTTP 503（已重试 3 次）",
    publicationDay: "2026-08-12",
    stage: "assessment",
    status: "failed",
  });
});

test("缺少事实引用或引用不可访问时，Publication Validation 拒绝发布", async () => {
  const withoutCitation: GroundedAssessment = { ...validAssessment, citations: { happened: [], technicalBasis: [], whyNow: [] } };
  const malformedArchive = new InMemoryPublicationArchive([candidate]);
  const malformedResult = await createFixturePublisher({
    archive: malformedArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-malformed",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(withoutCitation),
  }).publishDailyBrief();

  assert.equal(malformedResult.status, "rejected");
  assert.match(malformedResult.reason, /缺少/);
  assert.equal(malformedArchive.published, null);

  const inaccessibleArchive = new InMemoryPublicationArchive([candidate]);
  const inaccessibleResult = await createFixturePublisher({
    archive: inaccessibleArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-inaccessible",
    isCitationAccessible: async () => false,
    runtime: runtimeFor(validAssessment),
  }).publishDailyBrief();

  assert.deepEqual(inaccessibleResult, { reason: "引用链接不可访问：https://github.com/openai/codex", status: "rejected" });
  assert.equal(inaccessibleArchive.published, null);
});

test("缺少必填字段、无效结构或已有 Snapshot 时，发布流程不会写入新日报", async () => {
  const missingFieldArchive = new InMemoryPublicationArchive([candidate]);
  const missingFieldResult = await createFixturePublisher({
    archive: missingFieldArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-missing-field",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, risk: "" }),
  }).publishDailyBrief();
  assert.deepEqual(missingFieldResult, { reason: "openai/codex：缺少必填字段：risk", status: "rejected" });
  assert.equal(missingFieldArchive.published, null);

  const invalidArchive = new InMemoryPublicationArchive([candidate]);
  const invalidResult = await createFixturePublisher({
    archive: invalidArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-invalid",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, citations: null } as unknown as GroundedAssessment),
  }).publishDailyBrief();
  assert.deepEqual(invalidResult, { reason: "openai/codex：评估结构无效。", status: "rejected" });
  assert.equal(invalidArchive.published, null);

  const unexpectedCitationArchive = new InMemoryPublicationArchive([candidate]);
  const unexpectedCitationResult = await createFixturePublisher({
    archive: unexpectedCitationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-unexpected-citation",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({
      ...validAssessment,
      citations: { ...validAssessment.citations, unsupported: { value: "not-an-array" } } as unknown as GroundedAssessment["citations"],
    }),
  }).publishDailyBrief();
  assert.deepEqual(unexpectedCitationResult, { reason: "openai/codex：评估结构无效。", status: "rejected" });
  assert.equal(unexpectedCitationArchive.published, null);

  const existingArchive = new InMemoryPublicationArchive([candidate]);
  existingArchive.hasPublishedBrief = async () => true;
  const existingResult = await createFixturePublisher({
    archive: existingArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-overwrite",
    isCitationAccessible: async () => true,
    runtime: { assess: async () => { throw new Error("不应调用 Runtime"); }, id: "compatible:fixture" },
  }).publishDailyBrief();
  assert.deepEqual(existingResult, { status: "already-published" });
  assert.equal(existingArchive.published, null);
});

test("Runtime 不能生成有效评估时，发布流程延迟 Candidate 且不写入 Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const result = await createFixturePublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-runtime-failure",
    isCitationAccessible: async () => true,
    runtime: { assess: async () => { throw new Error("Compatible Runtime 未返回有效 JSON 评估。"); }, id: "compatible:fixture" },
  }).publishDailyBrief();

  assert.deepEqual(result, { reason: "openai/codex：Compatible Runtime 未返回有效 JSON 评估。（已重试 3 次）", status: "delayed" });
  assert.equal(archive.published, null);
});

test("发布校验拒绝非中文评估，并保留每个来源的原始标题", async () => {
  const englishArchive = new InMemoryPublicationArchive([candidate]);
  const englishResult = await createFixturePublisher({
    archive: englishArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-english",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, summary: "Builder should try this first." }),
  }).publishDailyBrief();
  assert.deepEqual(englishResult, { reason: "openai/codex：Grounded Assessment 必须使用中文。", status: "rejected" });

  const multiSourceCandidate: PublicationCandidate = {
    ...candidate,
    evidence: [
      candidate.evidence[0]!,
      { canonicalIdentifier: "official:codex-release", sourceName: "Official Release", sourceTitle: "Codex Release Notes", sourceUrl: "https://openai.com/codex-release" },
    ],
  };
  const archive = new InMemoryPublicationArchive([multiSourceCandidate]);
  const runtime = runtimeFor({
    ...validAssessment,
    citations: {
      happened: ["https://github.com/openai/codex"],
      technicalBasis: ["https://github.com/openai/codex"],
      whyNow: ["https://github.com/openai/codex"],
    },
  });
  await createFixturePublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-source-title",
    isCitationAccessible: async () => true,
    runtime,
  }).publishDailyBrief();

  assert.deepEqual(archive.published?.signals[0]?.evidence, [
    { label: "openai/codex", source: "GitHub Trending", url: "https://github.com/openai/codex" },
    { label: "Codex Release Notes", source: "Official Release", url: "https://openai.com/codex-release" },
  ]);
});

test("固定 Runtime 端到端发布后，公开 Brief 仅读取新建 Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const publisher = createFixturePublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-e2e",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(validAssessment),
  });

  assert.deepEqual(await publisher.publishDailyBrief(), { briefId: "brief-e2e", signalCount: 1, status: "published" });
  const published = archive.published;
  if (!published) throw new Error("Fixture 未创建 Brief Snapshot。");
  const brief = createArchiveRadarBrief({
    assessment: { candidateCount: 0, status: "unpublished" },
    brief: {
      publishedAt: published.publishedAt,
      provenance: published.provenance,
      signals: published.signals.map((signal, index) => ({
        builderValue: signal.builderValue,
        evidence: [...signal.evidence],
        happened: signal.happened,
        id: `${published.id}:signal:${index + 1}`,
        index: String(index + 1).padStart(2, "0"),
        priority: signal.priority,
        productOpportunity: signal.productOpportunity,
        risk: signal.risk,
        sectionCitations: {
          happened: [...signal.sectionCitations.happened],
          technicalBasis: [...signal.sectionCitations.technicalBasis],
          whyNow: [...signal.sectionCitations.whyNow],
        },
        sources: [...signal.sources],
        state: signal.state,
        summary: signal.summary,
        technicalBasis: signal.technicalBasis,
        title: signal.title,
        topics: [...signal.topics],
        whyNow: signal.whyNow,
      })),
    },
    connectors: [],
    topicOptions: ["全部主题"],
  });

  assert.equal(brief.mode, "archive");
  assert.equal(brief.availability, "published");
  assert.equal(brief.signals[0]?.title, "openai/codex");
  assert.deepEqual(brief.signals[0]?.sectionCitations, validAssessment.citations);
});
