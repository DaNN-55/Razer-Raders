import {
  connectors as fixtureConnectors,
  signals as fixtureSignals,
  topicOptions as fixtureTopicOptions,
} from "@/components/radar-data";
import {
  getAssessmentState,
  getConnectorHealth,
  getLatestPublishedBrief,
} from "@/lib/radar/archive";
import { createArchiveRadarBrief, type RadarBrief } from "@/lib/radar/brief-contract";
import { isDatabaseConfigured } from "@/lib/radar/database";

export { type RadarBrief, type RadarConnector } from "@/lib/radar/brief-contract";

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
  return createArchiveRadarBrief({ assessment, brief, connectors, topicOptions: fixtureTopicOptions });
}
