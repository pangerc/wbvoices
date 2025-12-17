/**
 * Utility for making internal API calls that bypass Vercel Deployment Protection.
 * Use this for server-to-server calls within the same deployment.
 */

export function getBaseUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT || 3003}`;
}

/**
 * Fetch wrapper that includes Vercel deployment protection bypass header.
 * Use this for all internal API calls (server-to-server within same deployment).
 */
export async function internalFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = getBaseUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Add bypass header if secret is configured
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    (headers as Record<string, string>)["x-vercel-protection-bypass"] = bypassSecret;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
