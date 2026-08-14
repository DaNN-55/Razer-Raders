import { createRadarRetrievalDetailGetHandler } from "@/lib/radar/retrieval-detail-route";
import { getRadarRetrievalDetail } from "@/lib/radar/retrieval";

export const GET = createRadarRetrievalDetailGetHandler(getRadarRetrievalDetail);
