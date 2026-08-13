import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceEnricher, type EvidenceDigestArchive } from "../src/lib/radar/evidence-enrichment.ts";
import type { Candidate } from "../src/lib/radar/connectors/types.ts";

class InMemoryEvidenceDigestArchive implements EvidenceDigestArchive {
  readonly digests = new Map<string, Awaited<ReturnType<EvidenceDigestArchive["findEvidenceDigest"]>>>();
  readonly saved: Parameters<EvidenceDigestArchive["saveEvidenceDigest"]>[0][] = [];

  async findEvidenceDigest(input: Parameters<EvidenceDigestArchive["findEvidenceDigest"]>[0]) {
    return this.digests.get(`${input.canonicalIdentifier}:${input.contentFingerprint}`) ?? null;
  }

  async saveEvidenceDigest(input: Parameters<EvidenceDigestArchive["saveEvidenceDigest"]>[0]) {
    this.saved.push(input);
    this.digests.set(`${input.digest.canonicalIdentifier}:${input.digest.contentFingerprint}`, input.digest);
  }

  async linkEvidenceDigest() {}
}

const githubCandidate: Candidate = {
  canonicalIdentifier: "github:openai/codex",
  collectedAt: "2026-08-13T02:00:00.000Z",
  connectorId: "github-trending",
  evidence: [],
  signalType: "project",
  subjectCanonicalIdentifier: "github:openai/codex",
  title: "openai/codex",
  url: "https://github.com/openai/codex",
};

const huggingFaceCandidate: Candidate = {
  ...githubCandidate,
  canonicalIdentifier: "hugging-face:qwen/qwen3-8b",
  connectorId: "hugging-face-trending",
  signalType: "model",
  subjectCanonicalIdentifier: "hugging-face:qwen/qwen3-8b",
  title: "Qwen/Qwen3-8B",
  url: "https://huggingface.co/Qwen/Qwen3-8B",
};

const officialCandidate: Candidate = {
  ...githubCandidate,
  canonicalIdentifier: "official-watchlist:https://openai.example/news/gpt-5",
  connectorId: "official-watchlist",
  subjectCanonicalIdentifier: "official-watchlist:https://openai.example/news/gpt-5",
  title: "GPT-5 release",
  url: "https://openai.example/news/gpt-5",
};

test("GitHub Candidate 的仓库简介足以说明用途时，只保留该官方 Primary Evidence", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return {
        body: '<meta name="description" content="A local coding agent for developers to automate code reviews and implementation from a terminal.">',
        contentType: "text/html",
        url: source.url,
      };
    },
  });

  const result = await enricher.enrich(githubCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.deepEqual(requested, ["https://github.com/openai/codex"]);
  assert.deepEqual(result.digests.map((digest) => ({
    excerpts: digest.excerpts,
    sourceName: digest.sourceName,
    sourceUrl: digest.sourceUrl,
  })), [{
    excerpts: ["A local coding agent for developers to automate code reviews and implementation from a terminal."],
    sourceName: "GitHub repository description",
    sourceUrl: "https://github.com/openai/codex",
  }]);
  assert.equal(archive.saved.length, 1);
});

test("GitHub 仓库简介缺失时，补证回退到 README 开头而不请求 Releases", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return {
        body: '<article class="markdown-body"><p>Codex helps developers automate code review and implementation tasks from a local terminal workspace.</p></article>',
        contentType: "text/html",
        url: source.url,
      };
    },
  });

  const result = await enricher.enrich(githubCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.deepEqual(requested, ["https://github.com/openai/codex"]);
  assert.deepEqual(result.digests.map((digest) => digest.sourceKind), ["github-readme"]);
  assert.equal(archive.saved.length, 1);
});

test("GitHub README 无法说明用途时，才继续读取受限的 Releases 页面", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return source.url.endsWith("/releases")
        ? {
          body: '<article><h2>v1.2.0</h2><p>This release adds a terminal workflow for developers to review and implement code changes safely.</p></article>',
          contentType: "text/html",
          url: source.url,
        }
        : { body: '<article class="markdown-body"><p>Open source coding tools.</p></article>', contentType: "text/html", url: source.url };
    },
  });

  const result = await enricher.enrich(githubCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.deepEqual(requested, ["https://github.com/openai/codex", "https://github.com/openai/codex/releases"]);
  assert.deepEqual(result.digests.map((digest) => digest.sourceKind), ["github-readme", "github-release"]);
});

test("GitHub README 开头不足时，继续读取功能段而不访问 Releases", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return {
        body: '<article class="markdown-body"><p>Open source coding tools.</p><h2>Features</h2><p>Use Codex to help developers review pull requests and implement scoped changes from the terminal.</p></article>',
        contentType: "text/html",
        url: source.url,
      };
    },
  });

  const result = await enricher.enrich(githubCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.deepEqual(requested, [githubCandidate.url]);
  assert.deepEqual(result.digests.map((digest) => digest.sourceKind), ["github-readme", "github-readme-function"]);
});

test("Hugging Face 模型卡摘要不足时，按顺序回退到使用说明", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return {
        body: '<div class="prose"><p>Qwen3 8B.</p><h2>Usage</h2><p>Use this model to build local assistants that help developers summarize and classify documents.</p></div>',
        contentType: "text/html",
        url: source.url,
      };
    },
  });

  const result = await enricher.enrich(huggingFaceCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.deepEqual(requested, ["https://huggingface.co/Qwen/Qwen3-8B"]);
  assert.deepEqual(result.digests.map((digest) => digest.sourceKind), ["hugging-face-summary", "hugging-face-usage"]);
});

test("Hugging Face 使用说明不足时，按顺序回退到技术段", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => ({
      body: '<div class="prose"><p>Qwen3 8B.</p><h2>Usage</h2><p>See examples.</p><h2>Architecture</h2><p>This model uses grouped-query attention to help developers run local assistants for document classification.</p></div>',
      contentType: "text/html",
      url: source.url,
    }),
  });

  const result = await enricher.enrich(huggingFaceCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.deepEqual(result.digests.map((digest) => digest.sourceKind), ["hugging-face-summary", "hugging-face-usage", "hugging-face-technical"]);
});

test("已登记 Watchlist 先保留页面标题，标题不足时才摘录有限正文", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return {
        body: '<html><head><title>GPT-5 Release</title></head><body><p>GPT-5 helps builders automate code review and implementation work through a bounded agent workflow.</p><p>Do not retain this complete page.</p></body></html>',
        contentType: "text/html",
        url: source.url,
      };
    },
  });
  const watchlist = [{ allowedHosts: ["openai.example"], name: "OpenAI Release", url: officialCandidate.url }];

  const result = await enricher.enrich(officialCandidate, { officialWatchlist: watchlist });

  assert.equal(result.status, "enriched");
  assert.deepEqual(requested, [officialCandidate.url]);
  assert.deepEqual(result.digests.map((digest) => digest.sourceKind), ["official-watchlist-title", "official-watchlist-body"]);
  assert.ok(result.digests.every((digest) => !digest.excerpts.join(" ").includes("Do not retain this complete page.")));
});

test("Show HN 只桥接精确的允许项目链接，任意外链保持证据不足且不抓取", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const requested: string[] = [];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => {
      requested.push(source.url);
      return {
        body: '<meta name="description" content="A coding agent for developers to automate implementation and review tasks locally.">',
        contentType: "text/html",
        url: source.url,
      };
    },
  });
  const showHnCandidate: Candidate = {
    ...githubCandidate,
    canonicalIdentifier: "show-hn:42",
    connectorId: "show-hn",
    evidence: [{
      canonicalIdentifier: "show-hn:42:link",
      collectedAt: githubCandidate.collectedAt,
      connectorId: "show-hn",
      sourceName: "Hacker News Show HN",
      sourceTitle: "Show HN: Codex",
      sourceUrl: "https://example.invalid/project",
      trust: "untrusted",
    }],
    subjectCanonicalIdentifier: "show-hn:42",
    url: "https://news.ycombinator.com/item?id=42",
  };

  const rejected = await enricher.enrich(showHnCandidate, { officialWatchlist: [] });
  const accepted = await enricher.enrich({
    ...showHnCandidate,
    canonicalIdentifier: "show-hn:43",
    evidence: [{ ...showHnCandidate.evidence[0]!, canonicalIdentifier: "show-hn:43:link", sourceUrl: githubCandidate.url }],
  }, { officialWatchlist: [] });

  assert.deepEqual(rejected, { candidateCanonicalIdentifier: "show-hn:42", digests: [], status: "insufficient-evidence" });
  assert.equal(accepted.status, "enriched");
  assert.deepEqual(requested, [githubCandidate.url]);
});

test("相同官方 URL 的内容指纹未变化时复用已存 Digest，不重复保存摘录", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const clocks = [new Date("2026-08-13T02:01:00.000Z"), new Date("2026-08-13T04:01:00.000Z")];
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => clocks.shift() ?? new Date("2026-08-13T04:01:00.000Z"),
    fetchPage: async (source) => ({
      body: '<meta name="description" content="A local coding agent for developers to automate code reviews and implementation from a terminal.">',
      contentType: "text/html",
      url: source.url,
    }),
  });

  const first = await enricher.enrich(githubCandidate, { officialWatchlist: [] });
  const second = await enricher.enrich(githubCandidate, { officialWatchlist: [] });

  assert.equal(archive.saved.length, 1);
  assert.deepEqual(second.digests, first.digests);
});

test("摘录会在保存前脱敏疑似凭据", async () => {
  const archive = new InMemoryEvidenceDigestArchive();
  const enricher = createEvidenceEnricher({
    archive,
    clock: () => new Date("2026-08-13T02:01:00.000Z"),
    fetchPage: async (source) => ({
      body: '<meta name="description" content="Use this agent to help developers review code. API_KEY=sk_supersecretcredentialvalue hf_abcdefghijklmnoqrstuvwxyz">',
      contentType: "text/html",
      url: source.url,
    }),
  });

  const result = await enricher.enrich(githubCandidate, { officialWatchlist: [] });

  assert.equal(result.status, "enriched");
  assert.match(result.digests[0]?.excerpts[0] ?? "", /\[REDACTED\]/);
  assert.doesNotMatch(result.digests[0]?.excerpts[0] ?? "", /supersecretcredentialvalue/);
  assert.doesNotMatch(result.digests[0]?.excerpts[0] ?? "", /hf_abcdefghijklmnoqrstuvwxyz/);
});
