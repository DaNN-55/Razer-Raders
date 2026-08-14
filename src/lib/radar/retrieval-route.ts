import type { RadarRetrievalFilter, RadarRetrievalReader } from "./retrieval-contract.ts";

const defaultLimit = 20;
const maximumLimit = 50;

function parseInteger(value: string | null, defaultValue: number, name: "limit" | "offset") {
  if (value === null) return { value: defaultValue };
  if (!/^\d+$/.test(value)) return { error: `${name} 必须是 ${name === "limit" ? "1 到 50 的" : "非负"}整数。` };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (name === "limit" ? parsed < 1 || parsed > maximumLimit : parsed < 0)) {
    return { error: `${name} 必须是 ${name === "limit" ? "1 到 50 的" : "非负"}整数。` };
  }
  return { value: parsed };
}

function parseDate(value: string | null, name: "from" | "to") {
  if (value === null) return {};
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return { error: `${name} 必须是有效的 ISO 日期时间。` };
  const date = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString() !== normalized) return { error: `${name} 必须是有效的 ISO 日期时间。` };
  return { value: date };
}

function getOptionalValue(params: URLSearchParams, key: "query" | "signalType" | "subject" | "topic") {
  const value = params.get(key)?.trim();
  return value ? { value } : {};
}

export function createRadarRetrievalGetHandler(reader: RadarRetrievalReader["retrieve"]) {
  return async function GET(request: Request): Promise<Response> {
    const parameters = new URL(request.url).searchParams;
    const limit = parseInteger(parameters.get("limit"), defaultLimit, "limit");
    if ("error" in limit) return Response.json({ error: limit.error }, { status: 400 });
    const offset = parseInteger(parameters.get("offset"), 0, "offset");
    if ("error" in offset) return Response.json({ error: offset.error }, { status: 400 });
    const from = parseDate(parameters.get("from"), "from");
    if ("error" in from) return Response.json({ error: from.error }, { status: 400 });
    const to = parseDate(parameters.get("to"), "to");
    if ("error" in to) return Response.json({ error: to.error }, { status: 400 });
    if (from.value && to.value && from.value > to.value) return Response.json({ error: "from 不能晚于 to。" }, { status: 400 });

    const topic = getOptionalValue(parameters, "topic");
    const query = getOptionalValue(parameters, "query");
    const signalType = getOptionalValue(parameters, "signalType");
    const subject = getOptionalValue(parameters, "subject");
    const filter: RadarRetrievalFilter = {
      limit: limit.value,
      offset: offset.value,
      ...(from.value ? { from: from.value } : {}),
      ...(to.value ? { to: to.value } : {}),
      ...(query.value ? { query: query.value } : {}),
      ...(topic.value ? { topic: topic.value } : {}),
      ...(signalType.value ? { signalType: signalType.value } : {}),
      ...(subject.value ? { subject: subject.value } : {}),
    };
    return Response.json(await reader(filter));
  };
}
