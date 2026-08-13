import { createProfileModelsHandler } from "@/lib/radar/profile-route";
import { discoverOllamaModels } from "@/lib/radar/profile-runtime";

export const POST = createProfileModelsHandler({ discover: discoverOllamaModels });
