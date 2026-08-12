import type { RadarBrief } from "./brief-contract.ts";

export function createBriefGetHandler(getRadarBrief: () => Promise<RadarBrief>) {
  return async function GET() {
    return Response.json(await getRadarBrief());
  };
}
