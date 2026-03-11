/**
 * Utility for making internal API calls that bypass Vercel Deployment Protection.
 * Use this for server-to-server calls within the same deployment.
 *
 * IMPORTANT: Always pass the original request's cookie header to preserve
 * auth session through internal call chains.
 */

export function getBaseUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT || 3003}`;
}

/**
 * Fetch wrapper for internal API calls.
 * Forwards auth cookies so the middleware doesn't block server-to-server requests.
 *
 * @param path - API path (e.g., "/api/voice/elevenlabs")
 * @param options - Standard RequestInit options
 * @param cookie - Original request's cookie header: `req.headers.get('cookie')`
 */
export async function internalFetch(
  path: string,
  options: RequestInit = {},
  cookie?: string | null
): Promise<Response> {
  const baseUrl = getBaseUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  // Forward auth cookie from the original request
  if (cookie) {
    headers["cookie"] = cookie;
  }

  // Add bypass header if secret is configured
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
