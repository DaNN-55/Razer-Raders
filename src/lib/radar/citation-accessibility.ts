type CitationFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function createCitationAccessibilityCheck(retainedEvidenceUrls: readonly string[], citationFetch: CitationFetch = fetch) {
  const allowedUrls = new Set(retainedEvidenceUrls);

  return async function isCitationAccessible(citationUrl: string) {
    if (!allowedUrls.has(citationUrl)) return false;

    let url: URL;
    try {
      url = new URL(citationUrl);
    } catch {
      return false;
    }
    if (url.protocol !== "https:") return false;

    try {
      const response = await citationFetch(url, {
        headers: { "User-Agent": "Razer-Raders/0.1 (section citation validation)" },
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}
