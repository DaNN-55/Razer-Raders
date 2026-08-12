import assert from "node:assert/strict";
import test from "node:test";
import { collectHuggingFaceTrending } from "../src/lib/radar/connectors/hugging-face-trending.ts";
import { parseHuggingFaceTrendingPage } from "../src/lib/radar/connectors/hugging-face-trending-parser.ts";

const fixture = `
  <div class="grid grid-cols-1">
    <article class="overview-card-wrapper group/repo">
      <a href="/Qwen/Qwen3-8B"><h4>Qwen/Qwen3-8B</h4></a>
    </article>
    <article class="overview-card-wrapper group/repo">
      <a href="/meta-llama/Llama-3.2-1B-Instruct"><h4>meta-llama/Llama-3.2-1B-Instruct</h4></a>
    </article>
    <article class="overview-card-wrapper group/repo">
      <a href="/models"><h4>Models</h4></a>
    </article>
  </div>
`;

test("固定 Hugging Face Trending 页面保留可追溯的模型 Candidate 与 Untrusted Evidence", async () => {
  const collectedAt = "2026-08-12T01:00:00.000Z";
  const candidates = parseHuggingFaceTrendingPage(fixture, collectedAt);

  assert.deepEqual(candidates, [
    {
      canonicalIdentifier: "hugging-face:qwen/qwen3-8b",
      collectedAt,
      connectorId: "hugging-face-trending",
      evidence: [{
        canonicalIdentifier: "hugging-face:qwen/qwen3-8b",
        collectedAt,
        connectorId: "hugging-face-trending",
        sourceName: "Hugging Face",
        sourceTitle: "Qwen/Qwen3-8B",
        sourceUrl: "https://huggingface.co/Qwen/Qwen3-8B",
        trust: "untrusted",
      }],
      signalType: "model",
      subjectCanonicalIdentifier: "hugging-face:qwen/qwen3-8b",
      title: "Qwen/Qwen3-8B",
      url: "https://huggingface.co/Qwen/Qwen3-8B",
    },
    {
      canonicalIdentifier: "hugging-face:meta-llama/llama-3.2-1b-instruct",
      collectedAt,
      connectorId: "hugging-face-trending",
      evidence: [{
        canonicalIdentifier: "hugging-face:meta-llama/llama-3.2-1b-instruct",
        collectedAt,
        connectorId: "hugging-face-trending",
        sourceName: "Hugging Face",
        sourceTitle: "meta-llama/Llama-3.2-1B-Instruct",
        sourceUrl: "https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct",
        trust: "untrusted",
      }],
      signalType: "model",
      subjectCanonicalIdentifier: "hugging-face:meta-llama/llama-3.2-1b-instruct",
      title: "meta-llama/Llama-3.2-1B-Instruct",
      url: "https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct",
    },
  ]);

  const collection = await collectHuggingFaceTrending(async () => ({
    body: fixture,
    contentType: "text/html",
    url: "https://huggingface.co/models?sort=trending",
  }));
  assert.equal(collection.connectorId, "hugging-face-trending");
  assert.equal(collection.connectorVersion, "hugging-face-trending@v1");
  assert.equal(collection.candidates.length, 2);
});
