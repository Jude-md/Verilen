import type { MatchType, SocialPlatform } from "@/db/schema";

/** Extended set of public social platforms returned by reverse-image & website profile discovery. */
export type ExtendedSocialPlatform =
  | "instagram"
  | "twitter"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "github"
  | "facebook"
  | "threads"
  | "bluesky"
  | "pinterest"
  | "reddit"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "snapchat"
  | "medium"
  | "mastodon";

export type LiveMatchSource =
  | "reverse_image"
  | "similar_image"
  | "github_api"
  | "bluesky_api"
  | "wikidata"
  | "website"
  | "apify"
  | "lens"
  | "site"
  | "knowledge";

/** A real public social media handle discovered live on the open web. */
export interface LiveMatchDTO {
  id: string;
  platform: SocialPlatform | ExtendedSocialPlatform;
  handle: string;
  displayName: string;
  profileUrl: string;
  thumbUrl: string | null;
  source: LiveMatchSource;
  sourceLabel: string;
  snippet: string;
  followersCount?: number;
  location?: string;
  verified?: boolean;
  similarityScore: number;
  matchType: MatchType;
  matchReason: string;
}

/** A real public webpage where the uploaded picture (or a close resemblance) appears. */
export interface LiveWebAppearanceDTO {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  thumbUrl: string | null;
  kind: "exact_page" | "resemblance";
  isSocial: boolean;
  canScanWebsite: boolean;
}

/** Verified identity detected automatically from live reverse-image hits. */
export interface IdentifiedSubjectDTO {
  name: string;
  description: string;
  avatarUrl: string | null;
  website: string | null;
  confidence: "high" | "possible";
  source: string;
}

/** Live execution status for a scan (works automatically with zero manual API keys). */
export interface LiveSearchStatus {
  enabled: boolean;
  state: "live" | "connected" | "off" | "error";
  engineLabel?: string;
  maskedKey?: string;
  message?: string;
  reverseImageHits: number;
  similarImageHits: number;
  socialHandlesFound: number;
  lensHits: number;
  siteHits: number;
  websiteHits?: number;
  enrichedDomains?: string[];
  enrichmentEngine?: "apify_actor" | "apify_server" | "builtin_live" | null;
  identifiedSubject?: IdentifiedSubjectDTO | null;
  webAppearances?: LiveWebAppearanceDTO[];
  similarMatches?: LiveWebAppearanceDTO[];
  externalSearchUrl?: string | null;
  queriesRun: number;
}

export interface LiveSearchOutcome {
  matches: LiveMatchDTO[];
  status: LiveSearchStatus;
}

export type DiscoverySource = "jsonLd" | "anchor" | "script";

export interface ProfileCandidateDTO {
  platform: ExtendedSocialPlatform;
  url: string;
  handle: string;
  sources: DiscoverySource[];
  selected: boolean;
}

export interface WebsiteProfileScanItem {
  url: string;
  domain: string;
  profiles: Record<ExtendedSocialPlatform, string | null>;
  allSocialLinks: string[];
  profileCandidates: ProfileCandidateDTO[];
  profileCount: number;
  httpStatus: number | null;
  pagesScanned: string[];
  checkTimeMs: number;
  error: string | null;
  checkedAt: string;
}

export interface WebsiteProfileScanResponse {
  actorId: "automation-lab/social-media-profile-finder";
  engine: "apify_actor" | "apify_server" | "builtin_live";
  fallbackNote?: string;
  estimatedCostUsd: number;
  totalUrls: number;
  totalProfilesFound: number;
  durationMs: number;
  results: WebsiteProfileScanItem[];
}

export interface ProviderSettingsDTO {
  builtinLive: {
    active: true;
    engines: string[];
  };
  serpapi: {
    configured: boolean;
    source: "env" | "dotenv" | null;
    envName: string | null;
    maskedKey: string | null;
  };
  apify: {
    actorId: string;
    configured: boolean;
    source: "env" | "dotenv" | null;
    envName: string | null;
    maskedToken: string | null;
    serverUrl: string | null;
    mode: "apify_server" | "apify_actor" | "builtin_live";
    pricing: {
      actorStartUsd: number;
      perUrlUsd: number;
      serverPerUrlUsd: number;
    };
  };
}
