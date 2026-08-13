import assert from "node:assert/strict";
import test from "node:test";
import { discoverOllamaModels, verifyRuntimeConfig } from "../src/lib/radar/profile-runtime.ts";

const ollamaRuntime = {
  baseUrl: "http://127.0.0.1:11434",
  cycleBudgetSeconds: 1_800,
  kind: "ollama" as const,
  maxAssessmentsPerCycle: 5,
  model: "qwen3-local:8b",
  modelConcurrency: 1,
};

test("Ollama 模型发现和配置校验只接受已安装模型", async () => {
  const runtimeFetch = async () => Response.json({ models: [{ name: "qwen3-local:8b" }, { name: "qwen3:4b" }] });
  assert.deepEqual(await discoverOllamaModels(ollamaRuntime.baseUrl, runtimeFetch), ["qwen3-local:8b", "qwen3:4b"]);
  await verifyRuntimeConfig(ollamaRuntime, {}, runtimeFetch);
  await assert.rejects(
    () => verifyRuntimeConfig({ ...ollamaRuntime, model: "missing" }, {}, runtimeFetch),
    /未安装模型/,
  );
  await assert.rejects(
    () => discoverOllamaModels(ollamaRuntime.baseUrl, async () => { throw new Error("connection refused"); }),
    /Ollama 连接失败：connection refused/,
  );
});

test("Compatible API 测试仅从环境读取凭据，并验证指定模型", async () => {
  const requests: RequestInit[] = [];
  const runtimeFetch = async (_input: string | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    return Response.json({ data: [{ id: "fast-model" }] });
  };
  await verifyRuntimeConfig({ ...ollamaRuntime, baseUrl: "https://runtime.example/v1", kind: "compatible", model: "fast-model" }, {
    RADAR_COMPATIBLE_RUNTIME_API_KEY: "instance-secret",
  }, runtimeFetch);
  assert.deepEqual(requests[0]?.headers, { Accept: "application/json", Authorization: "Bearer instance-secret" });
  await assert.rejects(
    () => verifyRuntimeConfig({ ...ollamaRuntime, baseUrl: "https://runtime.example/v1", kind: "compatible", model: "fast-model" }, {}, runtimeFetch),
    /凭据未由部署环境配置/,
  );
});
