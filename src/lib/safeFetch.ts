// Server-only: fetches user-supplied URLs without letting them reach private
// networks (SSRF). Uses node:http(s) rather than fetch so every connection —
// including each redirect hop — resolves DNS through guardedLookup, which
// rejects private addresses. Checking DNS once and then calling fetch would
// leave a window for DNS rebinding.
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const USER_AGENT = "Mozilla/5.0 (compatible; SyncTripBot/1.0; +link preview)";

export class SafeFetchError extends Error {
  constructor(
    message: string,
    // "blocked": the URL or one of its redirects points somewhere we refuse to go.
    public kind: "blocked" | "failed" | "too_large"
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

function parseIPv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const octets = parts.map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
}

function isBlockedIPv4([a, b, c]: number[]) {
  return (
    a === 0 || // "this network" / unspecified
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (cloud metadata lives here)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

// Expands any valid IPv6 text form (incl. "::" and a dotted IPv4 tail) to 8 hextets.
function parseIPv6(input: string): number[] | null {
  let s = input.replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  // Rewrite a dotted IPv4 tail (::ffff:1.2.3.4) as two hextets.
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const toHextets = (part: string) =>
    part === "" ? [] : part.split(":").map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
  const head = toHextets(halves[0]);
  const rest = halves.length === 2 ? toHextets(halves[1]) : [];
  if ([...head, ...rest].some(Number.isNaN)) return null;

  const known = head.length + rest.length;
  if (halves.length === 2) {
    if (known > 7) return null;
    return [...head, ...new Array<number>(8 - known).fill(0), ...rest];
  }
  return known === 8 ? head : null;
}

function embeddedV4(h: number[], hi: number, lo: number) {
  return [h[hi] >> 8, h[hi] & 0xff, h[lo] >> 8, h[lo] & 0xff];
}

function isBlockedIPv6(h: number[]) {
  const zeroUpTo = (n: number) => h.slice(0, n).every((x) => x === 0);
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (zeroUpTo(6)) return true;
  // IPv4-mapped ::ffff:a.b.c.d
  if (zeroUpTo(5) && h[5] === 0xffff) return isBlockedIPv4(embeddedV4(h, 6, 7));
  // IPv4-translated ::ffff:0:a.b.c.d
  if (zeroUpTo(4) && h[4] === 0xffff && h[5] === 0) return isBlockedIPv4(embeddedV4(h, 6, 7));
  // NAT64 64:ff9b::/96 (the local-use 64:ff9b:1::/48 is blocked outright)
  if (h[0] === 0x64 && h[1] === 0xff9b) {
    return h.slice(2, 6).every((x) => x === 0) ? isBlockedIPv4(embeddedV4(h, 6, 7)) : true;
  }
  // 6to4 2002:a.b.c.d::/48
  if (h[0] === 0x2002) return isBlockedIPv4(embeddedV4(h, 1, 2));
  // Teredo 2001::/32 and documentation 2001:db8::/32
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true;
  // Only global unicast (2000::/3) is reachable; this excludes ULA (fc00::/7),
  // link-local (fe80::/10), site-local (fec0::/10) and multicast (ff00::/8).
  return (h[0] & 0xe000) !== 0x2000;
}

export function isBlockedAddress(address: string) {
  const family = isIP(address.replace(/^\[|\]$/g, "").split("%")[0]);
  if (family === 4) {
    const v4 = parseIPv4(address);
    return !v4 || isBlockedIPv4(v4);
  }
  if (family === 6) {
    const v6 = parseIPv6(address);
    return !v6 || isBlockedIPv6(v6);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

const blocked = (msg = "That link points to a private or local address.") =>
  new SafeFetchError(msg, "blocked");

// Every hostname the socket connects to passes through here, so a redirect
// or a rebinding DNS server can't sneak a private address past the check.
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, family: options.family ?? 0 })
    .then((addresses) => {
      if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
        callback(blocked(), "", 4);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    })
    .catch((err: NodeJS.ErrnoException) => callback(err, "", 4));
};

export function assertSafeUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("That doesn't look like a link.", "blocked");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw blocked("Only http and https links are supported.");
  if (url.username || url.password) throw blocked("Links with credentials aren't supported.");
  if (!ALLOWED_PORTS.has(url.port)) throw blocked("That port isn't allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw blocked();
  // IP literals skip DNS (and so the lookup hook); check them here.
  if (isIP(host.split("%")[0]) && isBlockedAddress(host)) throw blocked();
  if (/(^|\.)localhost\.?$/i.test(host)) throw blocked();
  return url;
}

function isBlockedError(err: unknown): boolean {
  if (err instanceof SafeFetchError) return err.kind === "blocked";
  if (err instanceof AggregateError) return err.errors.some(isBlockedError);
  return false;
}

function requestOnce(url: URL, accept: string, signal: AbortSignal) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          "Accept-Language": "en,*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        lookup: guardedLookup,
        // A fresh connection per request, so every hop goes through the lookup.
        agent: false,
        signal,
      },
      resolve
    );
    req.on("error", reject);
    req.end();
  });
}

function decoded(res: http.IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  const decoder =
    encoding === "gzip" || encoding === "x-gzip"
      ? zlib.createGunzip()
      : encoding === "deflate"
        ? zlib.createInflate()
        : encoding === "br"
          ? zlib.createBrotliDecompress()
          : null;
  if (!decoder) return res;
  res.on("error", (err) => decoder.destroy(err));
  return res.pipe(decoder);
}

// Caps the *decoded* size, so a small gzip bomb can't blow past the limit.
async function readBody(res: http.IncomingMessage, maxBytes: number, truncate: boolean) {
  const declared = Number(res.headers["content-length"]);
  if (!truncate && declared > maxBytes) {
    res.destroy();
    throw new SafeFetchError("The response is too large.", "too_large");
  }
  const stream = decoded(res);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > maxBytes) {
        if (!truncate) throw new SafeFetchError("The response is too large.", "too_large");
        chunks.push(chunk.subarray(0, chunk.length - (total - maxBytes)));
        break;
      }
      chunks.push(chunk);
    }
  } finally {
    stream.destroy();
    res.destroy();
  }
  return Buffer.concat(chunks);
}

export interface SafeResponse {
  url: URL; // final URL after redirects
  status: number;
  contentType: string;
  body: Buffer;
}

export interface SafeFetchOptions {
  accept?: string;
  maxBytes?: number;
  // Keep the first maxBytes instead of failing (fine for HTML <head> parsing).
  truncate?: boolean;
  // Stop following redirects once a hop matches; returns that URL with an empty body.
  stopAt?: (url: URL) => boolean;
}

export async function safeFetch(raw: string | URL, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { accept = "*/*", maxBytes = 1024 * 1024, truncate = false, stopAt } = opts;
  // One budget for the whole redirect chain and body.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = assertSafeUrl(raw);

  for (let hop = 0; ; hop++) {
    let res: http.IncomingMessage;
    try {
      res = await requestOnce(url, accept, signal);
    } catch (err) {
      if (isBlockedError(err)) throw blocked();
      throw new SafeFetchError("Couldn't reach that link.", "failed");
    }

    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.destroy();
      if (hop >= MAX_REDIRECTS) throw new SafeFetchError("Too many redirects.", "failed");
      // Re-validated on every hop; the lookup hook re-checks DNS when connecting.
      url = assertSafeUrl(new URL(location, url));
      if (stopAt?.(url)) return { url, status, contentType: "", body: Buffer.alloc(0) };
      continue;
    }

    try {
      const body = await readBody(res, maxBytes, truncate);
      return { url, status, contentType: String(res.headers["content-type"] ?? ""), body };
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      throw new SafeFetchError("Couldn't read that link.", "failed");
    }
  }
}
