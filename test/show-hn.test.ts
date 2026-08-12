import assert from "node:assert/strict";
import test from "node:test";
import { collectShowHn } from "../src/lib/radar/connectors/show-hn.ts";
import { parseShowHnPage } from "../src/lib/radar/connectors/show-hn-parser.ts";

const fixture = `
  <tr class="athing submission" id="49270040">
    <td class="title"><span class="titleline"><a href="https://woxi.example">Show HN: Woxi &#x2F; open source math system</a></span></td>
  </tr>
  <tr class="athing submission" id="49270041">
    <td class="title"><span class="titleline"><a href="item?id=49270041">Show HN: Discussion-only launch</a></span></td>
  </tr>
`;

test("固定 Show HN Fixture 产出独立 Candidate 与保留原始标题链接的 Untrusted Evidence", async () => {
  const collectedAt = "2026-08-12T01:00:00.000Z";
  const candidates = parseShowHnPage(fixture, collectedAt);
  assert.deepEqual(candidates, [
    {
      canonicalIdentifier: "show-hn:49270040",
      collectedAt,
      connectorId: "show-hn",
      evidence: [{
        canonicalIdentifier: "show-hn:49270040:link",
        collectedAt,
        connectorId: "show-hn",
        sourceName: "Hacker News Show HN",
        sourceTitle: "Show HN: Woxi / open source math system",
        sourceUrl: "https://woxi.example/",
        trust: "untrusted",
      }],
      signalType: "project",
      subjectCanonicalIdentifier: "show-hn:49270040",
      title: "Show HN: Woxi / open source math system",
      url: "https://news.ycombinator.com/item?id=49270040",
    },
    {
      canonicalIdentifier: "show-hn:49270041",
      collectedAt,
      connectorId: "show-hn",
      evidence: [{
        canonicalIdentifier: "show-hn:49270041",
        collectedAt,
        connectorId: "show-hn",
        sourceName: "Hacker News Show HN",
        sourceTitle: "Show HN: Discussion-only launch",
        sourceUrl: "https://news.ycombinator.com/item?id=49270041",
        trust: "untrusted",
      }],
      signalType: "project",
      subjectCanonicalIdentifier: "show-hn:49270041",
      title: "Show HN: Discussion-only launch",
      url: "https://news.ycombinator.com/item?id=49270041",
    },
  ]);

  const collection = await collectShowHn(async () => ({
    body: fixture,
    contentType: "text/html",
    url: "https://news.ycombinator.com/show",
  }));
  assert.equal(collection.connectorId, "show-hn");
  assert.equal(collection.connectorVersion, "show-hn@v1");
  assert.equal(collection.candidates.length, 2);
});
