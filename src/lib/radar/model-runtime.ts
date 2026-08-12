import type { ModelRuntime } from "./assessment-contract.ts";
import { createCompatibleRuntimeFromEnvironment, type CompatibleRuntimeEnvironment } from "./compatible-runtime.ts";
import { createOllamaRuntimeFromEnvironment, type OllamaRuntimeEnvironment } from "./ollama-runtime.ts";

export type ModelRuntimeEnvironment = CompatibleRuntimeEnvironment & OllamaRuntimeEnvironment & {
  RADAR_MODEL_RUNTIME?: string;
};

export function createModelRuntimeFromEnvironment(
  environment: ModelRuntimeEnvironment = process.env as ModelRuntimeEnvironment,
): ModelRuntime | null {
  const runtime = environment.RADAR_MODEL_RUNTIME ?? "compatible";
  if (runtime === "compatible") return createCompatibleRuntimeFromEnvironment(environment);
  if (runtime === "ollama") return createOllamaRuntimeFromEnvironment(environment);
  return null;
}
