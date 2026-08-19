import { getRequiredRadarProfile } from "@/lib/radar/profile-archive";
import { createProfileReassessHandler } from "@/lib/radar/profile-route";
import { postgresCandidateTaskArchive } from "@/lib/radar/task-queue";

export const POST = createProfileReassessHandler({
  requeue: async () => {
    const profile = await getRequiredRadarProfile();
    return postgresCandidateTaskArchive.requeueDelayedAssessments?.({
      configurationVersion: profile.id,
      runtimeId: `${profile.runtime.kind}:${profile.runtime.model}`,
    }) ?? 0;
  },
});
