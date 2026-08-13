import { listRadarProfileVersions, rollbackRadarProfile } from "@/lib/radar/profile-archive";
import { createProfileRollbackHandler } from "@/lib/radar/profile-route";
import { verifyRuntimeConfig } from "@/lib/radar/profile-runtime";

export const POST = createProfileRollbackHandler({ list: listRadarProfileVersions, rollback: rollbackRadarProfile, verify: verifyRuntimeConfig });
