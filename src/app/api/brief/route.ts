import { getRadarBrief } from "@/lib/radar/brief";
import { createBriefGetHandler } from "@/lib/radar/brief-route";

export const GET = createBriefGetHandler(getRadarBrief);
