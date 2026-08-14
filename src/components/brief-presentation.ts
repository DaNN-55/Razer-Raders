import type { Signal } from "./radar-data.ts";
import type { BriefCoverageConnector, RadarBrief } from "../lib/radar/brief-contract.ts";

export const DAILY_BRIEF_PAGE_SIZE = 5;

type BriefPresentationInput = Pick<RadarBrief, "assessmentDelay" | "availability" | "pendingCandidateCount"> & {
  hasPublishedSignals: boolean;
  visibleSignalCount: number;
};

export function getBriefHeading(input: BriefPresentationInput) {
  return input.availability === "evaluating" && !input.hasPublishedSignals
    ? `正在评估 ${input.pendingCandidateCount} 个 AI 候选`
    : input.availability === "assessment-delayed" && !input.hasPublishedSignals
      ? "评估暂时延迟"
    : `今天，值得你分心的 ${input.visibleSignalCount} 个 AI 信号`;
}

export function getAssessmentBanner(input: BriefPresentationInput) {
  if (input.availability === "evaluating" && input.hasPublishedSignals) {
    return `另有 ${input.pendingCandidateCount} 个新 Candidate 正在评估，不会混入当前已发布日报。`;
  }
  if (input.availability === "assessment-delayed") {
    const detail = input.assessmentDelay?.detail ?? "配置的 Model Runtime 暂不可用。";
    return `Assessment Delay：${detail} 未发布半成品日报，也未切换到其他模型。`;
  }
  return null;
}

export function getBriefCoverageLabel(coverage: readonly BriefCoverageConnector[]) {
  const enabled = coverage.filter((connector) => connector.isEnabled);
  const completed = enabled.filter((connector) => connector.status === "新鲜");
  return `本期覆盖 ${completed.length}/${enabled.length} 个已启用来源`;
}

export function getBriefPage<T>(signals: readonly T[], requestedPageIndex: number) {
  const pageCount = Math.ceil(signals.length / DAILY_BRIEF_PAGE_SIZE);
  const pageIndex = Math.min(Math.max(0, requestedPageIndex), Math.max(0, pageCount - 1));
  const start = pageIndex * DAILY_BRIEF_PAGE_SIZE;
  return { pageCount, pageIndex, signals: signals.slice(start, start + DAILY_BRIEF_PAGE_SIZE) };
}

export function getBriefFormatLabel(pipelineVersion: string | undefined) {
  return pipelineVersion?.startsWith("evidence-first-assessment@")
    ? "证据补全版"
    : "旧版评估格式";
}

export function getSignalCardSections(signal: Signal) {
  return [
    { body: signal.happened, citations: signal.sectionCitations?.happened, title: "发生了什么" },
    { body: signal.whyNow, citations: signal.sectionCitations?.whyNow, title: "为什么值得关注" },
    { body: signal.technicalBasis, citations: signal.sectionCitations?.technicalBasis, title: "它靠什么实现" },
    { body: signal.risk, isRisk: true, title: "风险与未知" },
    { body: signal.whyInBrief ?? "旧版 Snapshot 未保留可解释的入选依据。", isSelectionReason: true, title: "为什么它进入今日简报" },
  ] as const;
}
