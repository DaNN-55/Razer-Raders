import type { SourceConnector } from "../assessment-pipeline.ts";
import { fetchRegisteredPage, type FetchedPage, type RegisteredSource } from "../fetch-gateway.ts";
import type { Candidate, CollectionResult, SourceEvidence } from "./types.ts";

const CONNECTOR_ID = "official-watchlist";
const CONNECTOR_VERSION = "official-watchlist@v1";

export type OfficialReleaseWatchlistEntry = RegisteredSource & {
  name: string;
};

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

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Official Release Watchlist 条目缺少 ${field}。`);
  return value.trim();
}

function parseEntry(value: unknown): OfficialReleaseWatchlistEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Official Release Watchlist 条目必须是对象。");
  const entry = value as { allowedHosts?: unknown; name?: unknown; url?: unknown };
  const name = requireString(entry.name, "name");
  const rawUrl = requireString(entry.url, "url");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Official Release Watchlist 仅允许明确登记的 HTTPS URL。");
  if (!Array.isArray(entry.allowedHosts) || entry.allowedHosts.length === 0 || entry.allowedHosts.some((host) => typeof host !== "string" || !host.trim())) {
    throw new Error("Official Release Watchlist 条目必须登记允许域名。");
  }
  const allowedHosts = [...new Set(entry.allowedHosts.map((host) => host.trim().toLowerCase()))];
  if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("Official Release Watchlist URL 必须属于登记的允许域名。");

  return { allowedHosts, name, url: url.toString() };
}

export function readOfficialReleaseWatchlist(environment: WatchlistEnvironment = process.env as WatchlistEnvironment): readonly OfficialReleaseWatchlistEntry[] {
  const configured = environment.RADAR_OFFICIAL_WATCHLIST?.trim();
  if (!configured) return [];

  let entries: unknown;
  try {
    entries = JSON.parse(configured);
  } catch {
    throw new Error("RADAR_OFFICIAL_WATCHLIST 必须是 JSON 数组。");
  }
  if (!Array.isArray(entries)) throw new Error("RADAR_OFFICIAL_WATCHLIST 必须是 JSON 数组。");
  return entries.map(parseEntry);
}

function createCandidate(entry: OfficialReleaseWatchlistEntry, html: string, collectedAt: string): Candidate {
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
  entries: readonly OfficialReleaseWatchlistEntry[],
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

export function createOfficialReleaseWatchlistConnector(entries: readonly OfficialReleaseWatchlistEntry[]): SourceConnector {
  return { collect: () => collectOfficialReleaseWatchlist(entries), id: CONNECTOR_ID };
}
