import { collectConfiguredSources } from "@/lib/radar/configured-collection";
import { createProfileCollectionHandler } from "@/lib/radar/profile-route";

export const POST = createProfileCollectionHandler({ run: collectConfiguredSources });
