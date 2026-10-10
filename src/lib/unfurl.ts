// Server-only: turns a pasted link (Google Maps, TikTok, YouTube, or any page
// with Open Graph tags) into the fields of a saved place.
import type { Category } from "@/lib/types";
import { safeFetch } from "@/lib/safeFetch";

export interface UnfurlData {
  title: string | null;
  note: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
}

const MAX_TITLE = 120;
const MAX_NOTE = 500;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  agrave: "à",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  ccedil: "ç",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  szlig: "ß",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    // Case-sensitive: &Eacute; and &eacute; differ.
    return NAMED_ENTITIES[code] ?? m;
  });
}

function clean(s: string | null | undefined, max: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

// Video captions make poor place names: drop hashtags/mentions and keep the first line.
function captionTitle(caption: string) {
  const firstLine = caption.split(/\n/)[0];
  return clean(firstLine.replace(/[#@][^\s#@]+/g, ""), 80);
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function validCoords(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function guessCategory(...texts: (string | null)[]): Category {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (/\b(hotel|hostel|ryokan|resort|motel|guesthouse|guest house|inn|airbnb|lodge)\b/.test(t)) return "stay";
  if (t.includes("café") || /\b(restaurant|cafe|coffee|ramen|sushi|bar|izakaya|bakery|bistro|eatery|pizza|noodles?|food)\b/.test(t))
    return "eat";
  return "do";
}

// ---------------------------------------------------------------------------
// Google Maps
// ---------------------------------------------------------------------------

function isGoogleHost(host: string) {
  return /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}

export function isGoogleMapsUrl(u: URL) {
  const host = u.hostname.toLowerCase();
  return isGoogleHost(host) && (host.startsWith("maps.") || u.pathname.startsWith("/maps"));
}

function isGoogleShortLink(u: URL) {
  const host = u.hostname.toLowerCase();
  return host === "maps.app.goo.gl" || (host === "goo.gl" && u.pathname.startsWith("/maps"));
}

const COORD = "(-?\\d{1,3}(?:\\.\\d+)?)";

export function parseGoogleMapsUrl(u: URL): UnfurlData | null {
  const path = safeDecode(u.pathname);
  let title: string | null = null;
  let lat = NaN;
  let lng = NaN;

  // /maps/place/<name>/… or /maps/search/<query>/…
  const named = /\/maps\/(?:place|search)\/([^/]+)/.exec(u.pathname);
  if (named && !named[1].startsWith("@")) {
    title = clean(safeDecode(named[1].replace(/\+/g, " ")), MAX_TITLE);
  }

  // !3d…!4d… is the place itself; @lat,lng is only the viewport centre.
  const pin = new RegExp(`!3d${COORD}!4d${COORD}`).exec(path + u.search);
  const view = new RegExp(`@${COORD},${COORD}`).exec(path);
  const m = pin ?? view;
  if (m) {
    lat = parseFloat(m[1]);
    lng = parseFloat(m[2]);
  }

  // ?q= / ?query= are either "lat,lng" or a name/address.
  const q = u.searchParams.get("q") ?? u.searchParams.get("query") ?? u.searchParams.get("destination");
  if (q) {
    const asCoords = new RegExp(`^\\s*${COORD}\\s*,\\s*${COORD}\\s*$`).exec(q);
    if (asCoords) {
      if (!m) {
        lat = parseFloat(asCoords[1]);
        lng = parseFloat(asCoords[2]);
      }
    } else if (!title) {
      title = clean(q, MAX_TITLE);
    }
  }

  const hasCoords = validCoords(lat, lng);
  if (!title && !hasCoords) return null;
  return {
    title,
    note: null,
    address: null,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    imageUrl: null,
  };
}

// ---------------------------------------------------------------------------
// oEmbed (TikTok, YouTube)
// ---------------------------------------------------------------------------

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
}

function isTikTok(u: URL) {
  return /(^|\.)tiktok\.com$/i.test(u.hostname);
}

function isTikTokShortLink(u: URL) {
  return /^(vm|vt)\.tiktok\.com$/i.test(u.hostname);
}

function isYouTube(u: URL) {
  return /(^|\.)youtube\.com$/i.test(u.hostname) || /^youtu\.be$/i.test(u.hostname);
}

async function fetchOEmbed(endpoint: string): Promise<OEmbed> {
  const res = await safeFetch(endpoint, { accept: "application/json" });
  if (res.status < 200 || res.status >= 300) throw new Error("oEmbed failed");
  return JSON.parse(res.body.toString("utf8")) as OEmbed;
}

async function unfurlOEmbed(u: URL): Promise<UnfurlData> {
  const tiktok = isTikTok(u);
  if (tiktok) {
    // Share links carry tracking params; oEmbed only needs the video path.
    u = new URL(u);
    u.search = "";
  }
  const endpoint = tiktok
    ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(u.toString())}`
    : `https://www.youtube.com/oembed?url=${encodeURIComponent(u.toString())}&format=json`;
  const data = await fetchOEmbed(endpoint);
  const caption = decodeEntities(data.title ?? "");
  const by = data.author_name ? ` by ${data.author_name}` : "";
  return {
    title: tiktok ? captionTitle(caption) : clean(caption, MAX_TITLE),
    // TikTok captions are often the only description of the place.
    note: tiktok ? clean(`${caption}${by ? ` (TikTok${by})` : ""}`, MAX_NOTE) : clean(`YouTube video${by}`, MAX_NOTE),
    address: null,
    lat: null,
    lng: null,
    imageUrl: data.thumbnail_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Open Graph / Twitter / <title>
// ---------------------------------------------------------------------------

function parseAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

export function parseHtmlMeta(html: string, pageUrl: URL): UnfurlData {
  // Everything useful is in <head>; don't scan megabytes of body.
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 300_000);

  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = parseAttributes(tag);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    // First occurrence wins (og:image may repeat).
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const pick = (...keys: string[]) => keys.map((k) => meta[k]?.trim()).find(Boolean) ?? null;

  const siteName = pick("og:site_name", "application-name");
  let title = pick("og:title", "twitter:title") ?? (titleTag ? decodeEntities(titleTag[1]) : null);
  // "Ichiran Shibuya | Tripadvisor" → "Ichiran Shibuya"
  if (title && siteName) {
    const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`\\s+[|\\-–—·:]\\s+${escaped}\\s*$`, "i"), "") || title;
  }

  let imageUrl: string | null = null;
  const image = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  if (image) {
    try {
      imageUrl = new URL(image, pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  const lat = parseFloat(pick("place:location:latitude", "og:latitude") ?? "");
  const lng = parseFloat(pick("place:location:longitude", "og:longitude") ?? "");
  const hasCoords = validCoords(lat, lng);
  const address = [pick("og:street-address"), pick("og:locality"), pick("og:country-name")].filter(Boolean).join(", ");

  return {
    title: clean(title, MAX_TITLE),
    note: clean(pick("og:description", "twitter:description", "description"), MAX_NOTE),
    address: address || null,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    imageUrl,
  };
}

function charsetOf(contentType: string, body: Buffer) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 2048).toString("latin1"))?.[1];
  return fromHeader ?? fromMeta ?? "utf-8";
}

async function unfurlHtml(u: URL): Promise<UnfurlData> {
  const res = await safeFetch(u, {
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    truncate: true,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  if (!/html|xml/i.test(res.contentType)) throw new Error("Not an HTML page");
  let html: string;
  try {
    html = new TextDecoder(charsetOf(res.contentType, res.body)).decode(res.body);
  } catch {
    html = res.body.toString("utf8");
  }
  return parseHtmlMeta(html, res.url);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Follows a short link (through the SSRF guard) until it reaches a URL we can parse.
async function expand(u: URL, done: (u: URL) => boolean): Promise<URL> {
  const res = await safeFetch(u, { stopAt: done, maxBytes: 64 * 1024, truncate: true });
  // Google's EU cookie wall: the real link is in ?continue=.
  if (res.url.hostname === "consent.google.com") {
    const next = res.url.searchParams.get("continue");
    if (next) return new URL(next);
  }
  return res.url;
}

export async function unfurl(input: URL): Promise<UnfurlData> {
  let u = input;

  if (isGoogleShortLink(u)) u = await expand(u, isGoogleMapsUrl);
  if (isGoogleMapsUrl(u)) {
    const parsed = parseGoogleMapsUrl(u);
    if (parsed) return parsed;
    // e.g. ?cid= links carry no name; fall back to the page's meta tags.
  }

  if (isTikTokShortLink(u)) u = await expand(u, (x) => isTikTok(x) && !isTikTokShortLink(x));
  if (isTikTok(u) || isYouTube(u)) {
    try {
      return await unfurlOEmbed(u);
    } catch {
      // Not an embeddable video (profile page, private video…); try meta tags.
    }
  }

  return unfurlHtml(u);
}
