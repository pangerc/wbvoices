/**
 * Helpers for the media URLs `/api/media` hands out.
 */

/**
 * Add the `download=1` flag to a media URL, so the route signs a
 * `response-content-disposition` override and the browser saves the file instead
 * of playing it inline.
 *
 * Media URLs are `/api/media?path=<file>` and already carry a query string, so
 * appending `?download=1` after the last path segment produces a second `?`
 * (`?path=file?download=1`) and a 404 — the AAC-229 bug. `URL.searchParams.set`
 * handles both that shape and any legacy no-query URL. The string fallback is
 * for a value `URL` can't parse at all (and for non-browser callers, where
 * there's no `window.location` to resolve a relative URL against).
 */
export function withDownloadParam(url: string): string {
  try {
    const base =
      typeof window === "undefined" ? undefined : window.location.origin;
    const parsed = new URL(url, base);

    parsed.searchParams.set("download", "1");

    return parsed.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}download=1`;
  }
}
