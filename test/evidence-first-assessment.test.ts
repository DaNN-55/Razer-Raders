import assert from "node:assert/strict";
import test from "node:test";
import type { DeferredAssessment, EvidenceFirstAssessment, GroundedAssessment } from "../src/lib/radar/assessment-contract.ts";
import { createAssessmentPrompt } from "../src/lib/radar/assessment-prompt.ts";
import { rankReadyAssessments, validateAssessment, validateEvidenceFirstAssessment, type PublicationCandidate, type ReadyPublicationAssessment } from "../src/lib/radar/brief-publication.ts";

const candidate: PublicationCandidate = {
  canonicalIdentifier: "github:acme/agent",
  evidence: [{ canonicalIdentifier: "primary:github:acme/agent", excerpts: ["An agent framework that lets developers run local coding tasks with approval gates."], sourceName: "GitHub README", sourceTitle: "acme/agent", sourceUrl: "https://github.com/acme/agent" }],
  priority: "值得关注",
  rankingPolicyVersion: "v0.1",
  rankingScore: 1,
  selectionReason: "Primary README 说明了本地代码任务工作流。",
  signalState: "新出现",
  title: "acme/agent",
};

test("质量门拒绝只把收集热度当作值得关注理由的 Assessment", () => {
  const assessment: GroundedAssessment = {
    assessmentOutcome: "sufficient-for-ranking",
    builderValue: "试用",
    citations: {
      happened: ["https://github.com/acme/agent"],
      summary: ["https://github.com/acme/agent"],
      technicalBasis: ["https://github.com/acme/agent"],
      whyNow: ["https://github.com/acme/agent"],
    },
    happened: "未确认新的发布或能力变化。",
    productOpportunity: "待验证",
    risk: "尚未验证真实任务的可靠性。",
    summary: "面向本地开发者的代码任务 Agent。",
    technicalBasis: "通过本地任务执行与审批门控制操作。",
    topics: ["开发工具"],
    whyNow: "它在本轮收集里排名很高，且被重复收集。",
  };

  assert.equal(validateAssessment(candidate, assessment), "为什么值得关注不能以热度或重复收集作为主要理由。");
});

test("Evidence-first 质量门要求完整事实引用，并允许模型报告待补证而非失败", () => {
  const sufficient = {
    assessmentOutcome: "sufficient-for-ranking",
    builderValue: "试用",
    citations: {
      happened: ["https://github.com/acme/agent"],
      summary: ["https://github.com/acme/agent"],
      technicalBasis: ["https://github.com/acme/agent"],
      whyNow: ["https://github.com/acme/agent"],
    },
    happened: "未确认新的发布或能力变化。",
    productOpportunity: "待验证",
    risk: "尚未验证真实任务的可靠性。",
    summary: "面向本地开发者的代码任务 Agent。",
    technicalBasis: "通过本地任务执行与审批门控制操作。",
    topics: ["开发工具"],
    whyNow: "需要在本地代码任务中减少重复操作的开发者，可以先用它验证审批流程。",
  } satisfies EvidenceFirstAssessment;
  const insufficient = { assessmentOutcome: "insufficient-evidence", assessmentReason: "Primary Evidence 未说明具体使用场景。" } satisfies DeferredAssessment;

  assert.equal(validateEvidenceFirstAssessment(candidate, sufficient), null);
  assert.equal(validateEvidenceFirstAssessment(candidate, { ...sufficient, citations: { ...sufficient.citations, summary: [] } }), "缺少 summary 的事实引用。");
  assert.equal(validateEvidenceFirstAssessment(candidate, insufficient), null);
});

test("提示词要求固定 Evidence-first 字段和三种模型结果", () => {
  const prompt = createAssessmentPrompt(candidate);

  assert.match(prompt, /assessmentOutcome/);
  assert.match(prompt, /sufficient-for-ranking/);
  assert.match(prompt, /insufficient-evidence/);
  assert.match(prompt, /outside-radar-scope/);
  assert.match(prompt, /citations\.summary/);
});

test("透明 Ranking 先按 Builder 行动价值与证据充分度，再以发现信号打破同档", () => {
  const base = {
    assessmentOutcome: "sufficient-for-ranking",
    citations: { happened: [candidate.evidence[0]!.sourceUrl], summary: [candidate.evidence[0]!.sourceUrl], technicalBasis: [candidate.evidence[0]!.sourceUrl], whyNow: [candidate.evidence[0]!.sourceUrl] },
    happened: "未确认新的发布或能力变化。",
    productOpportunity: "值得探索",
    risk: "需要验证真实工作流。",
    summary: "面向本地开发者的代码任务 Agent。",
    technicalBasis: "通过本地任务执行与审批门控制操作。",
    topics: ["开发工具"],
    whyNow: "需要在本地代码任务中减少重复操作的开发者，可以先用它验证审批流程。",
  } as const;
  const ready: ReadyPublicationAssessment[] = [
    { assessment: { ...base, builderValue: "学习" }, candidate: { ...candidate, canonicalIdentifier: "github:acme/learn", rankingScore: 9 }, configurationVersion: "profile@v1", runtimeId: "ollama:fixture", ranking: { crossSourceCount: 4, observationCount: 8, primaryEvidenceCount: 3 } },
    { assessment: { ...base, builderValue: "试用" }, candidate: { ...candidate, canonicalIdentifier: "github:acme/try", rankingScore: 1 }, configurationVersion: "profile@v1", runtimeId: "ollama:fixture", ranking: { crossSourceCount: 1, observationCount: 1, primaryEvidenceCount: 1 } },
    { assessment: { ...base, builderValue: "试用" }, candidate: { ...candidate, canonicalIdentifier: "github:acme/try-with-evidence", rankingScore: 0 }, configurationVersion: "profile@v1", runtimeId: "ollama:fixture", ranking: { crossSourceCount: 1, observationCount: 1, primaryEvidenceCount: 2 } },
  ];

  assert.deepEqual(rankReadyAssessments(ready).map((item) => item.candidate.canonicalIdentifier), ["github:acme/try-with-evidence", "github:acme/try", "github:acme/learn"]);
});
