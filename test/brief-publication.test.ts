import assert from "node:assert/strict";
import test from "node:test";
import type { GroundedAssessment, ModelRuntime } from "../src/lib/radar/assessment-contract.ts";
import { createBriefPublisher, type PublicationArchive, type PublicationCandidate } from "../src/lib/radar/brief-publication.ts";
import { createArchiveRadarBrief } from "../src/lib/radar/brief-contract.ts";

const candidate: PublicationCandidate = {
  canonicalIdentifier: "github:openai/codex",
  evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
  priority: "值得关注",
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
  published: Parameters<PublicationArchive["publishBrief"]>[0] | null = null;

  constructor(candidates: readonly PublicationCandidate[]) {
    this.candidates = candidates;
  }

  async getCandidatesForPublication() {
    return this.candidates;
  }

  async hasPublishedBrief() {
    return false;
  }

  async publishBrief(input: Parameters<PublicationArchive["publishBrief"]>[0]) {
    this.published = input;
  }
}

function runtimeFor(assessment: GroundedAssessment): ModelRuntime {
  return { assess: async () => assessment, id: "compatible:fixture" };
}

test("固定 Runtime 通过质量门后发布含 Section Citation 的不可变 Brief Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const publisher = createBriefPublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-1",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(validAssessment),
  });

  const result = await publisher.publishFirstBrief();

  assert.deepEqual(result, { briefId: "brief-1", signalCount: 1, status: "published" });
  assert.deepEqual(archive.published, {
    id: "brief-1",
    publishedAt: "2026-08-12T01:00:00.000Z",
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
});

test("缺少事实引用或引用不可访问时，Publication Validation 拒绝发布", async () => {
  const withoutCitation: GroundedAssessment = { ...validAssessment, citations: { happened: [], technicalBasis: [], whyNow: [] } };
  const malformedArchive = new InMemoryPublicationArchive([candidate]);
  const malformedResult = await createBriefPublisher({
    archive: malformedArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-malformed",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(withoutCitation),
  }).publishFirstBrief();

  assert.equal(malformedResult.status, "rejected");
  assert.match(malformedResult.reason, /缺少/);
  assert.equal(malformedArchive.published, null);

  const inaccessibleArchive = new InMemoryPublicationArchive([candidate]);
  const inaccessibleResult = await createBriefPublisher({
    archive: inaccessibleArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-inaccessible",
    isCitationAccessible: async () => false,
    runtime: runtimeFor(validAssessment),
  }).publishFirstBrief();

  assert.deepEqual(inaccessibleResult, { reason: "引用链接不可访问：https://github.com/openai/codex", status: "rejected" });
  assert.equal(inaccessibleArchive.published, null);
});

test("缺少必填字段、无效结构或已有 Snapshot 时，发布流程不会写入新日报", async () => {
  const missingFieldArchive = new InMemoryPublicationArchive([candidate]);
  const missingFieldResult = await createBriefPublisher({
    archive: missingFieldArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-missing-field",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, risk: "" }),
  }).publishFirstBrief();
  assert.deepEqual(missingFieldResult, { reason: "openai/codex：缺少必填字段：risk", status: "rejected" });
  assert.equal(missingFieldArchive.published, null);

  const invalidArchive = new InMemoryPublicationArchive([candidate]);
  const invalidResult = await createBriefPublisher({
    archive: invalidArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-invalid",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, citations: null } as unknown as GroundedAssessment),
  }).publishFirstBrief();
  assert.deepEqual(invalidResult, { reason: "openai/codex：评估结构无效。", status: "rejected" });
  assert.equal(invalidArchive.published, null);

  const unexpectedCitationArchive = new InMemoryPublicationArchive([candidate]);
  const unexpectedCitationResult = await createBriefPublisher({
    archive: unexpectedCitationArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-unexpected-citation",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({
      ...validAssessment,
      citations: { ...validAssessment.citations, unsupported: { value: "not-an-array" } } as unknown as GroundedAssessment["citations"],
    }),
  }).publishFirstBrief();
  assert.deepEqual(unexpectedCitationResult, { reason: "openai/codex：评估结构无效。", status: "rejected" });
  assert.equal(unexpectedCitationArchive.published, null);

  const existingArchive = new InMemoryPublicationArchive([candidate]);
  existingArchive.hasPublishedBrief = async () => true;
  const existingResult = await createBriefPublisher({
    archive: existingArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-overwrite",
    isCitationAccessible: async () => true,
    runtime: { assess: async () => { throw new Error("不应调用 Runtime"); }, id: "compatible:fixture" },
  }).publishFirstBrief();
  assert.deepEqual(existingResult, { status: "already-published" });
  assert.equal(existingArchive.published, null);
});

test("Runtime 不能生成有效评估时，发布流程拒绝且不写入 Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const result = await createBriefPublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-runtime-failure",
    isCitationAccessible: async () => true,
    runtime: { assess: async () => { throw new Error("Compatible Runtime 未返回有效 JSON 评估。"); }, id: "compatible:fixture" },
  }).publishFirstBrief();

  assert.deepEqual(result, { reason: "openai/codex：Compatible Runtime 未返回有效 JSON 评估。", status: "rejected" });
  assert.equal(archive.published, null);
});

test("发布校验拒绝非中文评估，并保留每个来源的原始标题", async () => {
  const englishArchive = new InMemoryPublicationArchive([candidate]);
  const englishResult = await createBriefPublisher({
    archive: englishArchive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-english",
    isCitationAccessible: async () => true,
    runtime: runtimeFor({ ...validAssessment, summary: "Builder should try this first." }),
  }).publishFirstBrief();
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
  await createBriefPublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-source-title",
    isCitationAccessible: async () => true,
    runtime,
  }).publishFirstBrief();

  assert.deepEqual(archive.published?.signals[0]?.evidence, [
    { label: "openai/codex", source: "GitHub Trending", url: "https://github.com/openai/codex" },
    { label: "Codex Release Notes", source: "Official Release", url: "https://openai.com/codex-release" },
  ]);
});

test("固定 Runtime 端到端发布后，公开 Brief 仅读取新建 Snapshot", async () => {
  const archive = new InMemoryPublicationArchive([candidate]);
  const publisher = createBriefPublisher({
    archive,
    clock: () => new Date("2026-08-12T01:00:00.000Z"),
    createBriefId: () => "brief-e2e",
    isCitationAccessible: async () => true,
    runtime: runtimeFor(validAssessment),
  });

  assert.deepEqual(await publisher.publishFirstBrief(), { briefId: "brief-e2e", signalCount: 1, status: "published" });
  const published = archive.published;
  if (!published) throw new Error("Fixture 未创建 Brief Snapshot。");
  const brief = createArchiveRadarBrief({
    assessment: { candidateCount: 0, status: "unpublished" },
    brief: {
      publishedAt: published.publishedAt,
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
