import {
  connectors as fixtureConnectors,
  signals as fixtureSignals,
  topicOptions as fixtureTopicOptions,
  type Signal,
} from "@/components/radar-data";
import { getAssessmentState, getConnectorHealth, getLatestPublishedBrief } from "@/lib/radar/archive";
import { isDatabaseConfigured } from "@/lib/radar/database";

export type RadarConnector = {
  caption: string;
  detail?: string | null;
  name: string;
  status: string;
  tone: string;
};

export type RadarBrief = {
  availability: "evaluating" | "published" | "unpublished";
  connectors: readonly RadarConnector[];
  mode: "fixture" | "archive";
  pendingCandidateCount: number;
  publishedAt: string;
  signals: readonly Signal[];
  topicOptions: readonly string[];
};

const fixtureBrief: RadarBrief = {
  availability: "published",
  connectors: fixtureConnectors,
  mode: "fixture",
  pendingCandidateCount: 0,
  publishedAt: "2026-08-12T09:00:00+08:00",
  signals: fixtureSignals,
  topicOptions: fixtureTopicOptions,
};

export async function getRadarBrief(): Promise<RadarBrief> {
  if (!isDatabaseConfigured()) return fixtureBrief;

  const [brief, connectors, assessment] = await Promise.all([getLatestPublishedBrief(), getConnectorHealth(), getAssessmentState()]);
  return {
    availability: brief ? "published" : assessment.status,
    connectors,
    mode: "archive",
    pendingCandidateCount: assessment.candidateCount,
    publishedAt: brief?.publishedAt ?? new Date().toISOString(),
    signals: brief?.signals ?? [],
    topicOptions: fixtureTopicOptions,
  };
}
