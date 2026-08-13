import { timingSafeEqual } from "node:crypto";

export type AdminEnvironment = {
  RADAR_ADMIN_TOKEN?: string;
};

function tokensMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function getAdminAccessError(request: Request, environment: AdminEnvironment = process.env as AdminEnvironment): string | null {
  const configuredToken = environment.RADAR_ADMIN_TOKEN;
  if (!configuredToken) return "RADAR_ADMIN_TOKEN 未配置，配置后台写操作已禁用。";
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  return tokensMatch(configuredToken, token) ? null : "需要管理员认证。";
}
