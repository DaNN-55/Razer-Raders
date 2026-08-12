import type { RadarBrief } from "../lib/radar/brief-contract.ts";

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
