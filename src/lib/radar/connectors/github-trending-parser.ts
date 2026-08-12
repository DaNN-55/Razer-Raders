import type { Candidate } from "./types.ts";

const CONNECTOR_ID = "github-trending";
const REPOSITORY_PATTERN = /<article\b[^>]*class="[^"]*Box-row[^"]*"[\s\S]*?<h2\b[\s\S]*?<a\b[^>]*href="\/([^"?#]+)"/g;

export function parseGitHubTrendingPage(html: string, collectedAt: string): readonly Candidate[] {
  const candidates: Candidate[] = [];
  const repositoryNames = new Set<string>();

  for (const match of html.matchAll(REPOSITORY_PATTERN)) {
    const repository = match[1]?.trim();
    if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repositoryNames.has(repository)) continue;

    repositoryNames.add(repository);
    const url = `https://github.com/${repository}`;
    candidates.push({
      canonicalIdentifier: `github:${repository.toLowerCase()}`,
      collectedAt,
      connectorId: CONNECTOR_ID,
      evidence: [{
        canonicalIdentifier: `github:${repository.toLowerCase()}`,
        collectedAt,
        connectorId: CONNECTOR_ID,
        sourceName: "GitHub Trending",
        sourceUrl: url,
        trust: "untrusted",
      }],
      signalType: "project",
      subjectCanonicalIdentifier: `github:${repository.toLowerCase()}`,
      title: repository,
      url,
    });
  }

  return candidates;
}
