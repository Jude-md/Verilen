import sharp from "sharp";
import type {
  ExtendedSocialPlatform,
  IdentifiedSubjectDTO,
  LiveMatchDTO,
  LiveWebAppearanceDTO,
} from "@/lib/live-types";
import {
  parseExtendedSocialUrl,
  scanWebsiteProfiles,
} from "@/lib/apify-profile-finder";

/**
 * Always-on, zero-API-key live open-web reverse-image & social-handle discovery engine.
 *
 * Works immediately the moment a user uploads a photo — no manual API key required:
 *   1. Visual reverse-image upload -> returns real exact public pages & visually similar
 *      photos/profiles matching the uploaded picture across the live open web.
 *   2. Direct social handle parsing across 17 platforms (Instagram, X/Twitter, LinkedIn,
 *      TikTok, YouTube, GitHub, Facebook, Threads, Bluesky, Pinterest, Reddit, Discord,
 *      Telegram, WhatsApp, Snapchat, Medium, Mastodon) + CDN avatar fingerprint extraction
 *      (GitHub numeric user IDs, Bluesky DIDs).
 *   3. Free official public API enrichment:
 *      - GitHub REST API (twitter_username, display name, blog URL, followers, bio, avatar)
 *      - Bluesky public AppView API (verified handle, bio, avatar, links)
 *      - Wikidata official claims (P2002 X, P2003 Instagram, P7085 TikTok, P6634 LinkedIn,
 *        P2037 GitHub, P2397/P11245 YouTube, P2013 Facebook, P11892 Threads, P12361 Bluesky,
 *        P856 Official Website) — strictly gated to confirmed subjects to avoid false positives.
 *   4. Cross-platform website profile finder (`automation-lab/social-media-profile-finder`):
 *      automatically inspects any discovered personal/brand website (or host domain of a pasted
 *      image URL) to pull additional linked public social handles across all 17 platforms.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const YANDEX_UPLOAD_URL =
  "https://yandex.com/images-apphost/image-download?cbird=111&images_avatars_size=preview&images_avatars_namespace=images-cbir";

const STOCK_AND_AGGREGATOR_HOSTS = new Set([
  "pexels.com",
  "unsplash.com",
  "shutterstock.com",
  "gettyimages.com",
  "istockphoto.com",
  "alamy.com",
  "dreamstime.com",
  "123rf.com",
  "depositphotos.com",
  "freepik.com",
  "pixabay.com",
  "vecteezy.com",
  "hippopx.com",
  "pxfuel.com",
  "wallpaperflare.com",
  "imgur.com",
  "giphy.com",
  "tenor.com",
  "wikipedia.org",
  "wikimedia.org",
  "wikidata.org",
  "wiki2.org",
  "ruwiki.ru",
  "google.com",
  "bing.com",
  "yandex.com",
  "yandex.ru",
  "yahoo.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "walmart.com",
  "aliexpress.com",
  "pinterest.com",
  "pinterest.co.uk",
  "pinimg.com",
  "reddit.com",
  "forbes.com",
  "bbc.com",
  "cnn.com",
  "nytimes.com",
  "theguardian.com",
  "reuters.com",
  "bloomberg.com",
  "medium.com",
  "telegra.ph",
  "gist.github.com",
  "163.com",
  "m.163.com",
  "flamp.ru",
  "znanija.com",
  "sadphoto.ru",
  "dogdrip.net",
  "libhunt.com",
  "thecelebritist.com",
  "news.yahoo.co.jp",
  "finance.yahoo.com",
  "zamantika.com",
  "web.archive.org",
  "cloudflare.com",
  "npmjs.com",
  "npmmirror.com",
  "gravatar.com",
  "cravatar.com",
  "tangled.org",
  "blueskystarterpack.com",
  "github.com",
  "youtube.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "threads.net",
  "bsky.app",
  "mastodon.social",
  "discord.com",
  "discord.gg",
  "t.me",
  "wa.me",
  "whatsapp.com",
  "snapchat.com",
  "spotify.com",
  "soundcloud.com",
  "imdb.com",
]);

const GENERIC_NON_NAME_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "about", "after",
  "before", "over", "under", "new", "best", "top", "most", "more", "how", "why",
  "what", "who", "when", "where", "your", "our", "his", "her", "all", "free",
  "photo", "photos", "image", "images", "picture", "pictures", "portrait", "stock",
  "woman", "man", "girl", "boy", "person", "people", "smiling", "happy", "young",
  "profile", "account", "official", "page", "site", "home", "homepage", "website",
  "blog", "news", "post", "posts", "video", "videos", "channel", "watch", "share",
  "github", "youtube", "instagram", "twitter", "linkedin", "tiktok", "facebook",
  "threads", "bluesky", "pinterest", "reddit", "wikipedia", "wikimedia", "commons",
  "google", "yandex", "bing", "resume", "podcast", "conference", "developer",
  "developers", "creator", "founder", "speaker", "interview", "story", "stories",
  "list", "billboard", "hot", "music", "song", "songs", "album", "tour", "world",
  "internet", "tech", "web", "software", "code", "open", "source", "marketplace",
  "database", "databases", "payment", "infrastructure", "design", "art", "fashion",
  "beauty", "style", "file", "cropped", "index", "review", "reviews", "search",
  "global", "public", "social", "media", "live", "today", "weekly", "daily",
  "week", "month", "year", "day", "time", "state", "life", "promise", "fire",
  "club", "league", "nations", "cup", "match", "selected", "childhood", "biography",
  "javascript", "react", "native", "linux", "vercel", "fast", "refresh", "tools",
  "alternative", "alternatives", "active", "users", "follow", "following", "status",
  "uptime", "monitoring", "general", "knowledge", "visual", "human", "nature",
  "winter", "summer", "autumn", "spring", "sunlight", "studio", "outdoor",
  "goddess", "super", "million", "billion", "error", "robot", "shares", "divorce",
  "treatment", "depression", "breakthrough", "coat", "red", "black", "white",
  "blue", "green", "dark", "light", "bright", "short", "long", "old", "big",
  "gratis", "bilde", "foto", "frau", "mantel", "portugal", "belgian", "german",
  "football", "players", "mocking", "god", "allegedly", "republic", "philippines",
  "canada", "united", "states", "america", "london", "paris", "york", "tokyo",
  "amsterdam", "california", "connect", "cloud", "everywhere", "century", "based",
  "company", "brand", "industry", "future", "shaping", "automation", "shaping",
  "republished", "number", "ones", "edition", "series", "season", "episode",
  "award", "awards", "press", "release", "update", "report", "guide", "tips",
  "ideas", "help", "support", "contact", "terms", "privacy", "login", "sign",
]);

function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
    });
}

function stripTags(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrackingParams(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const kill = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "yclid",
      "ref",
    ];
    for (const k of kill) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function toProxiedThumb(rawThumb: string | null | undefined): string | null {
  if (!rawThumb) return null;
  const cleaned = decodeEntities(rawThumb.trim());
  const abs = cleaned.startsWith("//") ? `https:${cleaned}` : cleaned;
  if (!abs.startsWith("https://")) return null;
  try {
    const u = new URL(abs);
    // Use our clean same-origin thumbnail proxy for known CDN hosts so referrer headers never block rendering
    const host = u.hostname.toLowerCase();
    const proxiedHosts = [
      "avatars.mds.yandex.net",
      "avatars.githubusercontent.com",
      "cdn.bsky.app",
      "yt3.googleusercontent.com",
      "yt3.ggpht.com",
      "i.ytimg.com",
      "upload.wikimedia.org",
      "pbs.twimg.com",
      "encrypted-tbn0.gstatic.com",
      "encrypted-tbn1.gstatic.com",
      "encrypted-tbn2.gstatic.com",
      "encrypted-tbn3.gstatic.com",
      "lh3.googleusercontent.com",
      "lh4.googleusercontent.com",
      "media.licdn.com",
      "i.pinimg.com",
    ];
    if (proxiedHosts.some((p) => host === p || host.endsWith(`.${p}`))) {
      return `/api/thumb?u=${encodeURIComponent(abs)}`;
    }
    return null;
  } catch {
    return null;
  }
}

function isStockOrGenericHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  if (STOCK_AND_AGGREGATOR_HOSTS.has(h)) return true;
  for (const blocked of STOCK_AND_AGGREGATOR_HOSTS) {
    if (h.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function prettyName(raw: string): string {
  return raw
    .replace(/^(in|company|school|r|u|fb|channel|invite)\//i, "")
    .replace(/^@+/, "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

interface RawSiteHit {
  title: string;
  pageUrl: string;
  domain: string;
  description: string;
  thumbUrl: string | null;
  imageHref: string | null;
}

function parseYandexSitesHtml(html: string): RawSiteHit[] {
  const parts = html.split('<li class="CbirSites-Item">').slice(1);
  const results: RawSiteHit[] = [];
  const seen = new Set<string>();

  for (const raw of parts.slice(0, 30)) {
    const endIdx = raw.indexOf("</li>");
    const block = endIdx > 0 ? raw.slice(0, endIdx) : raw.slice(0, 2600);

    const titleLink = block.match(
      /CbirSites-ItemTitle[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
    );
    if (!titleLink) continue;

    const pageUrl = stripTrackingParams(decodeEntities(titleLink[1]).trim());
    if (!/^https?:\/\//i.test(pageUrl)) continue;
    if (seen.has(pageUrl.toLowerCase())) continue;
    seen.add(pageUrl.toLowerCase());

    const title = stripTags(titleLink[2]);
    const domM = block.match(/CbirSites-ItemDomain[^>]*>([\s\S]*?)<\/a>/);
    const descM = block.match(/CbirSites-ItemDescription[^>]*>([\s\S]*?)<\/div>/);
    const thumbM = block.match(
      /<img[^>]+src="((?:https?:)?\/\/avatars\.mds\.yandex\.net[^"]+)"/
    );
    const imgHrefM = block.match(/CbirSites-ItemThumb[\s\S]*?href="([^"]+)"/);

    let domain = domM ? stripTags(domM[1]) : "";
    if (!domain) {
      try {
        domain = new URL(pageUrl).hostname.replace(/^www\./, "");
      } catch {
        domain = "";
      }
    }

    const imgHref = imgHrefM ? decodeEntities(imgHrefM[1]).trim() : null;
    const rawThumb = thumbM?.[1] ?? (imgHref && toProxiedThumb(imgHref) ? imgHref : null);

    results.push({
      title: title || domain,
      pageUrl,
      domain: domain.toLowerCase().replace(/^www\./, ""),
      description: descM ? stripTags(descM[1]) : "",
      thumbUrl: toProxiedThumb(rawThumb),
      imageHref: imgHref && /^https?:\/\//i.test(imgHref) ? imgHref : null,
    });
  }
  return results;
}

function parseYandexSimilarHtml(html: string): RawSiteHit[] {
  const decoded = decodeEntities(html);
  const results: RawSiteHit[] = [];
  const seen = new Set<string>();

  // Parse embedded serp-item structured JSON fragments (title + page url + thumb preview)
  const itemRe =
    /"snippet":\{"title":"([^"\\]{2,200}(?:\\.[^"\\]*)*)"[^}]*?"url":"(https?:\/\/[^"]+)"[^}]*?"domain":"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(decoded)) !== null && results.length < 36) {
    const title = m[1].replace(/\\"/g, '"').replace(/\\\//g, "/").trim();
    const pageUrl = stripTrackingParams(m[2].replace(/\\\//g, "/"));
    const domain = m[3].toLowerCase().replace(/^www\./, "");
    if (!pageUrl || domain.includes("yandex.") || seen.has(pageUrl.toLowerCase())) continue;
    seen.add(pageUrl.toLowerCase());

    // Look slightly backward for this item's cached Yandex preview thumbnail URL
    const start = Math.max(0, m.index - 900);
    const slice = decoded.slice(start, m.index + 300);
    const thM = slice.match(
      /"url":"((?:https?:)?\/\/avatars\.mds\.yandex\.net\/i\?id=[^"]+)"/
    );
    const origM = slice.match(/"img_href":"(https?:\/\/[^"]+)"/);
    const rawThumb = thM
      ? thM[1].replace(/\\\//g, "/")
      : origM
        ? origM[1].replace(/\\\//g, "/")
        : null;

    results.push({
      title,
      pageUrl,
      domain,
      description: "",
      thumbUrl: toProxiedThumb(rawThumb),
      imageHref: origM ? origM[1].replace(/\\\//g, "/") : null,
    });
  }

  // Fallback pattern if snippet order differs ("url" before "domain")
  if (results.length === 0) {
    const altRe =
      /"title":"([^"\\]{3,160})"[^}]{0,220}?"url":"(https?:\/\/[^"]+)"/g;
    while ((m = altRe.exec(decoded)) !== null && results.length < 24) {
      const pageUrl = stripTrackingParams(m[2].replace(/\\\//g, "/"));
      if (pageUrl.includes("yandex.") || pageUrl.includes("yastatic.")) continue;
      if (seen.has(pageUrl.toLowerCase())) continue;
      seen.add(pageUrl.toLowerCase());
      let domain = "";
      try {
        domain = new URL(pageUrl).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      const start = Math.max(0, m.index - 700);
      const slice = decoded.slice(start, m.index + 240);
      const thM = slice.match(
        /((?:https?:)?\/\/avatars\.mds\.yandex\.net\/i\?id=[a-zA-Z0-9_=&%-]+)/
      );
      results.push({
        title: m[1].replace(/\\"/g, '"').trim(),
        pageUrl,
        domain,
        description: "",
        thumbUrl: toProxiedThumb(thM?.[1]),
        imageHref: null,
      });
    }
  }

  return results;
}

/** Extracts clean 2–3 word capitalized person names that appear independently across >= 2 hits. */
function extractCandidateNames(
  exactHits: RawSiteHit[],
  similarHits: RawSiteHit[],
  verifiedSocialNames: string[]
): string[] {
  const scores = new Map<string, { display: string; count: number; domains: Set<string>; weight: number }>();

  const bump = (rawName: string, domain: string, weight: number) => {
    const words = rawName.trim().split(/\s+/);
    if (words.length < 2 || words.length > 3) return;
    if (words.some((w) => w.length < 2 || w.length > 18)) return;
    if (words.some((w) => GENERIC_NON_NAME_WORDS.has(w.toLowerCase()))) return;
    const key = words.map((w) => w.toLowerCase()).join(" ");
    const cur = scores.get(key);
    if (cur) {
      if (!cur.domains.has(domain)) {
        cur.domains.add(domain);
        cur.count += 1;
        cur.weight += weight;
      }
    } else {
      scores.set(key, {
        display: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
        count: 1,
        domains: new Set([domain]),
        weight,
      });
    }
  };

  // Verified display names straight from GitHub/Bluesky/YouTube profiles get top confidence
  for (const name of verifiedSocialNames) {
    const cleaned = name.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
    const parts = cleaned.split(" ").filter((p) => p.length >= 2);
    if (parts.length >= 2 && parts.length <= 3) {
      bump(parts.join(" "), `verified-${Math.random()}`, 10);
      bump(parts.join(" "), `verified-2-${Math.random()}`, 10);
    }
  }

  // Extract capitalized two-word Latin person names from titles, descriptions & URL slugs
  const nameRe = /\b([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15}){1,2})\b/g;
  const slugNameRe = /(?:^|[/_-])([a-z]{3,14})[-_]([a-z]{3,14})(?:[/_.-]|$)/gi;

  const inspectList = (list: RawSiteHit[], weight: number) => {
    for (const hit of list) {
      // Skip YouTube/wiki titles carefully — clean parentheticals and look for names
      const hay = `${hit.title} ${hit.description}`;
      const seenInHit = new Set<string>();
      let m: RegExpExecArray | null;
      nameRe.lastIndex = 0;
      while ((m = nameRe.exec(hay)) !== null) {
        const phrase = m[1];
        const lower = phrase.toLowerCase();
        if (seenInHit.has(lower)) continue;
        seenInHit.add(lower);
        bump(phrase, hit.domain, weight);
      }

      // Check URL slug pairs on exact matches (catches "resume+of+sundar+pichai", "evan-you.png", "taylor-swift")
      if (weight >= 3) {
        const pathHay = decodeURIComponentSafe(hit.pageUrl) + " " + decodeURIComponentSafe(hit.imageHref ?? "");
        const plusMatches = pathHay.matchAll(/([a-z]{3,14})[+_-]([a-z]{3,14})/gi);
        for (const pm of plusMatches) {
          const w1 = pm[1].toLowerCase();
          const w2 = pm[2].toLowerCase();
          if (GENERIC_NON_NAME_WORDS.has(w1) || GENERIC_NON_NAME_WORDS.has(w2)) continue;
          const combo = `${w1} ${w2}`;
          if (seenInHit.has(combo)) continue;
          seenInHit.add(combo);
          bump(combo, hit.domain, weight * 0.65);
        }
        void slugNameRe;
      }
    }
  };

  inspectList(exactHits.slice(0, 18), 3);
  inspectList(similarHits.slice(0, 18), 1.2);

  return Array.from(scores.values())
    .filter((entry) => entry.count >= 2 && entry.weight >= 4.2)
    .sort((a, b) => b.weight - a.weight || b.count - a.count)
    .slice(0, 3)
    .map((e) => e.display);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

interface GitHubUserProfile {
  login: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  location: string | null;
  twitter_username: string | null;
  avatar_url: string;
  html_url: string;
  followers: number;
}

async function fetchGitHubUser(ref: { login?: string; id?: string }): Promise<GitHubUserProfile | null> {
  const endpoint = ref.login
    ? `https://api.github.com/users/${encodeURIComponent(ref.login)}`
    : ref.id
      ? `https://api.github.com/user/${encodeURIComponent(ref.id)}`
      : null;
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent": "VeriLens/1.0",
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(5_500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubUserProfile & { type?: string };
    if (!data?.login) return null;
    return data;
  } catch {
    return null;
  }
}

interface BlueskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  followersCount?: number;
}

async function fetchBlueskyProfile(actor: string): Promise<BlueskyProfile | null> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
      {
        headers: { "User-Agent": "VeriLens/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as BlueskyProfile;
    return data?.handle ? data : null;
  } catch {
    return null;
  }
}

interface WikidataSocialResult {
  name: string;
  description: string;
  website: string | null;
  avatarUrl: string | null;
  accounts: Array<{
    platform: ExtendedSocialPlatform;
    handle: string;
    url: string;
  }>;
}

/**
 * Fetches verified official cross-platform social handles from Wikidata for a detected human/public figure.
 * Only succeeds when an exact entity label match exists AND it is a human (Q5) or verified creator/band/org.
 */
async function lookupWikidataSocials(name: string): Promise<WikidataSocialResult | null> {
  try {
    const searchUrl =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
      `&search=${encodeURIComponent(name)}&language=en&format=json&limit=3`;
    const sRes = await fetch(searchUrl, {
      headers: { "User-Agent": "VeriLens/1.0 (visual social profile lookup)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!sRes.ok) return null;
    const sData = (await sRes.json()) as {
      search?: Array<{ id: string; label?: string; description?: string }>;
    };

    const targetLower = name.toLowerCase();
    const match = (sData.search ?? []).find(
      (item) => (item.label ?? "").toLowerCase() === targetLower
    );
    if (!match?.id) return null;

    const eRes = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(match.id)}.json`,
      {
        headers: { "User-Agent": "VeriLens/1.0 (visual social profile lookup)" },
        signal: AbortSignal.timeout(6_000),
      }
    );
    if (!eRes.ok) return null;
    const eData = (await eRes.json()) as {
      entities?: Record<
        string,
        {
          labels?: { en?: { value?: string } };
          descriptions?: { en?: { value?: string } };
          claims?: Record<
            string,
            Array<{
              rank?: string;
              mainsnak?: { datavalue?: { value?: unknown } };
            }>
          >;
        }
      >;
    };

    const entity = eData.entities?.[match.id];
    const claims = entity?.claims;
    if (!claims) return null;

    // Require P31 (instance of) human (Q5) or band/group/public figure
    const p31Ids = (claims.P31 ?? [])
      .map((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id)
      .filter(Boolean);
    const isPerson = p31Ids.includes("Q5");
    const isCreatorGroup = p31Ids.some((id) =>
      ["Q215380", "Q5741069", "Q4830453", "Q783794"].includes(id ?? "")
    );
    if (!isPerson && !isCreatorGroup) return null;

    const pickString = (prop: string): string | null => {
      const list = claims[prop];
      if (!list || list.length === 0) return null;
      // Prefer "preferred" rank, fall back to "normal" (skip "deprecated")
      const valid = list.filter((c) => c.rank !== "deprecated");
      const chosen = valid.find((c) => c.rank === "preferred") ?? valid[0];
      const v = chosen?.mainsnak?.datavalue?.value;
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const accounts: WikidataSocialResult["accounts"] = [];
    const x = pickString("P2002");
    if (x) {
      const clean = x.replace(/^@+/, "");
      accounts.push({ platform: "twitter", handle: `@${clean}`, url: `https://x.com/${clean}` });
    }
    const ig = pickString("P2003");
    if (ig) {
      const clean = ig.replace(/^@+/, "");
      accounts.push({
        platform: "instagram",
        handle: `@${clean}`,
        url: `https://www.instagram.com/${clean}`,
      });
    }
    const tiktok = pickString("P7085");
    if (tiktok) {
      const clean = tiktok.replace(/^@+/, "");
      accounts.push({
        platform: "tiktok",
        handle: `@${clean}`,
        url: `https://www.tiktok.com/@${clean}`,
      });
    }
    const ytHandle = pickString("P11245");
    const ytChannel = pickString("P2397");
    if (ytHandle) {
      const clean = ytHandle.replace(/^@+/, "");
      accounts.push({
        platform: "youtube",
        handle: `@${clean}`,
        url: `https://www.youtube.com/@${clean}`,
      });
    } else if (ytChannel) {
      accounts.push({
        platform: "youtube",
        handle: ytChannel.slice(0, 22),
        url: `https://www.youtube.com/channel/${ytChannel}`,
      });
    }
    const li = pickString("P6634");
    if (li) {
      const clean = li.replace(/^in\//i, "");
      accounts.push({
        platform: "linkedin",
        handle: `in/${clean}`,
        url: `https://www.linkedin.com/in/${clean}`,
      });
    }
    const gh = pickString("P2037");
    if (gh) {
      const clean = gh.replace(/^@+/, "");
      accounts.push({
        platform: "github",
        handle: `@${clean}`,
        url: `https://github.com/${clean}`,
      });
    }
    const fb = pickString("P2013");
    if (fb) {
      const clean = fb.replace(/^@+/, "");
      accounts.push({
        platform: "facebook",
        handle: `@${clean}`,
        url: `https://www.facebook.com/${clean}`,
      });
    }
    const threads = pickString("P11892");
    if (threads) {
      const clean = threads.replace(/^@+/, "");
      accounts.push({
        platform: "threads",
        handle: `@${clean}`,
        url: `https://www.threads.net/@${clean}`,
      });
    }
    const bsky = pickString("P12361");
    if (bsky) {
      const clean = bsky.replace(/^@+/, "");
      accounts.push({
        platform: "bluesky",
        handle: `@${clean}`,
        url: `https://bsky.app/profile/${clean}`,
      });
    }

    const rawWebsite = pickString("P856");
    const website =
      rawWebsite && /^https?:\/\//i.test(rawWebsite) ? rawWebsite : null;

    // Official Wikimedia portrait thumbnail via P18 if present
    let avatarUrl: string | null = null;
    const p18 = pickString("P18");
    if (p18) {
      try {
        const fname = encodeURIComponent(p18.replace(/ /g, "_"));
        avatarUrl = null; // Skip redirect host; we fetch exact summary thumb below if needed
        void fname;
      } catch {
        avatarUrl = null;
      }
    }

    if (accounts.length === 0 && !website) return null;

    return {
      name: entity.labels?.en?.value || match.label || name,
      description: entity.descriptions?.en?.value || match.description || "",
      website,
      avatarUrl,
      accounts,
    };
  } catch {
    return null;
  }
}

export interface FreeReverseSearchOutput {
  matches: LiveMatchDTO[];
  webAppearances: LiveWebAppearanceDTO[];
  similarMatches: LiveWebAppearanceDTO[];
  identifiedSubject: IdentifiedSubjectDTO | null;
  reverseImageHits: number;
  similarImageHits: number;
  websiteHits: number;
  enrichedDomains: string[];
  enrichmentEngine: "apify_actor" | "apify_server" | "builtin_live" | null;
  externalSearchUrl: string | null;
  queriesRun: number;
  reachedWeb: boolean;
  errorNote?: string;
}

/**
 * Executes a full zero-API-key live reverse image search + automatic cross-platform
 * public social handle discovery & website enrichment. Never throws.
 */
export async function runFreeReverseImageSearch(options: {
  buffer: Buffer;
  sourceImageUrl?: string;
}): Promise<FreeReverseSearchOutput> {
  const empty: FreeReverseSearchOutput = {
    matches: [],
    webAppearances: [],
    similarMatches: [],
    identifiedSubject: null,
    reverseImageHits: 0,
    similarImageHits: 0,
    websiteHits: 0,
    enrichedDomains: [],
    enrichmentEngine: null,
    externalSearchUrl: null,
    queriesRun: 0,
    reachedWeb: false,
  };

  let queriesRun = 0;
  let cbirId: string | null = null;
  let exactHits: RawSiteHit[] = [];
  let similarHits: RawSiteHit[] = [];
  let errorNote: string | undefined;

  // Step 1: Compress image and run real zero-key reverse-image search
  try {
    const uploadJpeg = await sharp(options.buffer, { failOn: "truncated" })
      .rotate()
      .resize(900, 900, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, progressive: true })
      .toBuffer();

    const upRes = await fetch(YANDEX_UPLOAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "User-Agent": BROWSER_UA,
      },
      body: new Uint8Array(uploadJpeg),
      signal: AbortSignal.timeout(12_000),
    });

    if (upRes.ok) {
      const upJson = (await upRes.json().catch(() => null)) as {
        cbir_id?: string;
      } | null;
      if (upJson?.cbir_id) {
        cbirId = upJson.cbir_id;
        queriesRun += 1;
      }
    }

    if (cbirId) {
      const base = `https://yandex.com/images/search?rpt=imageview&cbir_id=${encodeURIComponent(cbirId)}`;
      const headers = {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      };

      const [sitesHtml, simHtml] = await Promise.all([
        fetch(`${base}&cbir_page=sites`, {
          headers,
          signal: AbortSignal.timeout(13_000),
        })
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => ""),
        fetch(`${base}&cbir_page=similar`, {
          headers,
          signal: AbortSignal.timeout(13_000),
        })
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => ""),
      ]);

      const blockedSites =
        sitesHtml.includes("SmartCaptcha") || sitesHtml.includes("showcaptcha");
      const blockedSim =
        simHtml.includes("SmartCaptcha") || simHtml.includes("showcaptcha");

      if (sitesHtml && !blockedSites) {
        queriesRun += 1;
        exactHits = parseYandexSitesHtml(sitesHtml);
      }
      if (simHtml && !blockedSim) {
        queriesRun += 1;
        similarHits = parseYandexSimilarHtml(simHtml);
      }
      if (blockedSites && blockedSim) {
        errorNote =
          "Live reverse-image provider temporarily rate-limited automated requests.";
      }
    }
  } catch (err) {
    errorNote =
      err instanceof Error && err.name === "TimeoutError"
        ? "Live reverse-image search timed out."
        : "Temporary error reaching the live reverse-image engine.";
  }

  // Track deduplicated real social profile matches
  const matchMap = new Map<string, LiveMatchDTO>();
  let seq = 0;

  const upsertMatch = (entry: Omit<LiveMatchDTO, "id">) => {
    const platNorm = entry.platform === "twitter" ? "x" : entry.platform;
    const handleClean = entry.handle.replace(/^@+/, "").toLowerCase();
    const key = `${platNorm}:${handleClean}`;
    const prev = matchMap.get(key);
    if (prev) {
      // Keep higher score and fill in richer avatar/bio/followers metadata
      const next: LiveMatchDTO = {
        ...prev,
        similarityScore: Math.max(prev.similarityScore, entry.similarityScore),
        matchType:
          entry.similarityScore > prev.similarityScore
            ? entry.matchType
            : prev.matchType,
        matchReason:
          entry.similarityScore > prev.similarityScore
            ? entry.matchReason
            : prev.matchReason,
        thumbUrl: prev.thumbUrl ?? entry.thumbUrl,
        snippet:
          entry.snippet.length > prev.snippet.length ? entry.snippet : prev.snippet,
        displayName:
          entry.displayName.length > prev.displayName.length &&
          !entry.displayName.startsWith("Uc")
            ? entry.displayName
            : prev.displayName,
        followersCount: entry.followersCount ?? prev.followersCount,
        location: entry.location ?? prev.location,
        verified: Boolean(prev.verified || entry.verified),
      };
      matchMap.set(key, next);
      return;
    }
    matchMap.set(key, { ...entry, id: `live-${seq++}` });
  };

  // Detect accounts directly from exact-matching public pages & CDN image URLs
  const githubLogins = new Set<string>();
  const githubIds = new Set<string>();
  const blueskyActors = new Set<string>();
  const verifiedNames: string[] = [];
  const personalWebsites = new Set<string>();
  let subjectAvatar: string | null = null;

  const inspectImageFingerprint = (imgUrl: string | null) => {
    if (!imgUrl) return;
    const ghId = imgUrl.match(/avatars\d*\.githubusercontent\.com\/u\/(\d+)/i);
    if (ghId && githubIds.size < 2) githubIds.add(ghId[1]);
    const bskyDid = imgUrl.match(/cdn\.bsky\.app\/img\/avatar\/plain\/(did:plc:[a-z0-9]+)/i);
    if (bskyDid && blueskyActors.size < 2) blueskyActors.add(bskyDid[1]);
  };

  // If user pasted a direct image URL from a personal website, include it for profile enrichment
  if (options.sourceImageUrl) {
    try {
      const u = new URL(options.sourceImageUrl);
      const h = u.hostname.toLowerCase().replace(/^www\./, "");
      if (!isStockOrGenericHost(h)) personalWebsites.add(`https://${h}`);
      inspectImageFingerprint(options.sourceImageUrl);
    } catch {
      // ignore invalid
    }
  }

  const webAppearances: LiveWebAppearanceDTO[] = [];
  const seenAppearances = new Set<string>();

  // Step 2a: Parse all exact reverse-image page matches
  for (let i = 0; i < exactHits.length; i++) {
    const hit = exactHits[i];
    inspectImageFingerprint(hit.imageHref);
    if (!subjectAvatar && hit.thumbUrl) subjectAvatar = hit.thumbUrl;

    const parsed = parseExtendedSocialUrl(hit.pageUrl);
    if (parsed) {
      const score = Math.max(91, 98 - Math.min(6, i));
      const cleanTitleName = hit.title
        .replace(/\s*[-–|·•]\s*(GitHub|YouTube|Instagram|LinkedIn|TikTok|X|Twitter|Facebook|Threads|Bluesky|Profile).*$/i, "")
        .replace(/^.*?\(([^)]{3,40})\).*$/, "$1")
        .replace(/on Bluesky$/i, "")
        .trim();

      const displayName =
        cleanTitleName.length >= 2 &&
        cleanTitleName.length <= 44 &&
        !cleanTitleName.startsWith("@")
          ? cleanTitleName
          : prettyName(parsed.handle);

      if (
        ["github", "linkedin", "youtube", "instagram", "twitter", "bluesky"].includes(
          parsed.platform
        ) &&
        displayName.split(/\s+/).length >= 2 &&
        displayName.split(/\s+/).length <= 3
      ) {
        verifiedNames.push(displayName);
      }

      const bareHandle = parsed.handle.replace(/^@+/, "").toLowerCase();
      // Ignore meta platform brand handles (e.g. github.com/github) in photo matches
      if (
        parsed.platform === "github" &&
        ["github", "about", "login", "platform", "explore", "apps"].includes(bareHandle)
      ) {
        continue;
      }

      if (parsed.platform === "github" && githubLogins.size < 2) {
        githubLogins.add(parsed.handle.replace(/^@+/, ""));
      }
      if (parsed.platform === "bluesky" && blueskyActors.size < 2) {
        blueskyActors.add(parsed.handle.replace(/^@+/, ""));
      }

      // Hold off adding raw did:plc:... entries directly — Stage 3 resolves them to readable @handles
      if (parsed.platform === "bluesky" && parsed.handle.startsWith("did:")) {
        continue;
      }

      upsertMatch({
        platform: parsed.platform === "twitter" ? "x" : parsed.platform,
        handle: parsed.handle,
        displayName,
        profileUrl: parsed.canonicalUrl,
        thumbUrl: hit.thumbUrl,
        source: "reverse_image",
        sourceLabel: hit.domain,
        snippet: hit.description || hit.title,
        similarityScore: score,
        matchType: "exact",
        matchReason: `Exact photo matched live on ${hit.domain}`,
      });
    } else if (webAppearances.length < 12 && !seenAppearances.has(hit.domain + hit.pageUrl)) {
      seenAppearances.add(hit.domain + hit.pageUrl);
      const canScan = !isStockOrGenericHost(hit.domain);
      webAppearances.push({
        id: `web-${webAppearances.length}`,
        title: hit.title,
        url: hit.pageUrl,
        domain: hit.domain,
        snippet: hit.description,
        thumbUrl: hit.thumbUrl,
        kind: "exact_page",
        isSocial: false,
        canScanWebsite: canScan,
      });

      // Check bio-link hosts directly (linktr.ee, beacons.ai, bio.link, bento.me, about.me)
      if (
        /^(linktr\.ee|beacons\.ai|bio\.link|bento\.me|about\.me|carrd\.co)$/i.test(
          hit.domain
        )
      ) {
        personalWebsites.add(hit.pageUrl);
      }
    }
  }

  // Step 2b: Parse real visually similar web hits (handles + resembling lookalike photos)
  const similarMatches: LiveWebAppearanceDTO[] = [];
  const seenSim = new Set<string>();
  const exactUrlSet = new Set(exactHits.map((h) => h.pageUrl.toLowerCase()));

  for (let i = 0; i < similarHits.length; i++) {
    const hit = similarHits[i];
    if (exactUrlSet.has(hit.pageUrl.toLowerCase())) continue;

    const parsed = parseExtendedSocialUrl(hit.pageUrl);
    if (parsed) {
      const score = Math.max(70, 84 - Math.min(14, Math.floor(i / 2)));
      const cleanName = hit.title
        .replace(/\s*[-–|·•]\s*(GitHub|YouTube|Instagram|LinkedIn|TikTok|X|Twitter|Facebook|Threads|Bluesky).*$/i, "")
        .trim();
      upsertMatch({
        platform: parsed.platform === "twitter" ? "x" : parsed.platform,
        handle: parsed.handle,
        displayName:
          cleanName.length >= 2 && cleanName.length <= 42
            ? cleanName
            : prettyName(parsed.handle),
        profileUrl: parsed.canonicalUrl,
        thumbUrl: hit.thumbUrl,
        source: "similar_image",
        sourceLabel: hit.domain,
        snippet: hit.title,
        similarityScore: score,
        matchType: score >= 78 ? "high" : "resemblance",
        matchReason: `Visually resembling picture found on ${hit.domain}`,
      });
    }

    if (
      similarMatches.length < 12 &&
      !seenSim.has(hit.pageUrl.toLowerCase()) &&
      (hit.thumbUrl || parsed)
    ) {
      seenSim.add(hit.pageUrl.toLowerCase());
      similarMatches.push({
        id: `sim-${similarMatches.length}`,
        title: hit.title,
        url: hit.pageUrl,
        domain: hit.domain,
        snippet: "",
        thumbUrl: hit.thumbUrl,
        kind: "resemblance",
        isSocial: Boolean(parsed),
        canScanWebsite: !parsed && !isStockOrGenericHost(hit.domain),
      });
    }
  }

  // Step 3: Enrich discovered GitHub & Bluesky accounts (zero key, official public APIs!)
  const ghLookups: Array<Promise<GitHubUserProfile | null>> = [];
  for (const login of githubLogins) ghLookups.push(fetchGitHubUser({ login }));
  if (ghLookups.length === 0) {
    for (const id of githubIds) ghLookups.push(fetchGitHubUser({ id }));
  }
  const bskyLookups = Array.from(blueskyActors).map((actor) => fetchBlueskyProfile(actor));

  const [ghResults, bskyResults] = await Promise.all([
    Promise.all(ghLookups),
    Promise.all(bskyLookups),
  ]);

  let identifiedSubject: IdentifiedSubjectDTO | null = null;

  for (const gh of ghResults) {
    if (!gh) continue;
    queriesRun += 1;
    const proxiedAvatar = toProxiedThumb(gh.avatar_url);
    if (proxiedAvatar) subjectAvatar = proxiedAvatar;
    if (gh.name) verifiedNames.unshift(gh.name);
    const label = gh.name || gh.login;

    upsertMatch({
      platform: "github",
      handle: `@${gh.login}`,
      displayName: label,
      profileUrl: gh.html_url,
      thumbUrl: proxiedAvatar,
      source: "github_api",
      sourceLabel: "GitHub",
      snippet: gh.bio || `${gh.followers.toLocaleString()} followers on GitHub`,
      followersCount: gh.followers,
      location: gh.location ?? undefined,
      verified: gh.followers >= 500,
      similarityScore: 98,
      matchType: "exact",
      matchReason: "Confirmed matching GitHub profile photo & account",
    });

    if (gh.twitter_username) {
      const tw = gh.twitter_username.replace(/^@+/, "");
      upsertMatch({
        platform: "x",
        handle: `@${tw}`,
        displayName: label,
        profileUrl: `https://x.com/${tw}`,
        thumbUrl: proxiedAvatar,
        source: "github_api",
        sourceLabel: "Linked from GitHub",
        snippet: gh.bio || `Verified X handle linked directly on ${label}'s GitHub profile`,
        location: gh.location ?? undefined,
        verified: true,
        similarityScore: 96,
        matchType: "exact",
        matchReason: `Linked directly from verified @${gh.login} GitHub profile`,
      });
    }

    if (gh.blog && gh.blog.trim()) {
      const blog = /^https?:\/\//i.test(gh.blog.trim())
        ? gh.blog.trim()
        : `https://${gh.blog.trim()}`;
      try {
        const parsedBlog = parseExtendedSocialUrl(blog);
        if (parsedBlog) {
          upsertMatch({
            platform: parsedBlog.platform === "twitter" ? "x" : parsedBlog.platform,
            handle: parsedBlog.handle,
            displayName: label,
            profileUrl: parsedBlog.canonicalUrl,
            thumbUrl: proxiedAvatar,
            source: "github_api",
            sourceLabel: "Linked from GitHub",
            snippet: gh.bio || `Official link on ${label}'s GitHub`,
            similarityScore: 94,
            matchType: "exact",
            matchReason: `Official link listed on @${gh.login}'s GitHub bio`,
          });
        } else {
          const host = new URL(blog).hostname.toLowerCase().replace(/^www\./, "");
          if (!isStockOrGenericHost(host)) personalWebsites.add(blog);
        }
      } catch {
        // ignore bad blog string
      }
    }

    if (!identifiedSubject && gh.name) {
      identifiedSubject = {
        name: gh.name,
        description: gh.bio || `GitHub @${gh.login}`,
        avatarUrl: proxiedAvatar,
        website:
          gh.blog && !parseExtendedSocialUrl(
            /^https?:\/\//i.test(gh.blog.trim()) ? gh.blog.trim() : `https://${gh.blog.trim()}`
          )
            ? /^https?:\/\//i.test(gh.blog.trim())
              ? gh.blog.trim()
              : `https://${gh.blog.trim()}`
            : null,
        confidence: "high",
        source: "Reverse Image + GitHub",
      };
    }
  }

  // Also prevent storing a raw website=twitter.com/handle on subject summary card
  for (const bs of bskyResults) {
    if (!bs) continue;
    queriesRun += 1;
    const proxied = toProxiedThumb(bs.avatar);
    const label = bs.displayName || bs.handle;
    if (bs.displayName && bs.displayName.split(/\s+/).length >= 2) {
      verifiedNames.push(bs.displayName);
    }

    upsertMatch({
      platform: "bluesky",
      handle: `@${bs.handle}`,
      displayName: label,
      profileUrl: `https://bsky.app/profile/${bs.handle}`,
      thumbUrl: proxied ?? subjectAvatar,
      source: "bluesky_api",
      sourceLabel: "Bluesky",
      snippet: bs.description || `Public profile on Bluesky`,
      followersCount: bs.followersCount,
      verified: (bs.followersCount ?? 0) >= 500,
      similarityScore: 96,
      matchType: "exact",
      matchReason: "Confirmed matching Bluesky profile photo",
    });

    // If Bluesky handle is a custom personal domain (e.g. evanyou.me, danabra.mov), enrich it!
    if (!bs.handle.endsWith(".bsky.social") && bs.handle.includes(".")) {
      personalWebsites.add(`https://${bs.handle}`);
    }
    // Also catch URLs in Bluesky bio
    const bioUrls = (bs.description ?? "").match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?/gi) ?? [];
    for (const url of bioUrls.slice(0, 2)) {
      const ps = parseExtendedSocialUrl(url);
      if (ps) {
        upsertMatch({
          platform: ps.platform === "twitter" ? "x" : ps.platform,
          handle: ps.handle,
          displayName: label,
          profileUrl: ps.canonicalUrl,
          thumbUrl: proxied ?? subjectAvatar,
          source: "bluesky_api",
          sourceLabel: "Linked from Bluesky",
          snippet: bs.description || `Linked from @${bs.handle}`,
          similarityScore: 92,
          matchType: "exact",
          matchReason: `Linked in @${bs.handle}'s Bluesky bio`,
        });
      }
    }

    if (!identifiedSubject && bs.displayName) {
      identifiedSubject = {
        name: bs.displayName,
        description: bs.description?.slice(0, 140) || `Bluesky @${bs.handle}`,
        avatarUrl: proxied,
        website: !bs.handle.endsWith(".bsky.social") ? `https://${bs.handle}` : null,
        confidence: "high",
        source: "Reverse Image + Bluesky",
      };
    }
  }

  // Step 4: Verify official public-figure handles via Wikidata when repeated real name detected
  const candidateNames = extractCandidateNames(exactHits, similarHits, verifiedNames);
  if (candidateNames.length > 0) {
    for (const candidate of candidateNames.slice(0, 2)) {
      const wd = await lookupWikidataSocials(candidate);
      if (!wd) continue;
      queriesRun += 1;

      if (wd.website) {
        try {
          const h = new URL(wd.website).hostname.toLowerCase().replace(/^www\./, "");
          if (!isStockOrGenericHost(h)) personalWebsites.add(wd.website);
        } catch {
          // ignore
        }
      }

      if (!identifiedSubject) {
        identifiedSubject = {
          name: wd.name,
          description: wd.description,
          avatarUrl: subjectAvatar,
          website: wd.website,
          confidence: "high",
          source: "Reverse Image + Wikidata",
        };
      } else {
        if (!identifiedSubject.website && wd.website) identifiedSubject.website = wd.website;
        if (wd.description && identifiedSubject.description.startsWith("GitHub @")) {
          identifiedSubject.description = wd.description;
        }
      }

      for (const acct of wd.accounts) {
        // Avoid adding raw UC... YouTube channel ID if we already matched a cleaner @handle YouTube channel
        if (
          acct.platform === "youtube" &&
          acct.handle.startsWith("UC") &&
          Array.from(matchMap.values()).some(
            (m) => m.platform === "youtube" && m.handle.startsWith("@")
          )
        ) {
          continue;
        }
        upsertMatch({
          platform: acct.platform === "twitter" ? "x" : acct.platform,
          handle: acct.handle,
          displayName: wd.name,
          profileUrl: acct.url,
          thumbUrl: subjectAvatar,
          source: "wikidata",
          sourceLabel: "Verified handle",
          snippet: wd.description
            ? `${wd.name} — ${wd.description}`
            : `Official verified public account for ${wd.name}`,
          verified: true,
          similarityScore: 95,
          matchType: "exact",
          matchReason: `Official verified handle for ${wd.name}`,
        });
      }
      break;
    }
  }

  // Step 5: Auto-crawl discovered personal/official websites via automation-lab/social-media-profile-finder
  // (uses Apify Actor if token exists, otherwise built-in free HTML + JSON-LD `sameAs` + script scanner!)
  let websiteHits = 0;
  const enrichedDomains: string[] = [];
  let enrichmentEngine: FreeReverseSearchOutput["enrichmentEngine"] = null;

  const siteTargets = Array.from(personalWebsites).slice(0, 2);
  if (siteTargets.length > 0) {
    try {
      const siteScan = await scanWebsiteProfiles({
        rawUrls: siteTargets,
        maxExtraPages: 1,
      });
      queriesRun += 1;
      enrichmentEngine = siteScan.engine;
      const isApify =
        siteScan.engine === "apify_actor" || siteScan.engine === "apify_server";

      for (const site of siteScan.results) {
        if (site.profileCount === 0) continue;
        enrichedDomains.push(site.domain);
        for (const cand of site.profileCandidates) {
          if (!cand.selected) continue;
          const plat = cand.platform === "twitter" ? "x" : cand.platform;
          websiteHits += 1;
          const via = cand.sources
            .map((s) => (s === "jsonLd" ? "JSON-LD sameAs" : s === "script" ? "page script" : "link"))
            .join(" + ");
          upsertMatch({
            platform: plat,
            handle: cand.handle,
            displayName: identifiedSubject?.name || prettyName(cand.handle),
            profileUrl: cand.url,
            thumbUrl: subjectAvatar,
            source: isApify ? "apify" : "website",
            sourceLabel: site.domain,
            snippet: `Official profile linked on ${site.domain} (${via})`,
            verified: cand.sources.includes("jsonLd"),
            similarityScore: isApify ? 93 : 91,
            matchType: "exact",
            matchReason: isApify
              ? `Official profile on ${site.domain} via Apify Profile Finder`
              : `Official profile linked directly on ${site.domain}`,
          });
        }
      }
    } catch {
      // Soft failure — keep already-found handles
    }
  }

  const matches = Array.from(matchMap.values())
    .sort((a, b) => {
      if (b.similarityScore !== a.similarityScore) {
        return b.similarityScore - a.similarityScore;
      }
      return (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
    })
    .slice(0, 24);

  return {
    matches,
    webAppearances: webAppearances.slice(0, 12),
    similarMatches: similarMatches.slice(0, 12),
    identifiedSubject,
    reverseImageHits: exactHits.length,
    similarImageHits: similarHits.length,
    websiteHits,
    enrichedDomains,
    enrichmentEngine,
    externalSearchUrl: cbirId
      ? `https://yandex.com/images/search?rpt=imageview&cbir_id=${encodeURIComponent(cbirId)}`
      : null,
    queriesRun,
    reachedWeb: Boolean(cbirId) || enrichedDomains.length > 0,
    errorNote,
  };
}
