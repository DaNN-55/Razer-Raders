import type { Signal } from "../../components/radar-data.ts";

export const MAX_DAILY_BRIEF_SIGNALS = 15;

export type RadarConnector = {
  caption: string;
  detail?: string | null;
  name: string;
  status: string;
  tone: string;
};

export type BriefCoverageConnector = {
  connectorId: string;
  isEnabled: boolean;
  name: string;
  status: string;
  tone: string;
};

export type BriefProvenance = {
  configurationVersion: string;
  modelRuntimeId: string;
  pipelineVersion: string;
  rankingPolicyVersion: string;
};

export type RadarBrief = {
  assessmentDelay?: AssessmentDelay;
  availability: "assessment-delayed" | "evaluating" | "published" | "unpublished";
  connectors: readonly RadarConnector[];
  coverage?: readonly BriefCoverageConnector[];
  mode: "fixture" | "archive";
  pendingCandidateCount: number;
  publishedAt: string;
  provenance?: BriefProvenance;
  signals: readonly Signal[];
  topicOptions: readonly string[];
};

export type AssessmentState =
  | { candidateCount: number; detail: string; status: "assessment-delayed" }
  | { candidateCount: number; status: "evaluating" }
  | { candidateCount: 0; status: "unpublished" };

export type AssessmentDelay = {
  candidateCount: number;
  detail: string;
};

export type PublishedBrief = {
  coverage?: readonly BriefCoverageConnector[];
  publishedAt: string;
  provenance: BriefProvenance;
  signals: readonly Signal[];
};

export function createUnpublishedRadarBrief(topicOptions: readonly string[]): RadarBrief {
  return {
    availability: "unpublished",
    connectors: [],
    mode: "archive",
    pendingCandidateCount: 0,
    publishedAt: "",
    signals: [],
    topicOptions,
  };
}

export function createArchiveRadarBrief(input: {
  assessment: AssessmentState;
  brief: PublishedBrief | null;
  connectors: readonly RadarConnector[];
  topicOptions: readonly string[];
}): RadarBrief {
  const { assessment, brief, connectors, topicOptions } = input;

  const assessmentDelay = assessment.status === "assessment-delayed"
    ? { candidateCount: assessment.candidateCount, detail: assessment.detail }
    : undefined;

  const availability = assessment.status === "assessment-delayed" && !brief
    ? "assessment-delayed"
    : assessment.status === "evaluating"
      ? "evaluating"
      : brief
        ? "published"
        : "unpublished";

  return {
    availability,
    ...(assessmentDelay ? { assessmentDelay } : {}),
    connectors,
    ...(brief?.coverage ? { coverage: brief.coverage } : {}),
    mode: "archive",
    pendingCandidateCount: assessment.candidateCount,
    publishedAt: brief?.publishedAt ?? new Date().toISOString(),
    ...(brief ? { provenance: brief.provenance } : {}),
    signals: brief?.signals ?? [],
    topicOptions,
  };
}
