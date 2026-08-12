export type AssessmentEvidence = {
  canonicalIdentifier: string;
  sourceName: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type GroundedAssessment = {
  builderValue: "试用" | "学习" | "跟进" | "跳过";
  citations: {
    happened: readonly string[];
    technicalBasis: readonly string[];
    whyNow: readonly string[];
  };
  happened: string;
  productOpportunity: "无" | "待验证" | "值得探索";
  risk: string;
  summary: string;
  technicalBasis: string;
  topics: readonly string[];
  whyNow: string;
};

export type AssessableCandidate = {
  evidence: readonly AssessmentEvidence[];
  priority: string;
  selectionReason: string;
  signalState: string;
  title: string;
};

export type ModelRuntime = {
  assess: (candidate: AssessableCandidate) => Promise<GroundedAssessment>;
  id: string;
};
