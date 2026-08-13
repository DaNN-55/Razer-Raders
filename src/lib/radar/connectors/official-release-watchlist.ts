import type { SourceConnector } from "../assessment-pipeline.ts";
import { fetchRegisteredPage, type FetchedPage, type RegisteredSource } from "../fetch-gateway.ts";
import { parseOfficialWatchlist, type OfficialWatchlistEntry } from "../radar-profile.ts";
import type { Candidate, CollectionResult, SourceEvidence } from "./types.ts";

const CONNECTOR_ID = "official-watchlist";
const CONNECTOR_VERSION = "official-watchlist@v1";

export type { OfficialWatchlistEntry as OfficialReleaseWatchlistEntry } from "../radar-profile.ts";

type WatchlistEnvironment = {
  RADAR_OFFICIAL_WATCHLIST?: string;
};

function decodeHtml(value: string) {
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|gt|lt|quot|#39);/gi, (_, hexadecimal, decimal, named) => {
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return ({ "#39": "'", amp: "&", gt: ">", lt: "<", quot: "\"" } as Record<string, string>)[String(named).toLowerCase()] ?? _;
  });
}

function getDocumentTitle(html: string, fallback: string) {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title ? decodeHtml(title.replace(/<[^>]+>/g, "")).trim() || fallback : fallback;
}

export function readOfficialReleaseWatchlist(environment: WatchlistEnvironment = process.env as WatchlistEnvironment): readonly OfficialWatchlistEntry[] {
  const configured = environment.RADAR_OFFICIAL_WATCHLIST?.trim();
  if (!configured) return [];

  let entries: unknown;
  try {
    entries = JSON.parse(configured);
  } catch {
    throw new Error("RADAR_OFFICIAL_WATCHLIST 必须是 JSON 数组。");
  }
  if (!Array.isArray(entries)) throw new Error("RADAR_OFFICIAL_WATCHLIST 必须是 JSON 数组。");
  return parseOfficialWatchlist(entries);
}

function createCandidate(entry: OfficialWatchlistEntry, html: string, collectedAt: string): Candidate {
  const canonicalIdentifier = `${CONNECTOR_ID}:${entry.url}`;
  const title = getDocumentTitle(html, entry.name);
  const evidence: SourceEvidence = {
    canonicalIdentifier,
    collectedAt,
    connectorId: CONNECTOR_ID,
    sourceName: entry.name,
    sourceTitle: title,
    sourceUrl: entry.url,
    trust: "untrusted",
  };

  return {
    canonicalIdentifier,
    collectedAt,
    connectorId: CONNECTOR_ID,
    evidence: [evidence],
    signalType: "project",
    subjectCanonicalIdentifier: canonicalIdentifier,
    title,
    url: entry.url,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知采集错误";
}

export async function collectOfficialReleaseWatchlist(
  entries: readonly OfficialWatchlistEntry[],
  fetchPage: (source: RegisteredSource) => Promise<FetchedPage> = fetchRegisteredPage,
): Promise<CollectionResult> {
  const collectedAt = new Date().toISOString();
  const candidates: Candidate[] = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    try {
      const page = await fetchPage(entry);
      candidates.push(createCandidate(entry, page.body, collectedAt));
    } catch (error) {
      warnings.push(`${entry.name}：${errorMessage(error)}`);
    }
  }

  if (entries.length > 0 && candidates.length === 0 && warnings.length > 0) {
    throw new Error(`Official Release Watchlist 采集失败：${warnings.join("；")}`);
  }

  return { candidates, collectedAt, connectorId: CONNECTOR_ID, connectorVersion: CONNECTOR_VERSION, warnings };
}

export function createOfficialReleaseWatchlistConnector(entries: readonly OfficialWatchlistEntry[]): SourceConnector {
  return { collect: () => collectOfficialReleaseWatchlist(entries), id: CONNECTOR_ID };
}
