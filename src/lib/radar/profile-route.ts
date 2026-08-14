import { getAdminAccessError, type AdminEnvironment } from "./profile-auth.ts";
import type { ConfiguredCollectionResult } from "./configured-collection.ts";
import type { RadarProfile, RadarProfileConfig } from "./radar-profile.ts";
import { parseRadarProfileConfig } from "./radar-profile.ts";

export type ProfileRouteDependencies = {
  environment?: AdminEnvironment;
  getActive: () => Promise<RadarProfile | null>;
  getDraft: () => RadarProfileConfig;
  list: () => Promise<readonly RadarProfile[]>;
  rollback: (id: string) => Promise<RadarProfile>;
  save: (configuration: RadarProfileConfig, verify: (runtime: RadarProfileConfig["runtime"]) => Promise<void>) => Promise<RadarProfile>;
  verify: (runtime: RadarProfileConfig["runtime"]) => Promise<void>;
};

function authorizationError(request: Request, environment?: AdminEnvironment) {
  const message = getAdminAccessError(request, environment);
  return message ? Response.json({ error: message }, { status: 401 }) : null;
}

async function readConfiguration(request: Request): Promise<RadarProfileConfig> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Error("请求体必须是 JSON 格式的 Radar Profile。");
  }
  return parseRadarProfileConfig(value);
}

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Radar Profile 请求失败。" }, { status: 400 });
}

export function createProfileGetHandler(dependencies: ProfileRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      const active = await dependencies.getActive();
      const versions = await dependencies.list();
      return Response.json({ active, draft: active ? undefined : dependencies.getDraft(), versions });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createProfilePutHandler(dependencies: ProfileRouteDependencies) {
  return async function PUT(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      const configuration = await readConfiguration(request);
      return Response.json({ active: await dependencies.save(configuration, dependencies.verify) });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createProfileTestHandler(dependencies: Pick<ProfileRouteDependencies, "environment" | "verify">) {
  return async function POST(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      const configuration = await readConfiguration(request);
      await dependencies.verify(configuration.runtime);
      return Response.json({ status: "ready" });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createProfileModelsHandler(dependencies: {
  discover: (baseUrl: string) => Promise<readonly string[]>;
  environment?: AdminEnvironment;
}) {
  return async function POST(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      const configuration = await readConfiguration(request);
      if (configuration.runtime.kind !== "ollama") throw new Error("只有 Ollama Runtime 可以发现本地已安装模型。");
      return Response.json({ models: await dependencies.discover(configuration.runtime.baseUrl) });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createProfileRollbackHandler(dependencies: Pick<ProfileRouteDependencies, "environment" | "list" | "rollback" | "verify">) {
  return async function POST(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      const payload = await request.json() as { id?: unknown };
      if (typeof payload.id !== "string" || !payload.id) throw new Error("需要指定可回滚的 Profile Version。");
      const target = (await dependencies.list()).find((profile) => profile.id === payload.id);
      if (!target) throw new Error("找不到可回滚的 Radar Profile Version。");
      await dependencies.verify(target.runtime);
      return Response.json({ active: await dependencies.rollback(target.id) });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createProfileReassessHandler(dependencies: {
  environment?: AdminEnvironment;
  requeue: () => Promise<number>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      return Response.json({ requeuedCount: await dependencies.requeue() });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createProfileCollectionHandler(dependencies: {
  environment?: AdminEnvironment;
  run: () => Promise<ConfiguredCollectionResult>;
}) {
  return async function POST(request: Request): Promise<Response> {
    const unauthorized = authorizationError(request, dependencies.environment);
    if (unauthorized) return unauthorized;
    try {
      return Response.json(await dependencies.run());
    } catch (error) {
      return errorResponse(error);
    }
  };
}
