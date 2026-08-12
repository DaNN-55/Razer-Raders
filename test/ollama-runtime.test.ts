import assert from "node:assert/strict";
import test from "node:test";
import { createOllamaRuntimeFromEnvironment } from "../src/lib/radar/ollama-runtime.ts";

test("Ollama Local Runtime 无需凭证，并以 Generate 输出同一结构化评估", async () => {
  let requestedBody = "";
  let requestedHeaders = new Headers();
  let requestedUrl = "";
  const runtime = createOllamaRuntimeFromEnvironment({
    RADAR_OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
    RADAR_OLLAMA_MODEL: "qwen3:8b",
  }, async (input, init) => {
    requestedBody = String(init?.body);
    requestedHeaders = new Headers(init?.headers);
    requestedUrl = String(input);
    return Response.json({
      done: true,
      response: JSON.stringify({
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
    });
  });

  assert.ok(runtime);
  assert.equal(runtime.id, "ollama:qwen3:8b");
  const assessment = await runtime.assess({
    evidence: [{ canonicalIdentifier: "github:openai/codex", sourceName: "GitHub Trending", sourceTitle: "openai/codex", sourceUrl: "https://github.com/openai/codex" }],
    priority: "值得关注",
    selectionReason: "GitHub Trending 在 Observation Window 内新发现。",
    signalState: "新出现",
    title: "openai/codex",
  });

  assert.equal(requestedUrl, "http://127.0.0.1:11434/api/generate");
  assert.equal(requestedHeaders.get("authorization"), null);
  assert.equal(requestedHeaders.get("content-type"), "application/json");
  const request = JSON.parse(requestedBody) as { format: string; model: string; prompt: string; stream: boolean; think: boolean };
  assert.equal(request.format, "json");
  assert.equal(request.model, "qwen3:8b");
  assert.equal(request.stream, false);
  assert.equal(request.think, false);
  assert.match(request.prompt, /openai\/codex/);
  assert.equal(assessment.technicalBasis, "该项目使用 TypeScript。");
  assert.deepEqual(assessment.citations.whyNow, ["https://github.com/openai/codex"]);
});

test("Ollama Local Runtime 缺少部署地址或模型时不会创建运行时", () => {
  assert.equal(createOllamaRuntimeFromEnvironment({ RADAR_OLLAMA_MODEL: "qwen3:8b" }), null);
  assert.equal(createOllamaRuntimeFromEnvironment({ RADAR_OLLAMA_BASE_URL: "http://127.0.0.1:11434" }), null);
});
