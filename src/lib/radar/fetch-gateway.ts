const MAX_RESPONSE_BYTES = 900_000;
const FETCH_TIMEOUT_MS = 12_000;

export type RegisteredSource = {
  allowedHosts: readonly string[];
  url: string;
};

export type FetchedPage = {
  body: string;
  contentType: string;
  url: string;
};

export async function fetchRegisteredPage(source: RegisteredSource): Promise<FetchedPage> {
  const url = new URL(source.url);

  if (url.protocol !== "https:" || !source.allowedHosts.includes(url.hostname)) {
    throw new Error("该来源不在允许的 HTTPS 域名列表中。");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Razer-Raders/0.1 (self-hosted source connector)",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("来源请求发生重定向，等待已登记目标后再采集。");
  }

  if (!response.ok) {
    throw new Error(`来源请求失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("来源返回了不允许的内容类型。");
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("来源响应超过允许大小。");
  }

  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("来源响应超过允许大小。");
  }

  return { body, contentType, url: url.toString() };
}
