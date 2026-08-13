import { getActiveRadarProfile, getInitialRadarProfileDraft, listRadarProfileVersions, saveRadarProfile } from "@/lib/radar/profile-archive";
import { createProfileGetHandler, createProfilePutHandler } from "@/lib/radar/profile-route";
import { verifyRuntimeConfig } from "@/lib/radar/profile-runtime";

const dependencies = {
  getActive: getActiveRadarProfile,
  getDraft: getInitialRadarProfileDraft,
  list: listRadarProfileVersions,
  rollback: async () => { throw new Error("该路由不支持回滚。"); },
  save: saveRadarProfile,
  verify: verifyRuntimeConfig,
};

export const GET = createProfileGetHandler(dependencies);
export const PUT = createProfilePutHandler(dependencies);
