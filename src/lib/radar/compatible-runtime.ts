import { createAssessmentPrompt, parseAssessment } from "./assessment-prompt.ts";
import type { ModelRuntime } from "./assessment-contract.ts";

export type CompatibleRuntimeEnvironment = {
  RADAR_COMPATIBLE_RUNTIME_API_KEY?: string;
  RADAR_COMPATIBLE_RUNTIME_BASE_URL?: string;
  RADAR_COMPATIBLE_RUNTIME_MODEL?: string;
};

type RuntimeFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[];
};

export function createCompatibleRuntimeFromEnvironment(
  environment: CompatibleRuntimeEnvironment = process.env as CompatibleRuntimeEnvironment,
  runtimeFetch: RuntimeFetch = fetch,
): ModelRuntime | null {
  const baseUrl = environment.RADAR_COMPATIBLE_RUNTIME_BASE_URL?.replace(/\/$/, "");
  const apiKey = environment.RADAR_COMPATIBLE_RUNTIME_API_KEY;
  const model = environment.RADAR_COMPATIBLE_RUNTIME_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "https:") return null;

  return {
    id: `compatible:${model}`,
    async assess(candidate) {
      const response = await runtimeFetch(`${endpoint.toString().replace(/\/$/, "")}/chat/completions`, {
        body: JSON.stringify({
          messages: [
            { content: "你输出一个符合要求的 JSON 对象，不使用 Markdown 代码块。", role: "system" },
            { content: createAssessmentPrompt(candidate), role: "user" },
          ],
          model,
          response_format: { type: "json_object" },
          temperature: 0,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Compatible Runtime 请求失败：HTTP ${response.status}`);

      const completion = await response.json() as ChatCompletionResponse;
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("Compatible Runtime 未返回评估内容。");
      return parseAssessment(content, "Compatible Runtime");
    },
  };
}
