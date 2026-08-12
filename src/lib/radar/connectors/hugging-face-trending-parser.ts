import type { Candidate } from "./types.ts";

const CONNECTOR_ID = "hugging-face-trending";
const MODEL_CARD_PATTERN = /<article\b[^>]*class="[^"]*overview-card-wrapper[^"]*"[^>]*>[\s\S]*?<a\b[^>]*href="\/([^"?#]+)"[^>]*>[\s\S]*?<h4\b[^>]*>([^<]+)<\/h4>/g;
const MODEL_ID_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function parseHuggingFaceTrendingPage(html: string, collectedAt: string): readonly Candidate[] {
  const candidates: Candidate[] = [];
  const modelIdentifiers = new Set<string>();

  for (const match of html.matchAll(MODEL_CARD_PATTERN)) {
    const modelIdentifier = match[1]?.trim();
    const title = match[2]?.trim();
    if (!modelIdentifier || !title || modelIdentifier !== title || !MODEL_ID_PATTERN.test(modelIdentifier) || modelIdentifiers.has(modelIdentifier.toLowerCase())) continue;

    modelIdentifiers.add(modelIdentifier.toLowerCase());
    const canonicalIdentifier = `hugging-face:${modelIdentifier.toLowerCase()}`;
    const url = `https://huggingface.co/${modelIdentifier}`;
    candidates.push({
      canonicalIdentifier,
      collectedAt,
      connectorId: CONNECTOR_ID,
      evidence: [{
        canonicalIdentifier,
        collectedAt,
        connectorId: CONNECTOR_ID,
        sourceName: "Hugging Face",
        sourceTitle: title,
        sourceUrl: url,
        trust: "untrusted",
      }],
      signalType: "model",
      subjectCanonicalIdentifier: canonicalIdentifier,
      title,
      url,
    });
  }

  return candidates;
}
