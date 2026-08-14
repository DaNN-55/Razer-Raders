import assert from "node:assert/strict";
import test from "node:test";
import { createProfileGetHandler, createProfileModelsHandler, createProfilePutHandler, createProfileReassessHandler, createProfileRollbackHandler, type ProfileRouteDependencies } from "../src/lib/radar/profile-route.ts";
import type { RadarProfile } from "../src/lib/radar/radar-profile.ts";

const profile: RadarProfile = {
  collectionIntervalMs: 7_200_000,
  enabledConnectorIds: ["github-trending"],
  excludeTerms: [],
  id: "profile@v1",
  includeTerms: [],
  runtime: { baseUrl: "http://127.0.0.1:11434", cycleBudgetSeconds: 1_800, kind: "ollama", maxAssessmentsPerCycle: 5, model: "qwen3-local:8b", modelConcurrency: 1 },
  version: 1,
};

function dependencies(): ProfileRouteDependencies {
  return {
    environment: { RADAR_ADMIN_TOKEN: "admin-token" },
    getActive: async () => profile,
    getDraft: () => ({ ...profile }),
    list: async () => [profile],
    rollback: async () => profile,
    save: async (_configuration: unknown, verify: (runtime: RadarProfile["runtime"]) => Promise<void>) => {
      await verify(profile.runtime);
      return profile;
    },
    verify: async () => undefined,
  };
}

function request(method: string, body?: unknown, token = "admin-token") {
  return new Request("http://radar.local/api/profile", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    method,
  });
}

test("Profile API 只向管理员返回配置，保存前执行真实运行时校验", async () => {
  const dependency = dependencies();
  const get = createProfileGetHandler(dependency);
  assert.equal((await get(request("GET", undefined, ""))).status, 401);
  assert.deepEqual(await (await get(request("GET"))).json(), { active: profile, versions: [profile] });

  let verified = false;
  dependency.verify = async () => { verified = true; };
  const put = createProfilePutHandler(dependency);
  assert.equal((await put(request("PUT", profile))).status, 200);
  assert.equal(verified, true);
});

test("首次配置时，Profile API 返回可编辑草稿而不启用未校验版本", async () => {
  const dependency = dependencies();
  dependency.getActive = async () => null;
  const get = createProfileGetHandler(dependency);
  const body = await (await get(request("GET"))).json() as { active: RadarProfile | null; draft: RadarProfile };
  assert.equal(body.active, null);
  assert.deepEqual(body.draft, profile);
});

test("Profile API 将无效的初始环境草稿转为明确错误", async () => {
  const dependency = dependencies();
  dependency.getActive = async () => null;
  dependency.getDraft = () => { throw new Error("RADAR_COLLECTION_INTERVAL_MS 必须是有效整数。"); };
  const get = createProfileGetHandler(dependency);
  const response = await get(request("GET"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "RADAR_COLLECTION_INTERVAL_MS 必须是有效整数。" });
});

test("Profile 回滚会验证目标版本的运行时后才激活", async () => {
  const dependency = dependencies();
  let verified = false;
  dependency.verify = async () => { verified = true; };
  const rollback = createProfileRollbackHandler(dependency);
  assert.deepEqual(await (await rollback(request("POST", { id: "profile@v1" }))).json(), { active: profile });
  assert.equal(verified, true);
});

test("Profile 模型发现只允许已认证的 Ollama 配置", async () => {
  const models = createProfileModelsHandler({
    discover: async () => ["qwen3-local:8b"],
    environment: { RADAR_ADMIN_TOKEN: "admin-token" },
  });
  assert.deepEqual(await (await models(request("POST", profile))).json(), { models: ["qwen3-local:8b"] });
  const compatible = { ...profile, runtime: { ...profile.runtime, baseUrl: "https://runtime.example/v1", kind: "compatible" as const } };
  assert.equal((await models(request("POST", compatible))).status, 400);
});

test("管理员可显式复评当前已评估待发布集合", async () => {
  let requeued = 0;
  const reassess = createProfileReassessHandler({
    environment: { RADAR_ADMIN_TOKEN: "admin-token" },
    requeue: async () => { requeued += 1; return 3; },
  });
  assert.equal((await reassess(request("POST", undefined, ""))).status, 401);
  assert.deepEqual(await (await reassess(request("POST"))).json(), { requeuedCount: 3 });
  assert.equal(requeued, 1);
});
