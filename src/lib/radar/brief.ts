import {
  topicOptions as fixtureTopicOptions,
} from "@/components/radar-data";
import {
  getAssessmentState,
  getConnectorHealth,
  getLatestPublishedBrief,
} from "@/lib/radar/archive";
import { createArchiveRadarBrief, createUnpublishedRadarBrief, type RadarBrief } from "@/lib/radar/brief-contract";
import { isDatabaseConfigured } from "@/lib/radar/database";

export { type BriefCoverageConnector, type RadarBrief, type RadarConnector } from "@/lib/radar/brief-contract";

export async function getRadarBrief(): Promise<RadarBrief> {
  if (!isDatabaseConfigured()) return createUnpublishedRadarBrief(fixtureTopicOptions);

  const [brief, connectors, assessment] = await Promise.all([getLatestPublishedBrief(), getConnectorHealth(), getAssessmentState()]);
  return createArchiveRadarBrief({ assessment, brief, connectors, topicOptions: fixtureTopicOptions });
}
