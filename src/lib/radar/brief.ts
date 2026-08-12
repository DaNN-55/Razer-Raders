import {
  connectors as fixtureConnectors,
  signals as fixtureSignals,
  topicOptions as fixtureTopicOptions,
  type Signal,
} from "@/components/radar-data";
import { getConnectorHealth, getLatestPublishedBrief } from "@/lib/radar/archive";
import { isDatabaseConfigured } from "@/lib/radar/database";

export type RadarConnector = {
  caption: string;
  detail?: string | null;
  name: string;
  status: string;
  tone: string;
};

export type RadarBrief = {
  connectors: readonly RadarConnector[];
  mode: "fixture" | "archive";
  publishedAt: string;
  signals: readonly Signal[];
  topicOptions: readonly string[];
};

const fixtureBrief: RadarBrief = {
  connectors: fixtureConnectors,
  mode: "fixture",
  publishedAt: "2026-08-12T09:00:00+08:00",
  signals: fixtureSignals,
  topicOptions: fixtureTopicOptions,
};

export async function getRadarBrief(): Promise<RadarBrief> {
  if (!isDatabaseConfigured()) return fixtureBrief;

  const [brief, connectors] = await Promise.all([getLatestPublishedBrief(), getConnectorHealth()]);
  return {
    connectors,
    mode: "archive",
    publishedAt: brief?.publishedAt ?? new Date().toISOString(),
    signals: brief?.signals ?? [],
    topicOptions: fixtureTopicOptions,
  };
}
