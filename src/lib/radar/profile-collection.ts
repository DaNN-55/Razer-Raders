import type { SourceConnector } from "./assessment-pipeline.ts";
import { createCandidateFilter } from "./candidate-filter.ts";
import { githubTrendingConnector } from "./connectors/github-trending.ts";
import { huggingFaceTrendingConnector } from "./connectors/hugging-face-trending.ts";
import { createOfficialReleaseWatchlistConnector } from "./connectors/official-release-watchlist.ts";
import { showHnConnector } from "./connectors/show-hn.ts";
import type { RadarProfile } from "./radar-profile.ts";

const connectors = {
  "github-trending": githubTrendingConnector,
  "hugging-face-trending": huggingFaceTrendingConnector,
  "show-hn": showHnConnector,
};

export function createProfileCandidateFilter(profile: RadarProfile) {
  return createCandidateFilter({ excludeTerms: profile.excludeTerms, includeTerms: profile.includeTerms });
}

export function createProfileSourceConnectors(profile: RadarProfile): readonly SourceConnector[] {
  return profile.enabledConnectorIds.map((id) => {
    if (id === "official-watchlist") return createOfficialReleaseWatchlistConnector(profile.officialWatchlist);
    return connectors[id];
  });
}
