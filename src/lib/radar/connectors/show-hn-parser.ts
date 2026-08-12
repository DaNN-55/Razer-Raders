import type { Candidate, SourceEvidence } from "./types.ts";

const CONNECTOR_ID = "show-hn";
const HACKER_NEWS_ORIGIN = "https://news.ycombinator.com";
const SHOW_HN_ITEM_PATTERN = /<tr\b[^>]*class="[^"]*\bathing\b[^"]*"[^>]*\bid="(\d+)"[^>]*>[\s\S]*?<span\b[^>]*class="titleline"[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const NAMED_HTML_ENTITIES: Record<string, string> = { "#39": "'", amp: "&", gt: ">", lt: "<", quot: "\"" };

function decodeHtml(value: string) {
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|gt|lt|quot|#39);/gi, (_, hexadecimal, decimal, named) => {
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return NAMED_HTML_ENTITIES[String(named).toLowerCase()] ?? _;
  });
}

function relatedEvidence(itemId: string, title: string, href: string, collectedAt: string): SourceEvidence {
  const itemUrl = `${HACKER_NEWS_ORIGIN}/item?id=${itemId}`;
  let sourceUrl = itemUrl;
  let canonicalIdentifier = `show-hn:${itemId}`;
  try {
    const source = new URL(decodeHtml(href), HACKER_NEWS_ORIGIN);
    if (source.protocol === "https:" && source.origin !== HACKER_NEWS_ORIGIN) {
      sourceUrl = source.toString();
      canonicalIdentifier = `show-hn:${itemId}:link`;
    }
  } catch {
    // 保留 HN 帖子链接，避免把未验证的原始 href 写入 Evidence。
  }

  return {
    canonicalIdentifier,
    collectedAt,
    connectorId: CONNECTOR_ID,
    sourceName: "Hacker News Show HN",
    sourceTitle: title,
    sourceUrl,
    trust: "untrusted",
  };
}

export function parseShowHnPage(html: string, collectedAt: string): readonly Candidate[] {
  const candidates: Candidate[] = [];
  const itemIds = new Set<string>();

  for (const match of html.matchAll(SHOW_HN_ITEM_PATTERN)) {
    const itemId = match[1];
    const href = match[2];
    const title = match[3] ? decodeHtml(match[3].replace(/<[^>]+>/g, "")).trim() : "";
    if (!itemId || !href || !title || itemIds.has(itemId)) continue;

    itemIds.add(itemId);
    const canonicalIdentifier = `show-hn:${itemId}`;
    const url = `${HACKER_NEWS_ORIGIN}/item?id=${itemId}`;
    candidates.push({
      canonicalIdentifier,
      collectedAt,
      connectorId: CONNECTOR_ID,
      evidence: [relatedEvidence(itemId, title, href, collectedAt)],
      signalType: "project",
      subjectCanonicalIdentifier: canonicalIdentifier,
      title,
      url,
    });
  }

  return candidates;
}
