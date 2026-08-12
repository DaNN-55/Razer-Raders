import assert from "node:assert/strict";
import test from "node:test";
import { createCompatibleRuntimeFromEnvironment } from "../src/lib/radar/compatible-runtime.ts";

test("Compatible Runtime 仅从环境读取凭证，并以 Chat Completions 生成结构化评估", async () => {
  let requestedUrl = "";
  let requestedHeaders = new Headers();
  let requestedBody = "";
  const runtime = createCompatibleRuntimeFromEnvironment({
    RADAR_COMPATIBLE_RUNTIME_API_KEY: "instance-secret",
    RADAR_COMPATIBLE_RUNTIME_BASE_URL: "https://runtime.example/v1",
    RADAR_COMPATIBLE_RUNTIME_MODEL: "radar-model",
  }, async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = new Headers(init?.headers);
    requestedBody = String(init?.body);
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            builderValue: "试用",
              citations: {
                happened: ["https://github.com/openai/codex"],
                technicalBasis: ["https://github.com/openai/codex"],
                whyNow: ["https://github.com/openai/codex"],
              },
            happened: "openai/codex 发布了新的开发工具。",
            productOpportunity: "待验证",
            risk: "尚未在目标工作流中验证。",
            summary: "适合 Builder 先做小范围试用。",
            technicalBasis: "该项目使用 TypeScript。",
            topics: ["开发工具"],
            whyNow: "当前出现于 GitHub Trending。",
          }),
        },
      }],
    });
  });

  assert.ok(runtime);
  assert.equal(runtime.id, "compatible:radar-model");
  assert.doesNotMatch(JSON.stringify(runtime), /instance-secret/);

  const assessment = await runtime.assess({
    evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
    priority: "值得关注",
    selectionReason: "GitHub Trending 在 Observation Window 内新发现。",
    signalState: "新出现",
    title: "openai/codex",
  });

  assert.equal(requestedUrl, "https://runtime.example/v1/chat/completions");
  assert.equal(requestedHeaders.get("authorization"), "Bearer instance-secret");
  assert.equal(requestedHeaders.get("content-type"), "application/json");
  assert.match(requestedBody, /openai\/codex/);
  assert.equal(assessment.technicalBasis, "该项目使用 TypeScript。");
  assert.deepEqual(assessment.citations.whyNow, ["https://github.com/openai/codex"]);
  assert.match(requestedBody, /citations\.whyNow/);
});

test("Compatible Runtime 不会将实例凭证发送到非 HTTPS 端点", () => {
  const runtime = createCompatibleRuntimeFromEnvironment({
    RADAR_COMPATIBLE_RUNTIME_API_KEY: "instance-secret",
    RADAR_COMPATIBLE_RUNTIME_BASE_URL: "http://runtime.example/v1",
    RADAR_COMPATIBLE_RUNTIME_MODEL: "radar-model",
  });

  assert.equal(runtime, null);
});
