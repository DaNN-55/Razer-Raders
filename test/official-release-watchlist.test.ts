import assert from "node:assert/strict";
import test from "node:test";
import {
  collectOfficialReleaseWatchlist,
  readOfficialReleaseWatchlist,
} from "../src/lib/radar/connectors/official-release-watchlist.ts";

const watchlist = readOfficialReleaseWatchlist({
  RADAR_OFFICIAL_WATCHLIST: JSON.stringify([
    {
      allowedHosts: ["openai.example"],
      name: "OpenAI Release",
      url: "https://openai.example/news/gpt-5",
    },
  ]),
});

test("环境 Watchlist 只接受明确登记的 HTTPS URL 与允许域名", () => {
  assert.deepEqual(watchlist, [{
    allowedHosts: ["openai.example"],
    name: "OpenAI Release",
    url: "https://openai.example/news/gpt-5",
  }]);
  assert.throws(
    () => readOfficialReleaseWatchlist({
      RADAR_OFFICIAL_WATCHLIST: JSON.stringify([{ allowedHosts: ["openai.example"], name: "OpenAI Release", url: "http://openai.example/news/gpt-5" }]),
    }),
    /HTTPS URL/,
  );
  assert.throws(
    () => readOfficialReleaseWatchlist({
      RADAR_OFFICIAL_WATCHLIST: JSON.stringify([{ allowedHosts: ["another.example"], name: "OpenAI Release", url: "https://openai.example/news/gpt-5" }]),
    }),
    /允许域名/,
  );
});

test("固定官方发布 Fixture 产出 Candidate 与 Primary Source Evidence", async () => {
  const requestedUrls: string[] = [];
  const collection = await collectOfficialReleaseWatchlist(watchlist, async (source) => {
    requestedUrls.push(source.url);
    return {
      body: "<html><head><title>Introducing GPT-5 &amp; Codex</title></head><body></body></html>",
      contentType: "text/html",
      url: source.url,
    };
  });

  assert.deepEqual(requestedUrls, ["https://openai.example/news/gpt-5"]);
  assert.deepEqual(collection.candidates, [{
    canonicalIdentifier: "official-watchlist:https://openai.example/news/gpt-5",
    collectedAt: collection.collectedAt,
    connectorId: "official-watchlist",
    evidence: [{
      canonicalIdentifier: "official-watchlist:https://openai.example/news/gpt-5",
      collectedAt: collection.collectedAt,
      connectorId: "official-watchlist",
      sourceName: "OpenAI Release",
      sourceTitle: "Introducing GPT-5 & Codex",
      sourceUrl: "https://openai.example/news/gpt-5",
      trust: "untrusted",
    }],
    signalType: "project",
    subjectCanonicalIdentifier: "official-watchlist:https://openai.example/news/gpt-5",
    title: "Introducing GPT-5 & Codex",
    url: "https://openai.example/news/gpt-5",
  }]);
  assert.deepEqual(collection.warnings, []);
});

test("单条 Watchlist 失败不会阻断其余官方条目", async () => {
  const entries = readOfficialReleaseWatchlist({
    RADAR_OFFICIAL_WATCHLIST: JSON.stringify([
      { allowedHosts: ["failed.example"], name: "Failed release", url: "https://failed.example/release" },
      { allowedHosts: ["working.example"], name: "Working release", url: "https://working.example/release" },
    ]),
  });
  const collection = await collectOfficialReleaseWatchlist(entries, async (source) => {
    if (source.url.includes("failed")) throw new Error("HTTP 503");
    return { body: "<title>Working release</title>", contentType: "text/html", url: source.url };
  });

  assert.equal(collection.candidates.length, 1);
  assert.deepEqual(collection.warnings, ["Failed release：HTTP 503"]);
});

test("全部 Watchlist 条目失败时让 Connector 记录失败状态", async () => {
  await assert.rejects(
    () => collectOfficialReleaseWatchlist(watchlist, async () => { throw new Error("HTTP 429"); }),
    /OpenAI Release：HTTP 429/,
  );
});
