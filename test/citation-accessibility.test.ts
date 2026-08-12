import assert from "node:assert/strict";
import test from "node:test";
import { createCitationAccessibilityCheck } from "../src/lib/radar/citation-accessibility.ts";

test("只检查已保留的 HTTPS Source Evidence，并拒绝不可访问或非 HTTPS 引用", async () => {
  const requested: string[] = [];
  const isAccessible = createCitationAccessibilityCheck(["https://github.com/openai/codex"], async (url) => {
    requested.push(String(url));
    return new Response(null, { status: 204 });
  });

  assert.equal(await isAccessible("https://github.com/openai/codex"), true);
  assert.equal(await isAccessible("https://example.com/not-evidence"), false);
  assert.equal(await isAccessible("http://github.com/openai/codex"), false);
  assert.equal(await isAccessible("not-a-url"), false);
  assert.deepEqual(requested, ["https://github.com/openai/codex"]);
});

test("引用检查拒绝重定向与非成功响应", async () => {
  const redirects = createCitationAccessibilityCheck(["https://github.com/openai/codex"], async () => new Response(null, { status: 302 }));
  const failures = createCitationAccessibilityCheck(["https://github.com/openai/codex"], async () => new Response(null, { status: 404 }));

  assert.equal(await redirects("https://github.com/openai/codex"), false);
  assert.equal(await failures("https://github.com/openai/codex"), false);
});
