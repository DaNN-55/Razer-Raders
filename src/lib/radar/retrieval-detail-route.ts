import type { RadarRetrievalReader } from "./retrieval-contract.ts";

export function createRadarRetrievalDetailGetHandler(readDetail: RadarRetrievalReader["retrieveDetail"]) {
  return async function GET(request: Request): Promise<Response> {
    const signalId = new URL(request.url).searchParams.get("id")?.trim();
    if (!signalId) return Response.json({ error: "id 必须是有效的 Radar Signal ID。" }, { status: 400 });

    const detail = await readDetail(signalId);
    if (!detail) return Response.json({ error: "未找到已发布的历史 Signal Card。" }, { status: 404 });
    return Response.json(detail);
  };
}
