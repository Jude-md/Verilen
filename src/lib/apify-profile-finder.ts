import dns from "dns/promises";
import net from "net";
import type {
  DiscoverySource,
  ExtendedSocialPlatform,
  ProfileCandidateDTO,
  WebsiteProfileScanItem,
  WebsiteProfileScanResponse,
} from "@/lib/live-types";
import type { SocialPlatform } from "@/db/schema";
import { maskKey, readSecret, readSecretWithSource } from "@/lib/env-secure";

/**
 * Integration with Apify Actor `automation-lab/social-media-profile-finder`
 * plus a built-in live public HTML / Schema.org JSON-LD `sameAs` / inline-script
 * extractor fallback that runs immediately with zero API key.
 *
 * Reference contract: https://apify.com/automation-lab/social-media-profile-finder.md
 * Pricing:
 *   - Batch Actor run: $0.035 start fee + $0.001 / website scanned
 *   - Standby Server mode: $0.001 / website scanned (no start fee)
 *   - Built-in live HTTP extractor: $0.00 (handles open websites directly; no proxy retry for HTTP 403)
 */

export const APIFY_ACTOR_ID = "automation-lab/social-media-profile-finder" as const;
const APIFY_ACTOR_API_SLUG = "automation-lab~social-media-profile-finder";
const APIFY_API_BASE = "https://api.apify.com/v2";

export const APIFY_PRICING = {
  actorStartUsd: 0.035,
  perUrlUsd: 0.001,
  serverPerUrlUsd: 0.001,
};

export const ALL_EXTENDED_PLATFORMS: ExtendedSocialPlatform[] = [
  "instagram",
  "twitter",
  "linkedin",
  "tiktok",
  "youtube",
  "github",
  "facebook",
  "threads",
  "bluesky",
  "pinterest",
  "reddit",
  "discord",
  "telegram",
  "whatsapp",
  "snapchat",
  "medium",
  "mastodon",
];

export const EXTENDED_PLATFORM_LABELS: Record<ExtendedSocialPlatform, string> = {
  instagram: "Instagram",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  github: "GitHub",
  facebook: "Facebook",
  threads: "Threads",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  reddit: "Reddit",
  discord: "Discord",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  snapchat: "Snapchat",
  medium: "Medium",
  mastodon: "Mastodon",
};

const MAX_RESPONSE_BYTES = 512 * 1024;
const PAGE_TIMEOUT_MS = 10_000;
const APIFY_RUN_TIMEOUT_SEC = 45;

const APIFY_TOKEN_ALIASES = ["APIFY_TOKEN", "API_TOKEN"];

export function getApifyToken(): string | undefined {
  const val = readSecret("APIFY_API_TOKEN", APIFY_TOKEN_ALIASES);
  if (!val || val.includes("<YOUR_API_TOKEN>") || val === "YOUR_TOKEN") {
    return undefined;
  }
  return val;
}

export function getApifyServerUrl(): string | undefined {
  const raw = readSecret("APIFY_PROFILE_FINDER_SERVER_URL", ["APIFY_SERVER_URL"]);
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

export function getApifyConfigSummary() {
  const tokenInfo = readSecretWithSource("APIFY_API_TOKEN", APIFY_TOKEN_ALIASES);
  const validVal =
    tokenInfo.value &&
    !tokenInfo.value.includes("<YOUR_API_TOKEN>") &&
    tokenInfo.value !== "YOUR_TOKEN"
      ? tokenInfo.value
      : undefined;
  const effectiveInfo = validVal
    ? { ...tokenInfo, value: validVal }
    : { value: undefined, source: null, envName: null };
  const serverUrl = getApifyServerUrl() ?? null;
  const configured = Boolean(effectiveInfo.value);
  return {
    actorId: APIFY_ACTOR_ID,
    configured,
    source: effectiveInfo.source,
    envName: effectiveInfo.envName,
    maskedToken: effectiveInfo.value ? maskKey(effectiveInfo.value) : null,
    serverUrl,
    mode: configured
      ? serverUrl
        ? ("apify_server" as const)
        : ("apify_actor" as const)
      : ("builtin_live" as const),
    pricing: APIFY_PRICING,
  };
}

export function estimateApifyCost(urlCount: number, isServerMode: boolean): number {
  if (urlCount <= 0) return 0;
  const cost = isServerMode
    ? urlCount * APIFY_PRICING.serverPerUrlUsd
    : APIFY_PRICING.actorStartUsd + urlCount * APIFY_PRICING.perUrlUsd;
  return Math.round(cost * 10000) / 10000;
}

/** Detects whether a pasted string looks like documentation/placeholder instead of a real token. */
export function detectPlaceholderApifyToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Paste your Apify API token first.";
  if (
    trimmed.includes("<YOUR_API_TOKEN>") ||
    trimmed.includes("YOUR_TOKEN") ||
    trimmed.includes("automation-lab/social-media-profile-finder") ||
    trimmed.length > 220 ||
    /\s/.test(trimmed)
  ) {
    return "That looks like documentation text or a placeholder, not a real Apify API token. Copy your personal token (starts with apify_api_…) from console.apify.com/settings/integrations.";
  }
  if (trimmed.length < 18) {
    return "That token looks too short. Copy the full token (starts with apify_api_…) from Apify Console → Settings → API & Integrations.";
  }
  return null;
}

/**
 * Verifies an Apify API token for free (no run charge) via GET /v2/users/me,
 * and if a Standby Server URL is supplied verifies GET / (also free, returns ready: true).
 */
export async function verifyApifyCredentials(
  token: string,
  serverUrl?: string | null
): Promise<{ ok: boolean; message: string; username?: string }> {
  const problem = detectPlaceholderApifyToken(token);
  if (problem) return { ok: false, message: problem };

  try {
    const res = await fetch(`${APIFY_API_BASE}/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });

    const data = (await res.json().catch(() => null)) as {
      data?: { username?: string; email?: string; plan?: { id?: string } };
      error?: { message?: string };
    } | null;

    if (!res.ok || !data?.data) {
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message:
            "Apify rejected this API token. Check it under console.apify.com/settings/integrations.",
        };
      }
      return {
        ok: false,
        message:
          data?.error?.message ||
          `Apify verification returned HTTP ${res.status}.`,
      };
    }

    const username = data.data.username || "account";
    let note = `Connected to Apify (@${username}) — automation-lab/social-media-profile-finder ready.`;

    if (serverUrl && serverUrl.trim()) {
      const cleaned = serverUrl.trim().replace(/\/+$/, "");
      let parsed: URL;
      try {
        parsed = new URL(cleaned);
      } catch {
        return { ok: false, message: "Standby Server URL must be a valid https:// URL." };
      }
      if (parsed.protocol !== "https:") {
        return { ok: false, message: "Standby Server URL must start with https://." };
      }
      if (await isPrivateTarget(parsed.hostname)) {
        return { ok: false, message: "Private or local Standby Server URLs are not allowed." };
      }

      const srvRes = await fetch(`${cleaned}/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!srvRes.ok) {
        return {
          ok: false,
          message: `Token is valid (@${username}), but Server URL returned HTTP ${srvRes.status}. Copy the exact URL from the Actor's Server tab.`,
        };
      }
      note = `Connected to Apify Server mode (@${username}) — $0.001/website, no start fee.`;
    }

    return { ok: true, message: note, username };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error && err.name === "TimeoutError"
          ? "Timed out connecting to api.apify.com."
          : "Could not reach api.apify.com. Check network access and try again.",
    };
  }
}

/** Auto-prefixes domains like `apify.com` -> `https://apify.com` and safely validates inputs. */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  if (/\s/.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.includes(".") && /^[a-zA-Z0-9.-]+(\/.*)?$/.test(trimmed)
      ? `https://${trimmed}`
      : null;

  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname.includes(".") || parsed.hostname.endsWith(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateIp(lower.slice(7));
    }
  }
  return false;
}

async function isPrivateTarget(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    return true;
  }
  if (net.isIP(host)) return isPrivateIp(host);
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) return false;
    return records.some((r) => isPrivateIp(r.address));
  } catch {
    return false;
  }
}

/** Empty 16-platform profiles map matching automation-lab/social-media-profile-finder output. */
function emptyProfilesMap(): Record<ExtendedSocialPlatform, string | null> {
  return {
    instagram: null,
    twitter: null,
    linkedin: null,
    tiktok: null,
    youtube: null,
    github: null,
    facebook: null,
    threads: null,
    bluesky: null,
    pinterest: null,
    reddit: null,
    discord: null,
    telegram: null,
    whatsapp: null,
    snapchat: null,
    medium: null,
    mastodon: null,
  };
}

const SKIP_COMMON = new Set([
  "share",
  "sharer",
  "sharer.php",
  "intent",
  "login",
  "signup",
  "register",
  "home",
  "explore",
  "search",
  "about",
  "help",
  "support",
  "privacy",
  "terms",
  "legal",
  "policy",
  "policies",
  "settings",
  "account",
  "accounts",
  "oauth",
  "dialog",
  "plugins",
  "embed",
  "widgets",
  "favicon.ico",
  "robots.txt",
]);

/** Extracts canonical URL + platform + display handle from any candidate social URL across 16 platforms. */
export function parseExtendedSocialUrl(rawUrl: string): {
  platform: ExtendedSocialPlatform;
  canonicalUrl: string;
  handle: string;
} | null {
  let cleaned = rawUrl
    .trim()
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/[)"'\\,;>\]]+$/, "");

  if (cleaned.startsWith("//")) cleaned = `https:${cleaned}`;
  if (!/^https?:\/\//i.test(cleaned)) return null;

  let u: URL;
  try {
    u = new URL(cleaned);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const segs = u.pathname
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s).trim();
      } catch {
        return s.trim();
      }
    })
    .filter(Boolean);

  if (segs.length === 0) return null;
  const s0 = segs[0];
  const s0Low = s0.toLowerCase();
  if (SKIP_COMMON.has(s0Low)) return null;

  // Instagram
  if (host === "instagram.com") {
    const blocked = new Set(["p", "reel", "reels", "stories", "tv", "direct", "tags", "locations", "developer"]);
    const user = s0.replace(/^@+/, "");
    if (blocked.has(user.toLowerCase()) || !/^[a-zA-Z0-9._]{2,40}$/.test(user)) return null;
    return {
      platform: "instagram",
      canonicalUrl: `https://www.instagram.com/${user}`,
      handle: `@${user}`,
    };
  }

  // Twitter / X
  if (host === "x.com" || host === "twitter.com") {
    const blocked = new Set(["i", "status", "hashtag", "compose", "notifications", "messages", "tos", "privacy", "share"]);
    const user = s0.replace(/^@+/, "");
    if (blocked.has(user.toLowerCase()) || !/^[a-zA-Z0-9_]{1,25}$/.test(user)) return null;
    return {
      platform: "twitter",
      canonicalUrl: `https://x.com/${user}`,
      handle: `@${user}`,
    };
  }

  // LinkedIn (personal /in/, company /company/, school /school/)
  if (host === "linkedin.com") {
    const kind = s0Low;
    if ((kind === "in" || kind === "company" || kind === "school") && segs[1]) {
      const slug = segs[1];
      if (!/^[a-zA-Z0-9._%-]{2,90}$/.test(slug)) return null;
      return {
        platform: "linkedin",
        canonicalUrl: `https://www.linkedin.com/${kind}/${slug}`,
        handle: `${kind}/${slug}`,
      };
    }
    return null;
  }

  // TikTok
  if (host === "tiktok.com") {
    if (!s0.startsWith("@")) return null;
    const user = s0.slice(1);
    if (!/^[a-zA-Z0-9._]{2,40}$/.test(user)) return null;
    return {
      platform: "tiktok",
      canonicalUrl: `https://www.tiktok.com/@${user}`,
      handle: `@${user}`,
    };
  }

  // YouTube
  if (host === "youtube.com") {
    if (s0.startsWith("@")) {
      const user = s0.slice(1);
      if (!/^[a-zA-Z0-9._-]{2,60}$/.test(user)) return null;
      return {
        platform: "youtube",
        canonicalUrl: `https://www.youtube.com/@${user}`,
        handle: `@${user}`,
      };
    }
    if ((s0Low === "c" || s0Low === "user" || s0Low === "channel") && segs[1]) {
      return {
        platform: "youtube",
        canonicalUrl: `https://www.youtube.com/${s0Low}/${segs[1]}`,
        handle: s0Low === "channel" ? segs[1].slice(0, 20) : `@${segs[1]}`,
      };
    }
    return null;
  }

  // GitHub
  if (host === "github.com") {
    const blocked = new Set([
      "features", "topics", "collections", "trending", "marketplace",
      "orgs", "sponsors", "pricing", "enterprise", "security", "site",
      "apps", "customer-stories", "readme", "events", "issues", "pulls",
      "blog", "contact", "join", "solutions", "resources", "team", "platform",
      "login", "signup", "explore", "about", "copilot", "actions", "codespaces",
    ]);
    if (blocked.has(s0Low) || !/^[a-zA-Z0-9-]{1,40}$/.test(s0)) return null;
    return {
      platform: "github",
      canonicalUrl: `https://github.com/${s0}`,
      handle: `@${s0}`,
    };
  }

  // Facebook
  if (host === "facebook.com" || host === "fb.com") {
    const blocked = new Set(["sharer", "sharer.php", "share.php", "tr", "events", "groups", "watch", "marketplace", "gaming", "pages", "help", "policies", "ads", "business", "reel"]);
    if (blocked.has(s0Low)) return null;
    if (s0Low === "profile.php") {
      const id = u.searchParams.get("id");
      if (!id || !/^\d+$/.test(id)) return null;
      return {
        platform: "facebook",
        canonicalUrl: `https://www.facebook.com/profile.php?id=${id}`,
        handle: `fb/${id}`,
      };
    }
    if (!/^[a-zA-Z0-9._-]{2,60}$/.test(s0)) return null;
    return {
      platform: "facebook",
      canonicalUrl: `https://www.facebook.com/${s0}`,
      handle: `@${s0}`,
    };
  }

  // Threads
  if (host === "threads.net" || host === "threads.com") {
    const user = s0.replace(/^@+/, "");
    if (!/^[a-zA-Z0-9._]{2,40}$/.test(user)) return null;
    return {
      platform: "threads",
      canonicalUrl: `https://www.threads.net/@${user}`,
      handle: `@${user}`,
    };
  }

  // Bluesky
  if (host === "bsky.app") {
    if (s0Low === "profile" && segs[1]) {
      const actor = segs[1].replace(/^@+/, "");
      if (actor.startsWith("did:") || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(actor)) {
        return {
          platform: "bluesky",
          canonicalUrl: `https://bsky.app/profile/${actor}`,
          handle: actor.startsWith("did:") ? actor : `@${actor}`,
        };
      }
    }
    return null;
  }

  // Pinterest
  if (host === "pinterest.com" || /^pinterest\.[a-z]{2,3}$/.test(host)) {
    const blocked = new Set(["pin", "ideas", "today", "categories", "business", "_"]);
    if (blocked.has(s0Low) || !/^[a-zA-Z0-9._-]{2,40}$/.test(s0)) return null;
    return {
      platform: "pinterest",
      canonicalUrl: `https://www.pinterest.com/${s0}`,
      handle: `@${s0}`,
    };
  }

  // Reddit
  if (host === "reddit.com") {
    if ((s0Low === "r" || s0Low === "u" || s0Low === "user") && segs[1]) {
      const prefix = s0Low === "r" ? "r" : "u";
      return {
        platform: "reddit",
        canonicalUrl: `https://www.reddit.com/${prefix}/${segs[1]}`,
        handle: `${prefix}/${segs[1]}`,
      };
    }
    return null;
  }

  // Discord
  if (host === "discord.gg" || host === "discord.com") {
    if (host === "discord.gg" && /^[a-zA-Z0-9-]{2,32}$/.test(s0)) {
      return {
        platform: "discord",
        canonicalUrl: `https://discord.gg/${s0}`,
        handle: `discord.gg/${s0}`,
      };
    }
    if (host === "discord.com" && s0Low === "invite" && segs[1]) {
      return {
        platform: "discord",
        canonicalUrl: `https://discord.com/invite/${segs[1]}`,
        handle: `invite/${segs[1]}`,
      };
    }
    return null;
  }

  // Telegram
  if (host === "t.me" || host === "telegram.me") {
    if (s0Low === "s" && segs[1]) {
      return {
        platform: "telegram",
        canonicalUrl: `https://t.me/${segs[1]}`,
        handle: `@${segs[1]}`,
      };
    }
    if (!/^[a-zA-Z0-9_+]{3,48}$/.test(s0)) return null;
    return {
      platform: "telegram",
      canonicalUrl: `https://t.me/${s0}`,
      handle: `@${s0}`,
    };
  }

  // WhatsApp
  if (host === "wa.me" || host === "whatsapp.com" || host === "chat.whatsapp.com") {
    if (s0Low === "channel" && segs[1]) {
      return {
        platform: "whatsapp",
        canonicalUrl: `https://whatsapp.com/channel/${segs[1]}`,
        handle: `channel/${segs[1].slice(0, 14)}`,
      };
    }
    if (host === "wa.me" && /^\d{7,15}$/.test(s0)) {
      return {
        platform: "whatsapp",
        canonicalUrl: `https://wa.me/${s0}`,
        handle: `+${s0}`,
      };
    }
    return null;
  }

  // Snapchat
  if (host === "snapchat.com") {
    if (s0Low === "add" && segs[1]) {
      return {
        platform: "snapchat",
        canonicalUrl: `https://www.snapchat.com/add/${segs[1]}`,
        handle: `@${segs[1]}`,
      };
    }
    return null;
  }

  // Medium
  if (host === "medium.com") {
    if (s0.startsWith("@") && s0.length > 2) {
      return {
        platform: "medium",
        canonicalUrl: `https://medium.com/${s0}`,
        handle: s0,
      };
    }
    const blocked = new Set(["tag", "topics", "topic", "plans", "membership", "m", "p", "me", "new-story"]);
    if (!blocked.has(s0Low) && /^[a-zA-Z0-9._-]{2,50}$/.test(s0) && segs.length === 1) {
      return {
        platform: "medium",
        canonicalUrl: `https://medium.com/${s0}`,
        handle: `@${s0}`,
      };
    }
    return null;
  }

  // Mastodon (well-known instances + /@user pattern)
  const mastodonHosts = new Set([
    "mastodon.social",
    "mastodon.online",
    "fosstodon.org",
    "hachyderm.io",
    "infosec.exchange",
    "mstdn.social",
    "mas.to",
    "techhub.social",
    "mastodon.world",
  ]);
  if (mastodonHosts.has(host) && s0.startsWith("@") && s0.length > 2) {
    return {
      platform: "mastodon",
      canonicalUrl: `https://${host}/${s0}`,
      handle: `${s0}@${host}`,
    };
  }

  return null;
}

/** Maps an extended platform to one of our 6 core indexed SocialPlatform values when applicable. */
export function toCoreSocialPlatform(
  platform: ExtendedSocialPlatform
): SocialPlatform | null {
  switch (platform) {
    case "instagram":
      return "instagram";
    case "twitter":
      return "x";
    case "linkedin":
      return "linkedin";
    case "tiktok":
      return "tiktok";
    case "github":
      return "github";
    case "youtube":
      return "youtube";
    default:
      return null;
  }
}

/** Extracts raw sameAs strings recursively from parsed Schema.org JSON-LD blocks. */
function collectJsonLdSameAs(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdSameAs(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if ("sameAs" in obj) {
    const val = obj.sameAs;
    if (typeof val === "string") out.push(val);
    else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") out.push(item);
      }
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k !== "sameAs" && v && typeof v === "object") {
      collectJsonLdSameAs(v, out);
    }
  }
}

/** Extracts contact/about same-origin links for fallback crawling when homepage has 0 profiles. */
function findExtraPages(html: string, baseUrl: string, maxPages: number): string[] {
  if (maxPages <= 0) return [];
  const base = new URL(baseUrl);
  const found: string[] = [];
  const seen = new Set<string>([base.pathname.replace(/\/+$/, "") || "/"]);
  const linkRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  const keywordRe = /^\/?(about|about-us|contact|contact-us|connect|social|links|team|company|press|info|follow)(\/|$)/i;

  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1].trim(), base);
      if (resolved.hostname !== base.hostname) continue;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      const normPath = resolved.pathname.replace(/\/+$/, "") || "/";
      if (seen.has(normPath)) continue;
      if (keywordRe.test(resolved.pathname)) {
        seen.add(normPath);
        found.push(resolved.origin + resolved.pathname);
        if (found.length >= maxPages) break;
      }
    } catch {
      // skip invalid relative link
    }
  }
  return found;
}

const SOCIAL_SCRIPT_URL_RE =
  /https?:\\?\/\\?\/(?:www\.|m\.)?(?:instagram\.com|x\.com|twitter\.com|linkedin\.com|tiktok\.com|youtube\.com|github\.com|facebook\.com|fb\.com|threads\.net|threads\.com|pinterest\.com|reddit\.com|discord\.gg|discord\.com|t\.me|telegram\.me|wa\.me|whatsapp\.com|snapchat\.com|medium\.com|mastodon\.social|mastodon\.online|fosstodon\.org|hachyderm\.io|infosec\.exchange|mstdn\.social|mas\.to|techhub\.social)\/[a-zA-Z0-9_@.%/?=&+-]{2,120}/gi;

async function fetchPublicHtml(
  targetUrl: string
): Promise<{ html: string | null; status: number | null; finalUrl: string; error: string | null }> {
  let current = targetUrl;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(current);
    if (await isPrivateTarget(parsed.hostname)) {
      return {
        html: null,
        status: null,
        finalUrl: current,
        error: "Blocked private or reserved network target.",
      };
    }

    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VeriLensProfileFinder/1.0; +https://verilens.local)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { html: null, status: res.status, finalUrl: current, error: `Redirect without location (HTTP ${res.status})` };
      }
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) {
      return {
        html: null,
        status: res.status,
        finalUrl: current,
        error: `The website answered with HTTP ${res.status}`,
      };
    }

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype && !ctype.includes("text/html") && !ctype.includes("xhtml") && !ctype.includes("text/plain")) {
      return {
        html: null,
        status: res.status,
        finalUrl: current,
        error: "Response was not an HTML page.",
      };
    }

    // Read capped body up to MAX_RESPONSE_BYTES
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { html: text.slice(0, MAX_RESPONSE_BYTES), status: res.status, finalUrl: current, error: null };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const remaining = MAX_RESPONSE_BYTES - total;
        if (remaining <= 0) break;
        chunks.push(value.byteLength > remaining ? value.subarray(0, remaining) : value);
        total += value.byteLength;
        if (total >= MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    }
    const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { html: combined.toString("utf8"), status: res.status, finalUrl: current, error: null };
  }
  return { html: null, status: null, finalUrl: current, error: "Too many redirects." };
}

function extractCandidatesFromHtml(
  html: string,
  bucket: Map<string, { platform: ExtendedSocialPlatform; url: string; handle: string; sources: Set<DiscoverySource> }>
): void {
  const record = (raw: string, source: DiscoverySource) => {
    const parsed = parseExtendedSocialUrl(raw);
    if (!parsed) return;
    const key = `${parsed.platform}:${parsed.canonicalUrl.toLowerCase()}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.sources.add(source);
    } else {
      bucket.set(key, {
        platform: parsed.platform,
        url: parsed.canonicalUrl,
        handle: parsed.handle,
        sources: new Set([source]),
      });
    }
  };

  // 1. Schema.org JSON-LD `sameAs`
  const ldRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const sameAs: string[] = [];
      collectJsonLdSameAs(parsed, sameAs);
      for (const link of sameAs) record(link, "jsonLd");
    } catch {
      // Ignore malformed JSON-LD block
    }
  }

  // 2. HTML anchor `<a href="...">` and `<link rel="me" href="...">`
  const anchorRe = /<(?:a|link)\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1].trim();
    if (href.startsWith("http") || href.startsWith("//")) {
      record(href, "anchor");
    }
  }

  // 3. Inline script / theme config fallback (for Shopify / JS-rendered social links)
  const foundDirect = bucket.size;
  if (foundDirect === 0) {
    let sm: RegExpExecArray | null;
    SOCIAL_SCRIPT_URL_RE.lastIndex = 0;
    while ((sm = SOCIAL_SCRIPT_URL_RE.exec(html)) !== null) {
      record(sm[0], "script");
    }
  }
}

function sourceRank(sources: DiscoverySource[]): number {
  let score = 0;
  if (sources.includes("jsonLd")) score += 100;
  if (sources.includes("anchor")) score += 20;
  if (sources.includes("script")) score += 5;
  return score;
}

/** Built-in real live HTML/JSON-LD scanner mirroring automation-lab/social-media-profile-finder. */
async function scanSingleSiteBuiltin(
  targetUrl: string,
  maxExtraPages: number
): Promise<WebsiteProfileScanItem> {
  const started = Date.now();
  const domain = new URL(targetUrl).hostname.replace(/^www\./, "");
  const profiles = emptyProfilesMap();
  const bucket = new Map<
    string,
    { platform: ExtendedSocialPlatform; url: string; handle: string; sources: Set<DiscoverySource> }
  >();
  const pagesScanned: string[] = [];

  try {
    const home = await fetchPublicHtml(targetUrl);
    if (home.error || home.html === null) {
      return {
        url: targetUrl,
        domain,
        profiles,
        allSocialLinks: [],
        profileCandidates: [],
        profileCount: 0,
        httpStatus: home.status,
        pagesScanned: home.status ? [home.finalUrl] : [],
        checkTimeMs: Math.max(1, Date.now() - started),
        error: home.error ?? "Site could not be fetched.",
        checkedAt: new Date().toISOString(),
      };
    }

    pagesScanned.push(home.finalUrl);
    extractCandidatesFromHtml(home.html, bucket);

    // Follow up to maxExtraPages same-site contact/about links when homepage showed no social profiles
    if (bucket.size === 0 && maxExtraPages > 0) {
      const extras = findExtraPages(home.html, home.finalUrl, maxExtraPages);
      for (const extraUrl of extras) {
        try {
          const sub = await fetchPublicHtml(extraUrl);
          if (sub.html) {
            pagesScanned.push(sub.finalUrl);
            extractCandidatesFromHtml(sub.html, bucket);
          }
        } catch {
          // keep continuing other fallback pages
        }
      }
    }

    // Rank jsonLd declarations ahead of anchors ahead of inline script URLs
    const orderedSources = (s: Set<DiscoverySource>): DiscoverySource[] => {
      const arr: DiscoverySource[] = [];
      if (s.has("jsonLd")) arr.push("jsonLd");
      if (s.has("anchor")) arr.push("anchor");
      if (s.has("script")) arr.push("script");
      return arr;
    };

    const sorted = Array.from(bucket.values())
      .map((entry) => ({
        ...entry,
        sourceList: orderedSources(entry.sources),
      }))
      .sort((a, b) => sourceRank(b.sourceList) - sourceRank(a.sourceList));

    const candidates: ProfileCandidateDTO[] = [];
    for (const entry of sorted) {
      const selected = profiles[entry.platform] === null;
      if (selected) {
        profiles[entry.platform] = entry.url;
      }
      candidates.push({
        platform: entry.platform,
        url: entry.url,
        handle: entry.handle,
        sources: entry.sourceList,
        selected,
      });
    }

    const profileCount = Object.values(profiles).filter(Boolean).length;

    return {
      url: home.finalUrl.replace(/\/$/, ""),
      domain,
      profiles,
      allSocialLinks: candidates.map((c) => c.url),
      profileCandidates: candidates,
      profileCount,
      httpStatus: home.status,
      pagesScanned,
      checkTimeMs: Math.max(1, Date.now() - started),
      error: null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      url: targetUrl,
      domain,
      profiles,
      allSocialLinks: [],
      profileCandidates: [],
      profileCount: 0,
      httpStatus: null,
      pagesScanned,
      checkTimeMs: Math.max(1, Date.now() - started),
      error:
        err instanceof Error && err.name === "TimeoutError"
          ? "Request timed out while reading the website."
          : err instanceof Error
            ? err.message.slice(0, 140)
            : "Could not reach this website.",
      checkedAt: new Date().toISOString(),
    };
  }
}

/** Normalizes a raw Apify `automation-lab/social-media-profile-finder` dataset item to our DTO. */
function normalizeApifyItem(raw: Record<string, unknown>): WebsiteProfileScanItem {
  const url = String(raw.url ?? "");
  let domain = url;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // keep raw url
  }

  const profiles = emptyProfilesMap();
  const rawProfiles = (raw.profiles && typeof raw.profiles === "object"
    ? raw.profiles
    : {}) as Record<string, unknown>;

  for (const key of ALL_EXTENDED_PLATFORMS) {
    const val = rawProfiles[key];
    if (typeof val === "string" && val.trim()) {
      profiles[key] = val.trim();
    }
  }

  const rawCandidates = Array.isArray(raw.profileCandidates)
    ? (raw.profileCandidates as Array<Record<string, unknown>>)
    : [];

  const candidates: ProfileCandidateDTO[] = [];
  for (const c of rawCandidates) {
    const plat = String(c.platform ?? "").toLowerCase() as ExtendedSocialPlatform;
    const link = typeof c.url === "string" ? c.url.trim() : "";
    if (!link || !ALL_EXTENDED_PLATFORMS.includes(plat)) continue;
    const parsed = parseExtendedSocialUrl(link);
    const sourcesRaw = Array.isArray(c.sources) ? c.sources : ["anchor"];
    const sources = sourcesRaw
      .map((s) => String(s))
      .filter((s): s is DiscoverySource => s === "jsonLd" || s === "anchor" || s === "script");
    candidates.push({
      platform: plat,
      url: link,
      handle: parsed?.handle ?? link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 42),
      sources: sources.length > 0 ? sources : ["anchor"],
      selected: Boolean(c.selected ?? profiles[plat] === link),
    });
  }

  // Fallback build candidates from profiles map if older payload omitted profileCandidates
  if (candidates.length === 0) {
    for (const key of ALL_EXTENDED_PLATFORMS) {
      const link = profiles[key];
      if (!link) continue;
      const parsed = parseExtendedSocialUrl(link);
      candidates.push({
        platform: key,
        url: link,
        handle: parsed?.handle ?? link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 42),
        sources: ["anchor"],
        selected: true,
      });
    }
  }

  const allSocialLinks = Array.isArray(raw.allSocialLinks)
    ? (raw.allSocialLinks as unknown[]).filter((x): x is string => typeof x === "string")
    : candidates.map((c) => c.url);

  const pagesScanned = Array.isArray(raw.pagesScanned)
    ? (raw.pagesScanned as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  return {
    url,
    domain,
    profiles,
    allSocialLinks,
    profileCandidates: candidates,
    profileCount:
      typeof raw.profileCount === "number"
        ? raw.profileCount
        : Object.values(profiles).filter(Boolean).length,
    httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null,
    pagesScanned,
    checkTimeMs: typeof raw.checkTimeMs === "number" ? raw.checkTimeMs : 0,
    error: typeof raw.error === "string" ? raw.error : null,
    checkedAt:
      typeof raw.checkedAt === "string" ? raw.checkedAt : new Date().toISOString(),
  };
}

/** Calls the Apify Actor in Standby Server mode (`POST $SERVER_URL/profiles`, no start fee). */
async function callApifyServer(
  serverUrl: string,
  token: string,
  urls: string[]
): Promise<WebsiteProfileScanItem[]> {
  const res = await fetch(`${serverUrl}/profiles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ urls: urls.slice(0, 10) }),
    signal: AbortSignal.timeout(26_000),
  });

  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    results?: Array<Record<string, unknown>>;
    error?: { code?: string; message?: string };
  } | null;

  if (!res.ok || !data?.ok || !Array.isArray(data.results)) {
    const code = data?.error?.code ? `[${data.error.code}] ` : "";
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Apify Server error: ${code}${msg}`);
  }

  return data.results.map(normalizeApifyItem);
}

/**
 * Runs the official Apify HTTP API (`automation-lab~social-media-profile-finder`)
 * using `POST /v2/actors/automation-lab~social-media-profile-finder/runs?waitForFinish=45`
 * and retrieves the resulting items from the run's `defaultDatasetId`.
 */
async function callApifyActorSync(
  token: string,
  urls: string[],
  maxExtraPages: number
): Promise<WebsiteProfileScanItem[]> {
  const runEndpoint =
    `${APIFY_API_BASE}/actors/${APIFY_ACTOR_API_SLUG}/runs` +
    `?waitForFinish=${APIFY_RUN_TIMEOUT_SEC}`;

  const res = await fetch(runEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      urls,
      maxExtraPages: Math.max(0, Math.min(5, maxExtraPages)),
    }),
    signal: AbortSignal.timeout((APIFY_RUN_TIMEOUT_SEC + 12) * 1000),
  });

  const payload = (await res.json().catch(() => null)) as {
    data?: { id?: string; status?: string; defaultDatasetId?: string };
    error?: { message?: string };
  } | null;

  if (!res.ok || !payload?.data?.defaultDatasetId) {
    const msg =
      payload?.error?.message || `Apify Actor returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  let status = payload.data.status ?? "";
  const runId = payload.data.id;
  const datasetId = payload.data.defaultDatasetId;

  // Poll briefly if the Actor run is still finishing past waitForFinish
  const deadline = Date.now() + 20_000;
  while ((status === "RUNNING" || status === "READY") && runId && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const pd = (await poll.json().catch(() => null)) as { data?: { status?: string } } | null;
    status = pd?.data?.status ?? "FAILED";
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify Actor run ended with status ${status || "UNKNOWN"}.`);
  }

  const dsRes = await fetch(
    `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    }
  );
  const items = await dsRes.json().catch(() => null);
  if (!dsRes.ok || !Array.isArray(items)) {
    throw new Error(`Could not read Apify dataset items (HTTP ${dsRes.status}).`);
  }

  return (items as Array<Record<string, unknown>>).map(normalizeApifyItem);
}

/**
 * Scans 1–10 public websites for all linked social media profiles across 16 platforms.
 * Automatically uses `automation-lab/social-media-profile-finder` via Apify when
 * `APIFY_API_TOKEN` is present (preferring Standby Server URL if configured), and
 * runs the built-in live HTML/JSON-LD scanner when no token is configured (or on fallback).
 */
export async function scanWebsiteProfiles(options: {
  rawUrls: string[];
  maxExtraPages?: number;
  forceBuiltin?: boolean;
}): Promise<WebsiteProfileScanResponse> {
  const started = Date.now();
  const maxExtraPages = Math.max(0, Math.min(5, options.maxExtraPages ?? 2));

  // Deduplicate and normalize public URLs (max 10 per request)
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of options.rawUrls) {
    const norm = normalizeWebsiteUrl(raw);
    if (!norm) continue;
    const key = norm.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(norm);
    if (urls.length >= 10) break;
  }

  if (urls.length === 0) {
    throw new Error("Enter at least one valid website domain or URL (for example: apify.com, stripe.com).");
  }

  const token = options.forceBuiltin ? undefined : getApifyToken();
  const serverUrl = getApifyServerUrl();

  let engine: WebsiteProfileScanResponse["engine"] = "builtin_live";
  let results: WebsiteProfileScanItem[] = [];
  let fallbackNote: string | undefined;

  if (token) {
    try {
      if (serverUrl) {
        results = await callApifyServer(serverUrl, token, urls);
        engine = "apify_server";
      } else {
        results = await callApifyActorSync(token, urls, maxExtraPages);
        engine = "apify_actor";
      }
    } catch (err) {
      fallbackNote = `${
        err instanceof Error ? err.message : "Apify Actor call failed"
      } — completed with built-in live HTML/JSON-LD scanner instead.`;
      results = await Promise.all(
        urls.map((u) => scanSingleSiteBuiltin(u, maxExtraPages))
      );
      engine = "builtin_live";
    }
  } else {
    results = await Promise.all(
      urls.map((u) => scanSingleSiteBuiltin(u, maxExtraPages))
    );
    engine = "builtin_live";
  }

  const totalProfilesFound = results.reduce((acc, r) => acc + r.profileCount, 0);
  const estimatedCostUsd =
    engine === "apify_server"
      ? estimateApifyCost(results.length, true)
      : engine === "apify_actor"
        ? estimateApifyCost(results.length, false)
        : 0;

  return {
    actorId: APIFY_ACTOR_ID,
    engine,
    fallbackNote,
    estimatedCostUsd,
    totalUrls: urls.length,
    totalProfilesFound,
    durationMs: Math.max(1, Date.now() - started),
    results,
  };
}
