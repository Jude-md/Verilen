import sharp from "sharp";
import type { MatchType, SocialPlatform } from "@/db/schema";
import type {
  LiveMatchDTO,
  LiveSearchOutcome,
  LiveSearchStatus,
} from "@/lib/live-types";
import { maskKey, readSecret, readSecretWithSource } from "@/lib/env-secure";
import {
  getApifyConfigSummary,
  parseExtendedSocialUrl,
  scanWebsiteProfiles,
} from "@/lib/apify-profile-finder";
import { runFreeReverseImageSearch } from "@/lib/free-reverse-search";

export type {
  LiveMatchDTO,
  LiveSearchOutcome,
  LiveSearchStatus,
} from "@/lib/live-types";

/**
 * Unified always-on live open-web reverse-image & social profile finder.
 *
 * Works right out of the box with ZERO API keys required:
 *   - Runs free real-time reverse image search (exact appearances + visual lookalikes)
 *   - Auto-resolves real cross-platform handles via GitHub API, Bluesky API, & Wikidata
 *   - Auto-crawls discovered websites via `automation-lab/social-media-profile-finder`
 *     (free built-in HTML / JSON-LD `sameAs` / script extractor, automatically upgrading
 *     to official Apify Actor runs when APIFY_API_TOKEN / API_TOKEN is provided)
 *   - Optionally merges SerpApi Google Lens + site-scoped Google results in parallel when
 *     SERPAPI_API_KEY is configured, automatically reading host env vars with no prompt.
 */

const SERP_ENDPOINT = "https://serpapi.com/search.json";
const IMAGE_UPLOAD_ENDPOINT = "https://serpapi.com/image";
const REQUEST_TIMEOUT_MS = 18_000;

export function getSerpApiKey(): string | undefined {
  const val = readSecret("SERPAPI_API_KEY", ["SERPAPI_KEY"]);
  if (!val || val.includes("<YOUR_")) return undefined;
  return val;
}

export function getSerpConfigSummary() {
  const info = readSecretWithSource("SERPAPI_API_KEY", ["SERPAPI_KEY"]);
  const valid = info.value && !info.value.includes("<YOUR_") ? info.value : undefined;
  return {
    configured: Boolean(valid),
    source: valid ? info.source : null,
    envName: valid ? info.envName : null,
    maskedKey: valid ? maskKey(valid) : null,
  };
}

export function getProviderSettings() {
  return {
    builtinLive: {
      active: true as const,
      engines: [
        "Open-web reverse image",
        "Visual lookalike search",
        "GitHub / Bluesky / Wikidata",
        "Website profile finder (17 platforms)",
      ],
    },
    serpapi: getSerpConfigSummary(),
    apify: getApifyConfigSummary(),
  };
}

export function isLiveSearchConfigured(): boolean {
  // Always true now — built-in live search needs zero API keys!
  return true;
}

export function getDefaultOffStatus(): LiveSearchStatus {
  return {
    enabled: false,
    state: "off",
    reverseImageHits: 0,
    similarImageHits: 0,
    socialHandlesFound: 0,
    lensHits: 0,
    siteHits: 0,
    websiteHits: 0,
    queriesRun: 0,
  };
}

function prettyNameFromHandle(handle: string): string {
  return handle
    .replace(/^(company|in|school|r|u)\//i, "")
    .replace(/^@+/, "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": "VeriLens/1.0 (visual profile lookup)",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Search provider returned an unreadable response (${res.status}).`);
  }
  if (!res.ok || data?.error) {
    const msg = String(data?.error ?? `HTTP ${res.status}`);
    if (/invalid api key|unauthorized|api key/i.test(msg)) {
      throw new Error("SerpApi rejected the API key. Check it and try again.");
    }
    throw new Error(`Google Lens failed: ${msg.slice(0, 160)}`);
  }
  return data;
}

/** Optional Google Lens boost via SerpApi (runs alongside zero-key engine when key exists). */
async function runSerpApiBoost(
  buffer: Buffer,
  apiKey: string
): Promise<{
  matches: LiveMatchDTO[];
  lensHits: number;
  siteHits: number;
  queriesRun: number;
  domains: string[];
  error?: string;
}> {
  let queriesRun = 0;
  let lensHits = 0;
  let siteHits = 0;
  const matches: LiveMatchDTO[] = [];
  const domains: string[] = [];

  try {
    // Re-encode safely below SerpApi's 500 KB image upload limit
    let jpeg: Buffer | null = null;
    for (const a of [
      { size: 1024, quality: 72 },
      { size: 896, quality: 62 },
      { size: 768, quality: 52 },
      { size: 640, quality: 44 },
      { size: 512, quality: 38 },
    ]) {
      const out = await sharp(buffer, { failOn: "truncated" })
        .rotate()
        .resize(a.size, a.size, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: a.quality, progressive: true })
        .toBuffer();
      jpeg = out;
      if (out.length <= 480 * 1024) break;
    }
    if (!jpeg) return { matches, lensHits, siteHits, queriesRun, domains };

    const form = new FormData();
    form.set("api_key", apiKey);
    form.set("image", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "scan.jpg");
    const upRes = await fetch(IMAGE_UPLOAD_ENDPOINT, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const upData = (await upRes.json().catch(() => null)) as {
      image_id?: string;
      error?: string;
    } | null;
    if (!upRes.ok || !upData?.image_id) {
      return {
        matches,
        lensHits,
        siteHits,
        queriesRun,
        domains,
        error: upData?.error || `SerpApi upload HTTP ${upRes.status}`,
      };
    }
    queriesRun += 1;

    const lensUrl = new URL(SERP_ENDPOINT);
    lensUrl.searchParams.set("api_key", apiKey);
    lensUrl.searchParams.set("engine", "google_lens");
    lensUrl.searchParams.set("image_id", upData.image_id);
    lensUrl.searchParams.set("type", "all");
    lensUrl.searchParams.set("hl", "en");

    const lensData = await fetchJson(lensUrl.toString());
    queriesRun += 1;

    const seen = new Set<string>();
    const add = (
      link: string,
      source: "lens" | "site" | "knowledge",
      title: string,
      label: string,
      thumb: string | null,
      exact: boolean
    ) => {
      const parsed = parseExtendedSocialUrl(link);
      if (!parsed) return false;
      const plat = parsed.platform === "twitter" ? "x" : parsed.platform;
      const key = `${plat}:${parsed.handle.toLowerCase()}`;
      if (seen.has(key)) return true;
      seen.add(key);

      const score = source === "lens" ? (exact ? 98 : 95) : source === "knowledge" ? 93 : 88;
      const matchType: MatchType = score >= 90 ? "exact" : "high";
      matches.push({
        id: `gl-${matches.length}`,
        platform: plat,
        handle: parsed.handle,
        displayName: prettyNameFromHandle(parsed.handle),
        profileUrl: parsed.canonicalUrl,
        thumbUrl: thumb && thumb.startsWith("https://")
          ? `/api/thumb?u=${encodeURIComponent(thumb)}`
          : null,
        source,
        sourceLabel: label,
        snippet: title.slice(0, 200),
        similarityScore: score,
        matchType,
        matchReason:
          source === "lens"
            ? `Google Lens matched this photo on ${label}`
            : `Discovered via Google search (${label})`,
      });
      return true;
    };

    const rawVisual = Array.isArray(lensData.visual_matches)
      ? (lensData.visual_matches as Array<Record<string, unknown>>)
      : [];
    const rawImages = Array.isArray(lensData.image_results)
      ? (lensData.image_results as Array<Record<string, unknown>>)
      : [];

    const hints: string[] = [];
    for (const item of [...rawVisual, ...rawImages]) {
      const link = typeof item.link === "string" ? item.link : "";
      if (!link) continue;
      const title = typeof item.title === "string" ? item.title : "";
      const thumb = typeof item.thumbnail === "string" ? item.thumbnail : null;
      const label =
        (typeof item.source === "string" && item.source) ||
        (() => {
          try {
            return new URL(link).hostname.replace(/^www\./, "");
          } catch {
            return "web";
          }
        })();

      if (add(link, "lens", title, label, thumb, Boolean(item.exact_matches))) {
        lensHits += 1;
      } else if (domains.length < 2) {
        try {
          const origin = `https://${new URL(link).hostname.replace(/^www\./, "")}`;
          if (!domains.includes(origin)) domains.push(origin);
        } catch {
          // skip
        }
      }
      if (title && title.length >= 3 && title.length <= 70 && hints.length < 2) {
        hints.push(title);
      }
    }

    const kg = lensData.knowledge_graph as Record<string, unknown> | undefined;
    if (kg && typeof kg.link === "string") {
      if (
        add(
          kg.link,
          "knowledge",
          String(kg.title ?? ""),
          "Google Lens",
          typeof kg.thumbnail === "string" ? kg.thumbnail : null,
          true
        )
      ) {
        lensHits += 1;
      }
    }

    if (hints.length > 0) {
      const top = (kg && typeof kg.title === "string" ? kg.title : hints[0]).replace(/"/g, "");
      const q =
        `(site:instagram.com OR site:x.com OR site:linkedin.com OR site:tiktok.com OR site:github.com OR site:youtube.com) "${top}"`;
      const sUrl = new URL(SERP_ENDPOINT);
      sUrl.searchParams.set("api_key", apiKey);
      sUrl.searchParams.set("engine", "google");
      sUrl.searchParams.set("q", q);
      sUrl.searchParams.set("num", "15");
      try {
        const sData = await fetchJson(sUrl.toString());
        queriesRun += 1;
        const orgs = Array.isArray(sData.organic_results)
          ? (sData.organic_results as Array<Record<string, unknown>>)
          : [];
        for (const item of orgs) {
          const link = typeof item.link === "string" ? item.link : "";
          if (!link) continue;
          if (
            add(
              link,
              "site",
              String(item.snippet ?? item.title ?? ""),
              String(item.displayed_link ?? "Google").slice(0, 32),
              null,
              false
            )
          ) {
            siteHits += 1;
          }
        }
      } catch {
        // non-fatal refinement
      }
    }

    // If SerpApi found non-social personal sites, enrich with profile finder too
    if (domains.length > 0 && matches.length < 8) {
      try {
        const w = await scanWebsiteProfiles({ rawUrls: domains.slice(0, 2), maxExtraPages: 1 });
        for (const r of w.results) {
          for (const c of r.profileCandidates) {
            if (!c.selected) continue;
            add(c.url, "site", `Linked on ${r.domain}`, r.domain, null, false);
          }
        }
      } catch {
        // non-fatal
      }
    }
  } catch (err) {
    return {
      matches,
      lensHits,
      siteHits,
      queriesRun,
      domains,
      error: err instanceof Error ? err.message : "Google Lens lookup failed",
    };
  }

  return { matches, lensHits, siteHits, queriesRun, domains };
}

/**
 * Runs real live reverse-image social profile search on any uploaded photo.
 * Zero API keys required — seamlessly boosts with SerpApi (Google Lens) and
 * Apify (`automation-lab/social-media-profile-finder`) automatically if configured.
 */
export async function runLiveSearch(options: {
  buffer: Buffer;
  sourceImageUrl?: string;
}): Promise<LiveSearchOutcome> {
  const serpKey = getSerpApiKey();

  const [freeOutcome, serpOutcome] = await Promise.all([
    runFreeReverseImageSearch({
      buffer: options.buffer,
      sourceImageUrl: options.sourceImageUrl,
    }),
    serpKey ? runSerpApiBoost(options.buffer, serpKey) : Promise.resolve(null),
  ]);

  // Merge & deduplicate zero-key reverse image matches with optional Google Lens matches
  const merged = new Map<string, LiveMatchDTO>();
  const addMerged = (item: LiveMatchDTO) => {
    const plat = item.platform === "twitter" ? "x" : item.platform;
    const key = `${plat}:${item.handle.replace(/^@+/, "").toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item, platform: plat });
      return;
    }
    merged.set(key, {
      ...existing,
      similarityScore: Math.max(existing.similarityScore, item.similarityScore),
      thumbUrl: existing.thumbUrl ?? item.thumbUrl,
      verified: Boolean(existing.verified || item.verified),
      followersCount: existing.followersCount ?? item.followersCount,
      location: existing.location ?? item.location,
      snippet: item.snippet.length > existing.snippet.length ? item.snippet : existing.snippet,
    });
  };

  for (const m of freeOutcome.matches) addMerged(m);
  if (serpOutcome) {
    for (const m of serpOutcome.matches) addMerged(m);
  }

  const allMatches = Array.from(merged.values())
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 24);

  const engineParts = ["Live Reverse Image"];
  if (serpOutcome && !serpOutcome.error) engineParts.push("Google Lens");
  if (
    freeOutcome.enrichmentEngine === "apify_actor" ||
    freeOutcome.enrichmentEngine === "apify_server"
  ) {
    engineParts.push("Apify");
  }

  const totalQueries = freeOutcome.queriesRun + (serpOutcome?.queriesRun ?? 0);
  const lensHits = serpOutcome?.lensHits ?? 0;
  const siteHits = serpOutcome?.siteHits ?? 0;

  let message: string | undefined;
  if (allMatches.length === 0 && freeOutcome.webAppearances.length === 0 && freeOutcome.similarMatches.length === 0) {
    message =
      freeOutcome.errorNote ||
      "No matching public profiles were found on the open web for this photo.";
  } else if (serpOutcome?.error) {
    message = `Google Lens note: ${serpOutcome.error}`;
  }

  const status: LiveSearchStatus = {
    enabled: true,
    state: freeOutcome.reachedWeb || (serpOutcome && !serpOutcome.error) ? "live" : "error",
    engineLabel: engineParts.join(" + "),
    maskedKey: serpKey ? maskKey(serpKey) : undefined,
    message,
    reverseImageHits: freeOutcome.reverseImageHits,
    similarImageHits: freeOutcome.similarImageHits,
    socialHandlesFound: allMatches.length,
    lensHits,
    siteHits,
    websiteHits: freeOutcome.websiteHits,
    enrichedDomains: freeOutcome.enrichedDomains,
    enrichmentEngine: freeOutcome.enrichmentEngine,
    identifiedSubject: freeOutcome.identifiedSubject,
    webAppearances: freeOutcome.webAppearances,
    similarMatches: freeOutcome.similarMatches,
    externalSearchUrl: freeOutcome.externalSearchUrl,
    queriesRun: totalQueries,
  };

  return { matches: allMatches, status };
}

/** Validates a SerpApi key with one minimal request. */
export async function testSerpApiKey(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "Enter a SerpApi API key first." };
  if (key.length < 16 || /\s/.test(key)) {
    return {
      ok: false,
      message: "That key doesn't look like a valid SerpApi key.",
    };
  }
  try {
    const url = new URL(SERP_ENDPOINT);
    url.searchParams.set("api_key", key);
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", "hello");
    url.searchParams.set("num", "1");
    const data = await fetchJson(url.toString());
    if (data?.organic_results || data?.search_information) {
      return {
        ok: true,
        message: "SerpApi key verified — Google Lens boost is now active.",
      };
    }
    return { ok: false, message: "The key did not return search results." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not verify the key.",
    };
  }
}

export type { SocialPlatform };
