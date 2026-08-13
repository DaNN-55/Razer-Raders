import { createProfileTestHandler } from "@/lib/radar/profile-route";
import { verifyRuntimeConfig } from "@/lib/radar/profile-runtime";

export const POST = createProfileTestHandler({ verify: verifyRuntimeConfig });
