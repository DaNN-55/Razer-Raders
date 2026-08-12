import type { RadarBrief } from "../lib/radar/brief-contract.ts";

type BriefPresentationInput = Pick<RadarBrief, "availability" | "pendingCandidateCount"> & {
  hasPublishedSignals: boolean;
  visibleSignalCount: number;
};

export function getBriefHeading(input: BriefPresentationInput) {
  return input.availability === "evaluating" && !input.hasPublishedSignals
    ? `正在评估 ${input.pendingCandidateCount} 个 AI 候选`
    : `今天，值得你分心的 ${input.visibleSignalCount} 个 AI 信号`;
}

export function getAssessmentBanner(input: BriefPresentationInput) {
  return input.availability === "evaluating" && input.hasPublishedSignals
    ? `另有 ${input.pendingCandidateCount} 个新 Candidate 正在评估，不会混入当前已发布日报。`
    : null;
}
