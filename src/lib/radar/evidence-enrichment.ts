import { createHash } from "node:crypto";
import type { Candidate } from "./connectors/types.ts";
import { fetchRegisteredPage, type FetchedPage, type RegisteredSource } from "./fetch-gateway.ts";

const MAX_EXCERPT_LENGTH = 500;

export type EvidenceDigest = {
  canonicalIdentifier: string;
  contentFingerprint: string;
  excerpts: readonly string[];
  fetchedAt: string;
  sourceKind: "github-repository-description" | "github-readme" | "github-readme-function" | "github-release" | "hugging-face-summary" | "hugging-face-usage" | "hugging-face-technical";
  sourceName: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type EvidenceDigestArchive = {
  findEvidenceDigest: (input: Pick<EvidenceDigest, "canonicalIdentifier" | "contentFingerprint" | "sourceKind" | "sourceUrl">) => Promise<EvidenceDigest | null>;
  linkEvidenceDigest: (input: { candidateCanonicalIdentifier: string; digest: EvidenceDigest }) => Promise<void>;
  saveEvidenceDigest: (input: { candidateCanonicalIdentifier: string; digest: EvidenceDigest }) => Promise<void>;
};

type EvidenceFetcher = (source: RegisteredSource) => Promise<FetchedPage>;

type EvidenceStage = Pick<EvidenceDigest, "excerpts" | "sourceKind" | "sourceName" | "sourceTitle" | "sourceUrl">;

export type EvidenceEnrichmentResult = {
  candidateCanonicalIdentifier: string;
  digests: readonly EvidenceDigest[];
  resolvedCanonicalIdentifier?: string;
  errorMessage?: string;
  status: "enriched" | "failed" | "insufficient-evidence";
};

function decodeHtml(value: string) {
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|gt|lt|quot|#39);/gi, (_, hexadecimal, decimal, named) => {
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return ({ "#39": "'", amp: "&", gt: ">", lt: "<", quot: "\"" } as Record<string, string>)[String(named).toLowerCase()] ?? _;
  });
}

function textExcerpt(value: string) {
  const text = redactLikelySecrets(decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").trim()));
  return text.length > MAX_EXCERPT_LENGTH ? `${text.slice(0, MAX_EXCERPT_LENGTH - 1).trimEnd()}…` : text;
}

function redactLikelySecrets(value: string) {
  return value
    .replace(/\b(?:api[_-]?key|authorization|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, (match) => `${match.slice(0, match.indexOf(":") >= 0 ? match.indexOf(":") + 1 : match.indexOf("=") + 1)} [REDACTED]`)
    .replace(/\b(?:sk|ghp|github_pat|hf)_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]");
}

function attribute(tag: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(tag);
  return match?.[2] ? decodeHtml(match[2]).trim() : "";
}

function documentTitle(html: string, fallback: string) {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title ? textExcerpt(title) || fallback : fallback;
}

function contentFingerprint(body: string) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function isAnswerableExcerpt(excerpt: string) {
  return excerpt.length >= 60 && /\b(for|to|helps?|enables?|allows?|build|run|use)\b|用于|帮助|让(?:开发者)?|可以|能够/i.test(excerpt);
}

function exactUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function githubIdentity(value: string) {
  const url = exactUrl(value);
  if (!url || url.hostname !== "github.com") return null;
  const match = /^\/([\w.-]+)\/([\w.-]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  const repository = `${match[1]}/${match[2]}`;
  return { canonicalIdentifier: `github:${repository.toLowerCase()}`, repository, url: `https://github.com/${repository}` };
}

function huggingFaceIdentity(value: string) {
  const url = exactUrl(value);
  if (!url || url.hostname !== "huggingface.co") return null;
  const match = /^\/([\w.-]+)\/([\w.-]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  const model = `${match[1]}/${match[2]}`;
  return { canonicalIdentifier: `hugging-face:${model.toLowerCase()}`, model, url: `https://huggingface.co/${model}` };
}

function repositoryDescription(html: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attribute(tag, "name").toLowerCase() !== "description") continue;
    return attribute(tag, "content").replace(/^GitHub\s*-\s*[^:]+:\s*/i, "").trim();
  }
  return "";
}

function readmeExcerpt(html: string) {
  const article = /<article\b[^>]*class=["'][^"']*markdown-body[^"']*["'][^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? html;
  const opening = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(article)?.[1];
  return opening ? textExcerpt(opening) : "";
}

function readmeFunctionExcerpt(html: string) {
  return sectionExcerpt(html, /(?:features?|what\s+it\s+does|usage)/i);
}

function releaseExcerpt(html: string) {
  const release = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? html;
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(release)?.[1];
  return paragraph ? textExcerpt(paragraph) : "";
}

function modelCardSummary(html: string) {
  const prose = /<div\b[^>]*class=["'][^"']*prose[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? html;
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(prose)?.[1];
  return paragraph ? textExcerpt(paragraph) : "";
}

function sectionExcerpt(html: string, headingPattern: RegExp) {
  const heading = new RegExp(`<h[1-6]\\b[^>]*>\\s*${headingPattern.source}\\s*<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6]\\b|$)`, "i").exec(html)?.[1];
  const content = heading ?? "";
  const paragraph = /<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/i.exec(content)?.[1];
  return paragraph ? textExcerpt(paragraph) : "";
}

function eligibleProjectUrl(candidate: Candidate) {
  if (candidate.connectorId !== "show-hn") return candidate.url;
  return candidate.evidence.map((evidence) => evidence.sourceUrl).find((url) => Boolean(
    githubIdentity(url) || huggingFaceIdentity(url),
  )) ?? "";
}

function digestFromStage(stage: EvidenceStage, fingerprint: string, fetchedAt: string): EvidenceDigest {
  return {
    canonicalIdentifier: `primary:${stage.sourceKind}:${stage.sourceUrl}`,
    contentFingerprint: fingerprint,
    excerpts: stage.excerpts,
    fetchedAt,
    sourceKind: stage.sourceKind,
    sourceName: redactLikelySecrets(stage.sourceName),
    sourceTitle: redactLikelySecrets(stage.sourceTitle),
    sourceUrl: stage.sourceUrl,
  };
}

export function createEvidenceEnricher(input: {
  archive: EvidenceDigestArchive;
  clock: () => Date;
  fetchPage?: EvidenceFetcher;
}) {
  const fetchPage = input.fetchPage ?? fetchRegisteredPage;
  const retainStage = async (candidate: Candidate, stage: EvidenceStage, body: string) => {
    const fingerprint = contentFingerprint(body);
    const digest = digestFromStage(stage, fingerprint, input.clock().toISOString());
    const existing = await input.archive.findEvidenceDigest({
      canonicalIdentifier: digest.canonicalIdentifier,
      contentFingerprint: digest.contentFingerprint,
      sourceKind: digest.sourceKind,
      sourceUrl: digest.sourceUrl,
    });
    if (existing) {
      await input.archive.linkEvidenceDigest({ candidateCanonicalIdentifier: candidate.canonicalIdentifier, digest: existing });
      return existing;
    }
    await input.archive.saveEvidenceDigest({ candidateCanonicalIdentifier: candidate.canonicalIdentifier, digest });
    return digest;
  };

  return {
    async enrich(candidate: Candidate): Promise<EvidenceEnrichmentResult> {
      const projectUrl = eligibleProjectUrl(candidate);
      const github = githubIdentity(projectUrl);
      if (github) {
        const page = await fetchPage({ allowedHosts: ["github.com"], url: github.url });
        const description = repositoryDescription(page.body);
        const digests: EvidenceDigest[] = [];
        if (description) {
          digests.push(await retainStage(candidate, {
            excerpts: [textExcerpt(description)],
            sourceKind: "github-repository-description",
            sourceName: "GitHub repository description",
            sourceTitle: candidate.title,
            sourceUrl: github.url,
          }, page.body));
        }
        if (!digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" ")))) {
          const readme = readmeExcerpt(page.body);
          if (readme) {
            digests.push(await retainStage(candidate, {
              excerpts: [readme],
              sourceKind: "github-readme",
              sourceName: "GitHub README",
              sourceTitle: candidate.title,
              sourceUrl: github.url,
            }, page.body));
          }
        }
        if (!digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" ")))) {
          const functions = readmeFunctionExcerpt(page.body);
          if (functions) {
            digests.push(await retainStage(candidate, {
              excerpts: [functions],
              sourceKind: "github-readme-function",
              sourceName: "GitHub README",
              sourceTitle: candidate.title,
              sourceUrl: github.url,
            }, page.body));
          }
        }
        if (!digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" ")))) {
          const releaseUrl = `${github.url}/releases`;
          const releases = await fetchPage({ allowedHosts: ["github.com"], url: releaseUrl });
          const release = releaseExcerpt(releases.body);
          if (release) {
            digests.push(await retainStage(candidate, {
              excerpts: [release],
              sourceKind: "github-release",
              sourceName: "GitHub Releases",
              sourceTitle: documentTitle(releases.body, candidate.title),
              sourceUrl: releaseUrl,
            }, releases.body));
          }
        }
        return {
          candidateCanonicalIdentifier: candidate.canonicalIdentifier,
          digests,
          resolvedCanonicalIdentifier: github.canonicalIdentifier,
          status: digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" "))) ? "enriched" : "insufficient-evidence",
        };
      }
      const huggingFace = huggingFaceIdentity(projectUrl);
      if (huggingFace) {
        const page = await fetchPage({ allowedHosts: ["huggingface.co"], url: huggingFace.url });
        const digests: EvidenceDigest[] = [];
        const summary = modelCardSummary(page.body);
        if (summary) {
          digests.push(await retainStage(candidate, {
            excerpts: [summary],
            sourceKind: "hugging-face-summary",
            sourceName: "Hugging Face model card summary",
            sourceTitle: candidate.title,
            sourceUrl: huggingFace.url,
          }, page.body));
        }
        if (!digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" ")))) {
          const usage = sectionExcerpt(page.body, /usage/i);
          if (usage) {
            digests.push(await retainStage(candidate, {
              excerpts: [usage],
              sourceKind: "hugging-face-usage",
              sourceName: "Hugging Face model card usage",
              sourceTitle: candidate.title,
              sourceUrl: huggingFace.url,
            }, page.body));
          }
        }
        if (!digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" ")))) {
          const technical = sectionExcerpt(page.body, /(?:technical|architecture|details)/i);
          if (technical) {
            digests.push(await retainStage(candidate, {
              excerpts: [technical],
              sourceKind: "hugging-face-technical",
              sourceName: "Hugging Face model card technical section",
              sourceTitle: candidate.title,
              sourceUrl: huggingFace.url,
            }, page.body));
          }
        }
        return {
          candidateCanonicalIdentifier: candidate.canonicalIdentifier,
          digests,
          resolvedCanonicalIdentifier: huggingFace.canonicalIdentifier,
          status: digests.some((item) => isAnswerableExcerpt(item.excerpts.join(" "))) ? "enriched" : "insufficient-evidence",
        };
      }
      return { candidateCanonicalIdentifier: candidate.canonicalIdentifier, digests: [], status: "insufficient-evidence" };
    },
  };
}
