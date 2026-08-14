import type { ConnectorId } from "./connectors/types.ts";

const connectorIds: readonly ConnectorId[] = ["github-trending", "hugging-face-trending", "show-hn"];

export type RadarRuntimeConfig = {
  baseUrl: string;
  cycleBudgetSeconds: number;
  kind: "compatible" | "ollama";
  maxAssessmentsPerCycle: number;
  model: string;
  modelConcurrency: number;
};

export type RadarProfileConfig = {
  collectionIntervalMs: number;
  enabledConnectorIds: readonly ConnectorId[];
  excludeTerms: readonly string[];
  includeTerms: readonly string[];
  runtime: RadarRuntimeConfig;
};

export type RadarProfile = RadarProfileConfig & {
  id: string;
  version: number;
};

export type RadarProfileEnvironment = {
  RADAR_COLLECTION_INTERVAL_MS?: string;
  RADAR_COMPATIBLE_RUNTIME_BASE_URL?: string;
  RADAR_COMPATIBLE_RUNTIME_MODEL?: string;
  RADAR_EXCLUDE_TERMS?: string;
  RADAR_INCLUDE_TERMS?: string;
  RADAR_MODEL_RUNTIME?: string;
  RADAR_OLLAMA_BASE_URL?: string;
  RADAR_OLLAMA_MODEL?: string;
};

function readEnvironmentTerms(value: string | undefined) {
  return (value ?? "").split(",").map((term) => term.trim()).filter(Boolean);
}

function parseInteger(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} 必须是 ${minimum} 到 ${maximum} 的整数。`);
  }
  return value;
}

function parseString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 不能为空。`);
  return value.trim();
}

function parseUrl(value: unknown, field: string, protocols: readonly string[]) {
  const raw = parseString(value, field);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${field} 必须是有效 URL。`);
  }
  if (!protocols.includes(url.protocol) || url.username || url.password) {
    throw new Error(`${field} 必须使用允许的协议且不能包含凭据。`);
  }
  return url.toString().replace(/\/$/, "");
}

function parseStringList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${field} 必须是非空字符串数组。`);
  }
  return [...new Set(value.map((item) => item.trim().toLowerCase()))];
}

function parseRuntime(value: unknown): RadarRuntimeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("runtime 必须是对象。");
  const runtime = value as Partial<RadarRuntimeConfig>;
  if (runtime.kind !== "ollama" && runtime.kind !== "compatible") throw new Error("runtime.kind 必须是 ollama 或 compatible。");
  return {
    baseUrl: parseUrl(runtime.baseUrl, "runtime.baseUrl", runtime.kind === "ollama" ? ["http:", "https:"] : ["https:"]),
    cycleBudgetSeconds: parseInteger(runtime.cycleBudgetSeconds, "runtime.cycleBudgetSeconds", 60, 7_200),
    kind: runtime.kind,
    maxAssessmentsPerCycle: parseInteger(runtime.maxAssessmentsPerCycle, "runtime.maxAssessmentsPerCycle", 1, 100),
    model: parseString(runtime.model, "runtime.model"),
    modelConcurrency: parseInteger(runtime.modelConcurrency, "runtime.modelConcurrency", 1, 8),
  };
}

export function parseRadarProfileConfig(value: unknown): RadarProfileConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Radar Profile 必须是对象。");
  const profile = value as Partial<RadarProfileConfig>;
  if (!Array.isArray(profile.enabledConnectorIds) || profile.enabledConnectorIds.some((id) => !connectorIds.includes(id))) {
    throw new Error("enabledConnectorIds 包含未知 Connector。");
  }

  const enabledConnectorIds = [...new Set(profile.enabledConnectorIds)];
  if (enabledConnectorIds.length === 0) {
    throw new Error("至少需要启用一个 Connector。");
  }
  return {
    collectionIntervalMs: parseInteger(profile.collectionIntervalMs, "collectionIntervalMs", 60_000, 86_400_000),
    enabledConnectorIds,
    excludeTerms: parseStringList(profile.excludeTerms, "excludeTerms"),
    includeTerms: parseStringList(profile.includeTerms, "includeTerms"),
    runtime: parseRuntime(profile.runtime),
  };
}

export function createInitialRadarProfileConfig(environment: RadarProfileEnvironment = process.env as RadarProfileEnvironment): RadarProfileConfig {
  const runtimeKind = environment.RADAR_MODEL_RUNTIME === "ollama" ? "ollama" : "compatible";
  const runtime = runtimeKind === "ollama"
    ? {
      baseUrl: environment.RADAR_OLLAMA_BASE_URL ?? "http://host.docker.internal:11434",
      model: environment.RADAR_OLLAMA_MODEL ?? "qwen3-local:8b",
    }
    : {
      baseUrl: environment.RADAR_COMPATIBLE_RUNTIME_BASE_URL ?? "https://api.openai.com/v1",
      model: environment.RADAR_COMPATIBLE_RUNTIME_MODEL ?? "not-configured",
    };
  return parseRadarProfileConfig({
    collectionIntervalMs: Number(environment.RADAR_COLLECTION_INTERVAL_MS ?? 7_200_000),
    enabledConnectorIds: ["github-trending", "hugging-face-trending", "show-hn"],
    excludeTerms: readEnvironmentTerms(environment.RADAR_EXCLUDE_TERMS),
    includeTerms: readEnvironmentTerms(environment.RADAR_INCLUDE_TERMS),
    runtime: {
      ...runtime,
      cycleBudgetSeconds: 1_800,
      kind: runtimeKind,
      maxAssessmentsPerCycle: 5,
      modelConcurrency: 1,
    },
  });
}
