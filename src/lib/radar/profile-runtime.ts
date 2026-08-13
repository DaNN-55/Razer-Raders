import type { ModelRuntime } from "./assessment-contract.ts";
import { createCompatibleRuntimeFromEnvironment, type CompatibleRuntimeEnvironment } from "./compatible-runtime.ts";
import { createOllamaRuntimeFromEnvironment } from "./ollama-runtime.ts";
import type { RadarProfile, RadarRuntimeConfig } from "./radar-profile.ts";

type RuntimeEnvironment = CompatibleRuntimeEnvironment;
type RuntimeFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "运行时请求失败。";
}

export function createModelRuntimeFromProfile(profile: RadarProfile, environment: RuntimeEnvironment = process.env as RuntimeEnvironment): ModelRuntime | null {
  if (profile.runtime.kind === "ollama") {
    return createOllamaRuntimeFromEnvironment({
      RADAR_OLLAMA_BASE_URL: profile.runtime.baseUrl,
      RADAR_OLLAMA_MODEL: profile.runtime.model,
    });
  }
  return createCompatibleRuntimeFromEnvironment({
    RADAR_COMPATIBLE_RUNTIME_API_KEY: environment.RADAR_COMPATIBLE_RUNTIME_API_KEY,
    RADAR_COMPATIBLE_RUNTIME_BASE_URL: profile.runtime.baseUrl,
    RADAR_COMPATIBLE_RUNTIME_MODEL: profile.runtime.model,
  });
}

function runtimeUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export async function discoverOllamaModels(baseUrl: string, runtimeFetch: RuntimeFetch = fetch): Promise<readonly string[]> {
  let response: Response;
  try {
    response = await runtimeFetch(runtimeUrl(baseUrl, "/api/tags"), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new Error(`Ollama 连接失败：${errorMessage(error)}`);
  }
  if (!response.ok) throw new Error(`Ollama 模型列表请求失败：HTTP ${response.status}`);
  let payload: { models?: { name?: unknown }[] };
  try {
    payload = await response.json() as { models?: { name?: unknown }[] };
  } catch (error) {
    throw new Error(`Ollama 模型列表格式无效：${errorMessage(error)}`);
  }
  const models = payload.models?.flatMap((model) => typeof model.name === "string" && model.name ? [model.name] : []) ?? [];
  if (!models.length) throw new Error("Ollama 未返回已安装模型。");
  return models;
}

export async function verifyRuntimeConfig(runtime: RadarRuntimeConfig, environment: RuntimeEnvironment = process.env as RuntimeEnvironment, runtimeFetch: RuntimeFetch = fetch): Promise<void> {
  if (runtime.kind === "ollama") {
    const models = await discoverOllamaModels(runtime.baseUrl, runtimeFetch);
    if (!models.includes(runtime.model)) throw new Error(`Ollama 中未安装模型：${runtime.model}`);
    return;
  }

  const apiKey = environment.RADAR_COMPATIBLE_RUNTIME_API_KEY;
  if (!apiKey) throw new Error("Compatible API 凭据未由部署环境配置。");
  let response: Response;
  try {
    response = await runtimeFetch(runtimeUrl(runtime.baseUrl, "/models"), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new Error(`Compatible API 连接失败：${errorMessage(error)}`);
  }
  if (!response.ok) throw new Error(`Compatible API 模型列表请求失败：HTTP ${response.status}`);
  const payload = await response.json() as { data?: { id?: unknown }[] };
  if (!payload.data?.some((model) => model.id === runtime.model)) {
    throw new Error(`Compatible API 未返回模型：${runtime.model}`);
  }
}
