import { fetchRegisteredPage, type FetchedPage } from "../fetch-gateway.ts";
import { parseGitHubTrendingPage } from "./github-trending-parser.ts";
import type { CollectionResult } from "./types.ts";
import type { SourceConnector } from "../assessment-pipeline.ts";

const CONNECTOR_ID = "github-trending";
const CONNECTOR_VERSION = "github-trending@v1";
const GITHUB_TRENDING_SOURCE = {
  allowedHosts: ["github.com"],
  url: "https://github.com/trending?since=daily",
} as const;
export async function collectGitHubTrending(fetchPage: () => Promise<FetchedPage> = () => fetchRegisteredPage(GITHUB_TRENDING_SOURCE)): Promise<CollectionResult> {
  const collectedAt = new Date().toISOString();
  const page = await fetchPage();

  return {
    candidates: parseGitHubTrendingPage(page.body, collectedAt),
    collectedAt,
    connectorId: CONNECTOR_ID,
    connectorVersion: CONNECTOR_VERSION,
    warnings: [],
  };
}

export const githubTrendingConnector: SourceConnector = {
  collect: collectGitHubTrending,
  id: CONNECTOR_ID,
};
