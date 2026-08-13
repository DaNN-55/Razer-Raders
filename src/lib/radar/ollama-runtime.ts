import { createAssessmentPrompt, parseAssessment } from "./assessment-prompt.ts";
import type { ModelRuntime } from "./assessment-contract.ts";

export type OllamaRuntimeEnvironment = {
  RADAR_OLLAMA_BASE_URL?: string;
  RADAR_OLLAMA_MODEL?: string;
};

type RuntimeFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type OllamaGenerateResponse = {
  response?: string;
};

export function createOllamaRuntimeFromEnvironment(
  environment: OllamaRuntimeEnvironment = process.env as OllamaRuntimeEnvironment,
  runtimeFetch: RuntimeFetch = fetch,
): ModelRuntime | null {
  const baseUrl = environment.RADAR_OLLAMA_BASE_URL?.replace(/\/$/, "");
  const model = environment.RADAR_OLLAMA_MODEL;
  if (!baseUrl || !model) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null;

  return {
    id: `ollama:${model}`,
    async assess(candidate, options) {
      const response = await runtimeFetch(`${endpoint.toString().replace(/\/$/, "")}/api/generate`, {
        body: JSON.stringify({
          format: "json",
          model,
          prompt: createAssessmentPrompt(candidate),
          stream: false,
          think: false,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: options?.signal ?? AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Ollama Runtime 请求失败：HTTP ${response.status}`);

      const generation = await response.json() as OllamaGenerateResponse;
      if (!generation.response) throw new Error("Ollama Runtime 未返回评估内容。");
      return parseAssessment(generation.response, "Ollama Runtime");
    },
  };
}
