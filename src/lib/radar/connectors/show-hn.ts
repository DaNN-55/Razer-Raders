import type { SourceConnector } from "../assessment-pipeline.ts";
import { fetchRegisteredPage, type FetchedPage } from "../fetch-gateway.ts";
import { parseShowHnPage } from "./show-hn-parser.ts";
import type { CollectionResult } from "./types.ts";

const SHOW_HN_SOURCE = {
  allowedHosts: ["news.ycombinator.com"],
  url: "https://news.ycombinator.com/show",
} as const;

export async function collectShowHn(fetchPage: () => Promise<FetchedPage> = () => fetchRegisteredPage(SHOW_HN_SOURCE)): Promise<CollectionResult> {
  const collectedAt = new Date().toISOString();
  const page = await fetchPage();

  return {
    candidates: parseShowHnPage(page.body, collectedAt),
    collectedAt,
    connectorId: "show-hn",
    connectorVersion: "show-hn@v1",
    warnings: [],
  };
}

export const showHnConnector: SourceConnector = {
  collect: collectShowHn,
  id: "show-hn",
};
