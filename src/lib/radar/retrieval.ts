import { getDatabasePool, isDatabaseConfigured } from "./database.ts";
import type { RadarRetrieval, RadarRetrievalFilter } from "./retrieval-contract.ts";
import { createRadarRetrievalReader, type RadarRetrievalQuery } from "./retrieval-reader.ts";

export async function getRadarRetrieval(filter: RadarRetrievalFilter): Promise<RadarRetrieval> {
  if (!isDatabaseConfigured()) {
    return {
      availability: "empty",
      pagination: { hasMore: false, limit: filter.limit, offset: filter.offset },
      results: [],
    };
  }
  const database = getDatabasePool();
  return createRadarRetrievalReader({
    query: ((text, values) => database.query(text, values as unknown[])) as RadarRetrievalQuery,
  }).retrieve(filter);
}

export async function getRadarRetrievalDetail(signalId: string) {
  if (!isDatabaseConfigured()) return null;
  const database = getDatabasePool();
  return createRadarRetrievalReader({
    query: ((text, values) => database.query(text, values as unknown[])) as RadarRetrievalQuery,
  }).retrieveDetail(signalId);
}
