import type { Signal } from "../../components/radar-data.ts";

export type RadarConnector = {
  caption: string;
  detail?: string | null;
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
  availability: "evaluating" | "published" | "unpublished";
  connectors: readonly RadarConnector[];
  mode: "fixture" | "archive";
  pendingCandidateCount: number;
  publishedAt: string;
  provenance?: BriefProvenance;
  signals: readonly Signal[];
  topicOptions: readonly string[];
};

export type AssessmentState =
  | { candidateCount: number; status: "evaluating" }
  | { candidateCount: 0; status: "unpublished" };

export type PublishedBrief = {
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

  return {
    availability: assessment.status === "evaluating" ? "evaluating" : brief ? "published" : "unpublished",
    connectors,
    mode: "archive",
    pendingCandidateCount: assessment.candidateCount,
    publishedAt: brief?.publishedAt ?? new Date().toISOString(),
    ...(brief ? { provenance: brief.provenance } : {}),
    signals: brief?.signals ?? [],
    topicOptions,
  };
}
