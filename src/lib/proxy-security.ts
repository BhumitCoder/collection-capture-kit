const MAX_REDIRECTS = 3;
const SHOPIFY_HANDLE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return true;
  }
  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (!bare.includes(":")) return false;
  const normalized = bare.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isPrivateIpv4(mapped)) return true;
    // Block hex-encoded IPv4-mapped IPv6 literals (e.g. ::ffff:7f00:1)
    if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(mapped)) return true;
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!lower) return true;
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".arpa")
  ) {
    return true;
  }
  // Reject integer/hex/octal IP encodings (e.g. 2130706433, 0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(lower)) return true;
  if (isPrivateIpv4(lower) || isPrivateIpv6(lower)) return true;
  if (!lower.includes(".") && !lower.includes(":")) return true;
  return false;
}

export function assertPublicHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid public HTTPS address.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only public HTTPS URLs are supported.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("Non-standard ports are not allowed.");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Private, local, or internal addresses are not allowed.");
  }
  return parsed;
}

export function buildShopifyProxyTarget(params: {
  store: string;
  type: string;
  handle?: string | null;
  page?: string | null;
  limit?: string | null;
}): URL {
  const storeUrl = assertPublicHttpsUrl(
    params.store.includes("://") ? params.store : `https://${params.store.trim()}`,
  );
  const origin = storeUrl.origin;

  const pageNum = Math.min(100, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));

  if (params.type === "collections") {
    const limitNum = Math.min(250, Math.max(1, Number.parseInt(params.limit ?? "250", 10) || 250));
    return new URL(`${origin}/collections.json?limit=${limitNum}&page=${pageNum}`);
  }

  const handle = (params.handle ?? "").trim();
  if (!SHOPIFY_HANDLE_PATTERN.test(handle)) {
    throw new Error("Invalid Shopify handle.");
  }

  if (params.type === "products") {
    const limitNum = Math.min(250, Math.max(1, Number.parseInt(params.limit ?? "24", 10) || 24));
    return new URL(
      `${origin}/collections/${encodeURIComponent(handle)}/products.json?limit=${limitNum}&page=${pageNum}`,
    );
  }

  if (params.type === "product") {
    return new URL(`${origin}/products/${encodeURIComponent(handle)}.js`);
  }

  throw new Error("Unsupported Shopify resource type.");
}

export async function fetchPublicResource(
  initialUrl: URL,
  options: {
    accept?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  let currentUrl = assertPublicHttpsUrl(initialUrl.toString());
  const timeoutMs = options.timeoutMs ?? 20_000;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: options.accept ?? "*/*",
          "User-Agent": "StudioVault/1.0 (+https://vercel.com)",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new Error("Too many redirects from remote host.");
        }
        currentUrl = assertPublicHttpsUrl(new URL(location, currentUrl).toString());
        continue;
      }

      return response;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  throw new Error("Too many redirects from remote host.");
}
