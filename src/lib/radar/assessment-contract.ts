export type AssessmentEvidence = {
  canonicalIdentifier: string;
  excerpts?: readonly string[];
  sourceName: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type AssessmentOutcome = "insufficient-evidence" | "outside-radar-scope" | "sufficient-for-ranking";

export type AssessmentCitations = {
  happened: readonly string[];
  summary?: readonly string[];
  technicalBasis: readonly string[];
  whyNow: readonly string[];
};

export type AssessmentWithContent = {
  builderValue: "试用" | "学习" | "跟进" | "跳过";
  citations: AssessmentCitations;
  happened: string;
  productOpportunity: "无" | "待验证" | "值得探索";
  risk: string;
  summary: string;
  technicalBasis: string;
  topics: readonly string[];
  whyNow: string;
};

export type EvidenceFirstAssessment = AssessmentWithContent & {
  assessmentOutcome: "sufficient-for-ranking";
};

export type DeferredAssessment = {
  assessmentOutcome: "insufficient-evidence" | "outside-radar-scope";
  assessmentReason: string;
};

export type LegacyAssessment = AssessmentWithContent & {
  assessmentOutcome?: undefined;
};

export type GroundedAssessment = DeferredAssessment | EvidenceFirstAssessment | LegacyAssessment;

export type AssessableCandidate = {
  evidence: readonly AssessmentEvidence[];
  priority: string;
  selectionReason: string;
  signalState: string;
  title: string;
};

export type ModelRuntime = {
  assess: (candidate: AssessableCandidate, options?: { signal?: AbortSignal }) => Promise<GroundedAssessment>;
  id: string;
};
