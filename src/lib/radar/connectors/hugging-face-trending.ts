import { fetchRegisteredPage, type FetchedPage } from "../fetch-gateway.ts";
import { parseHuggingFaceTrendingPage } from "./hugging-face-trending-parser.ts";
import type { CollectionResult } from "./types.ts";
import type { SourceConnector } from "../assessment-pipeline.ts";

const HUGGING_FACE_TRENDING_SOURCE = {
  allowedHosts: ["huggingface.co"],
  url: "https://huggingface.co/models?sort=trending",
} as const;

export async function collectHuggingFaceTrending(fetchPage: () => Promise<FetchedPage> = () => fetchRegisteredPage(HUGGING_FACE_TRENDING_SOURCE)): Promise<CollectionResult> {
  const collectedAt = new Date().toISOString();
  const page = await fetchPage();

  return {
    candidates: parseHuggingFaceTrendingPage(page.body, collectedAt),
    collectedAt,
    connectorId: "hugging-face-trending",
    connectorVersion: "hugging-face-trending@v1",
    warnings: [],
  };
}

export const huggingFaceTrendingConnector: SourceConnector = {
  collect: collectHuggingFaceTrending,
  id: "hugging-face-trending",
};
