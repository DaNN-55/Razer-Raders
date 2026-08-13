import assert from "node:assert/strict";
import test from "node:test";
import { getAdminAccessError } from "../src/lib/radar/profile-auth.ts";

test("Profile 写操作要求部署配置的管理员 Token", () => {
  const request = (token?: string) => new Request("http://radar.local/api/profile", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert.equal(getAdminAccessError(request(), { RADAR_ADMIN_TOKEN: "admin-token" }), "需要管理员认证。");
  assert.equal(getAdminAccessError(request("wrong"), { RADAR_ADMIN_TOKEN: "admin-token" }), "需要管理员认证。");
  assert.equal(getAdminAccessError(request("admin-token"), { RADAR_ADMIN_TOKEN: "admin-token" }), null);
  assert.match(getAdminAccessError(request("admin-token"), {}) ?? "", /未配置/);
});
