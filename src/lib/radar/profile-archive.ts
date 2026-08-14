import type { QueryResultRow } from "pg";
import { getDatabasePool, withTransaction } from "./database.ts";
import {
  createInitialRadarProfileConfig,
  parseRadarProfileConfig,
  type RadarProfile,
  type RadarProfileConfig,
  type RadarProfileEnvironment,
} from "./radar-profile.ts";
import { verifyRuntimeConfig } from "./profile-runtime.ts";

type ProfileRow = QueryResultRow & {
  configuration: unknown;
  id: string;
  version: number;
};

function projectRetiredConnector(configuration: unknown) {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return configuration;
  const stored = configuration as Record<string, unknown>;
  if (!Array.isArray(stored.enabledConnectorIds) || !stored.enabledConnectorIds.includes("official-watchlist")) return configuration;
  const enabledConnectorIds = stored.enabledConnectorIds.filter((connectorId) => connectorId !== "official-watchlist");
  return { ...stored, enabledConnectorIds: enabledConnectorIds.length ? enabledConnectorIds : ["github-trending"] };
}

function toProfile(row: ProfileRow): RadarProfile {
  return { id: row.id, version: row.version, ...parseRadarProfileConfig(projectRetiredConnector(row.configuration)) };
}

async function readActiveProfile(): Promise<RadarProfile | null> {
  const result = await getDatabasePool().query<ProfileRow>(
    `SELECT profile.id, profile.version, profile.configuration
    FROM radar_profile_state state
    JOIN radar_profile_versions profile ON profile.id = state.active_profile_id
    WHERE state.singleton = TRUE`,
  );
  const row = result.rows[0];
  return row ? toProfile(row) : null;
}

export async function getActiveRadarProfile(
): Promise<RadarProfile | null> {
  const existing = await readActiveProfile();
  if (existing) return existing;
  return null;
}

export async function getRequiredRadarProfile(): Promise<RadarProfile> {
  const profile = await getActiveRadarProfile();
  if (!profile) throw new Error("Radar Profile 尚未完成模型校验并启用。请先在配置后台保存有效配置。");
  return profile;
}

export async function getRadarProfile(id: string): Promise<RadarProfile | null> {
  const result = await getDatabasePool().query<ProfileRow>(
    "SELECT id, version, configuration FROM radar_profile_versions WHERE id = $1",
    [id],
  );
  const row = result.rows[0];
  return row ? toProfile(row) : null;
}

export function getInitialRadarProfileDraft(environment: RadarProfileEnvironment = process.env as RadarProfileEnvironment): RadarProfileConfig {
  return createInitialRadarProfileConfig(environment);
}

export async function listRadarProfileVersions(limit = 10): Promise<readonly RadarProfile[]> {
  const result = await getDatabasePool().query<ProfileRow>(
    "SELECT id, version, configuration FROM radar_profile_versions ORDER BY version DESC LIMIT $1",
    [limit],
  );
  return result.rows.map(toProfile);
}

export async function saveRadarProfile(
  configuration: RadarProfileConfig,
  verify: (configuration: RadarProfileConfig["runtime"]) => Promise<void> = verifyRuntimeConfig,
): Promise<RadarProfile> {
  const validated = parseRadarProfileConfig(configuration);
  await verify(validated.runtime);
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('razer-raders:radar-profile'))");
    const latest = await client.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) AS version FROM radar_profile_versions");
    const version = (latest.rows[0]?.version ?? 0) + 1;
    const id = `profile@v${version}`;
    await client.query(
      "INSERT INTO radar_profile_versions (id, version, configuration) VALUES ($1, $2, $3)",
      [id, version, JSON.stringify(validated)],
    );
    await client.query(
      `INSERT INTO radar_profile_state (singleton, active_profile_id, updated_at)
      VALUES (TRUE, $1, NOW())
      ON CONFLICT (singleton) DO UPDATE SET active_profile_id = EXCLUDED.active_profile_id, updated_at = NOW()`,
      [id],
    );
    return { id, version, ...validated };
  });
}

export async function rollbackRadarProfile(id: string): Promise<RadarProfile> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('razer-raders:radar-profile'))");
    const result = await client.query<ProfileRow>(
      "SELECT id, version, configuration FROM radar_profile_versions WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("找不到可回滚的 Radar Profile Version。");
    await client.query(
      `INSERT INTO radar_profile_state (singleton, active_profile_id, updated_at)
      VALUES (TRUE, $1, NOW())
      ON CONFLICT (singleton) DO UPDATE SET active_profile_id = EXCLUDED.active_profile_id, updated_at = NOW()`,
      [id],
    );
    return toProfile(row);
  });
}
