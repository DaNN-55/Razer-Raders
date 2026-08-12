import { getRadarRetrieval } from "@/lib/radar/retrieval";
import { createRadarRetrievalGetHandler } from "@/lib/radar/retrieval-route";

export const GET = createRadarRetrievalGetHandler(getRadarRetrieval);
