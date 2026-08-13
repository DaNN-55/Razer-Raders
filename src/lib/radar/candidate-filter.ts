import type { Candidate } from "./connectors/types.ts";

type CandidateFilterEnvironment = {
  RADAR_EXCLUDE_TERMS?: string;
  RADAR_INCLUDE_TERMS?: string;
};

function readTerms(value: string | undefined) {
  return (value ?? "").split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
}

export function createCandidateFilter(input: { excludeTerms: readonly string[]; includeTerms: readonly string[] }) {
  const includeTerms = input.includeTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  const excludeTerms = input.excludeTerms.map((term) => term.trim().toLowerCase()).filter(Boolean);

  return (candidate: Candidate) => {
    const searchable = `${candidate.canonicalIdentifier} ${candidate.title}`.toLowerCase();
    return (!includeTerms.length || includeTerms.some((term) => searchable.includes(term)))
      && !excludeTerms.some((term) => searchable.includes(term));
  };
}

export function createEnvironmentCandidateFilter(environment: CandidateFilterEnvironment = {
  RADAR_EXCLUDE_TERMS: process.env.RADAR_EXCLUDE_TERMS,
  RADAR_INCLUDE_TERMS: process.env.RADAR_INCLUDE_TERMS,
}) {
  return createCandidateFilter({
    excludeTerms: readTerms(environment.RADAR_EXCLUDE_TERMS),
    includeTerms: readTerms(environment.RADAR_INCLUDE_TERMS),
  });
}
