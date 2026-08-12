import assert from "node:assert/strict";
import test from "node:test";
import { createModelRuntimeFromEnvironment } from "../src/lib/radar/model-runtime.ts";

test("部署环境显式选择 Ollama 时不会读取或回退到 Compatible Runtime", () => {
  const runtime = createModelRuntimeFromEnvironment({
    RADAR_COMPATIBLE_RUNTIME_API_KEY: "external-secret",
    RADAR_COMPATIBLE_RUNTIME_BASE_URL: "https://runtime.example/v1",
    RADAR_COMPATIBLE_RUNTIME_MODEL: "external-model",
    RADAR_MODEL_RUNTIME: "ollama",
    RADAR_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    RADAR_OLLAMA_MODEL: "qwen3:8b",
  });

  assert.equal(runtime?.id, "ollama:qwen3:8b");
});

test("未指定运行时的现有部署继续使用 Compatible Runtime", () => {
  const runtime = createModelRuntimeFromEnvironment({
    RADAR_COMPATIBLE_RUNTIME_API_KEY: "instance-secret",
    RADAR_COMPATIBLE_RUNTIME_BASE_URL: "https://runtime.example/v1",
    RADAR_COMPATIBLE_RUNTIME_MODEL: "radar-model",
  });

  assert.equal(runtime?.id, "compatible:radar-model");
});

test("未知运行时不会静默替换为外部模型", () => {
  const runtime = createModelRuntimeFromEnvironment({
    RADAR_COMPATIBLE_RUNTIME_API_KEY: "instance-secret",
    RADAR_COMPATIBLE_RUNTIME_BASE_URL: "https://runtime.example/v1",
    RADAR_COMPATIBLE_RUNTIME_MODEL: "radar-model",
    RADAR_MODEL_RUNTIME: "other",
  });

  assert.equal(runtime, null);
});
