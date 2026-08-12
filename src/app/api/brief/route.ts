import { getRadarBrief } from "@/lib/radar/brief";

export async function GET() {
  return Response.json(await getRadarBrief());
}
