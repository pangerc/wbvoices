/**
 * SSRF guard for server-to-server pull (AAC-185, P4-4 / R-13).
 *
 * The destination fetches an admin-supplied `sourceUrl`. Without validation it
 * could be pointed at internal services or the cloud metadata endpoint. We
 * require https and reject hosts that resolve to private/loopback/link-local/
 * ULA/metadata addresses — resolving via DNS so a public hostname can't front
 * a private IP. An optional `BACKUP_PULL_ALLOWED_HOSTS` allowlist (trusted
 * internal migration / tests) bypasses the scheme + private-IP checks.
 */

export class SsrfError extends Error {
  readonly code = "SSRF_BLOCKED";
  readonly status = 400;
}

/** Injectable resolver so tests can avoid real DNS. */
export type Resolver = (host: string) => Promise<string[]>;

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.BACKUP_PULL_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (x === "::1" || x === "::") return true; // loopback / unspecified
  if (x.startsWith("fe80")) return true; // link-local
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // unique-local
  if (x.startsWith("::ffff:")) return isPrivateIPv4(x.slice(7)); // v4-mapped
  return false;
}

function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "metadata.google.internal"]);

async function defaultResolver(host: string): Promise<string[]> {
  const dns = await import("node:dns/promises");
  const records = await dns.lookup(host, { all: true });
  return records.map((r) => r.address);
}

/**
 * Validate an admin-supplied source URL. Throws {@link SsrfError} if unsafe.
 * Returns the normalized URL string on success.
 */
export async function validateSourceUrl(
  input: string,
  resolver: Resolver = defaultResolver,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SsrfError(`Invalid URL: ${input}`);
  }

  const host = url.hostname.toLowerCase();
  const allow = allowedHosts();
  if (allow.has(host)) return url.toString();

  if (url.protocol !== "https:") {
    throw new SsrfError("Source URL must use https");
  }
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local")) {
    throw new SsrfError(`Blocked host: ${host}`);
  }

  // If the host is a literal IP, check it directly; else resolve via DNS.
  const literalIp = /^[\d.]+$/.test(host) || host.includes(":");
  const addresses = literalIp ? [host.replace(/^\[|\]$/g, "")] : await resolver(host);
  if (addresses.length === 0) {
    throw new SsrfError(`Could not resolve host: ${host}`);
  }
  for (const ip of addresses) {
    if (isPrivateAddress(ip)) {
      throw new SsrfError(`Host resolves to a private address: ${ip}`);
    }
  }

  return url.toString();
}
