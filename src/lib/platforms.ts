import type { MatchType, SocialPlatform } from "@/db/schema";

export interface PlatformMeta {
  id: SocialPlatform;
  name: string;
  shortName: string;
  domain: string;
  urlPrefix: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
}

export const SOCIAL_PLATFORMS: PlatformMeta[] = [
  {
    id: "instagram",
    name: "Instagram",
    shortName: "Instagram",
    domain: "instagram.com",
    urlPrefix: "https://www.instagram.com/",
    accentColor: "#E1306C",
    badgeBg: "#FDF2F8",
    badgeText: "#BE185D",
  },
  {
    id: "x",
    name: "X (Twitter)",
    shortName: "X",
    domain: "x.com",
    urlPrefix: "https://x.com/",
    accentColor: "#111827",
    badgeBg: "#F4F4F5",
    badgeText: "#18181B",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    shortName: "LinkedIn",
    domain: "linkedin.com",
    urlPrefix: "https://www.linkedin.com/in/",
    accentColor: "#0A66C2",
    badgeBg: "#EFF6FF",
    badgeText: "#1D4ED8",
  },
  {
    id: "tiktok",
    name: "TikTok",
    shortName: "TikTok",
    domain: "tiktok.com",
    urlPrefix: "https://www.tiktok.com/@",
    accentColor: "#111827",
    badgeBg: "#F4F4F5",
    badgeText: "#18181B",
  },
  {
    id: "github",
    name: "GitHub",
    shortName: "GitHub",
    domain: "github.com",
    urlPrefix: "https://github.com/",
    accentColor: "#24292F",
    badgeBg: "#F4F4F5",
    badgeText: "#27272A",
  },
  {
    id: "youtube",
    name: "YouTube",
    shortName: "YouTube",
    domain: "youtube.com",
    urlPrefix: "https://www.youtube.com/@",
    accentColor: "#DC2626",
    badgeBg: "#FEF2F2",
    badgeText: "#B91C1C",
  },
];

export const PLATFORM_MAP: Record<SocialPlatform, PlatformMeta> =
  SOCIAL_PLATFORMS.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<SocialPlatform, PlatformMeta>
  );

export function isSocialPlatform(val: string): val is SocialPlatform {
  return val in PLATFORM_MAP;
}

export function formatHandle(platform: SocialPlatform, raw: string): string {
  const cleaned = raw.trim().replace(/^@+/, "").replace(/^in\//i, "");
  if (platform === "linkedin") {
    return `in/${cleaned}`;
  }
  return `@${cleaned}`;
}

export function buildProfileUrl(platform: SocialPlatform, handle: string): string {
  const clean = handle.trim().replace(/^@+/, "").replace(/^in\//i, "");
  return `${PLATFORM_MAP[platform].urlPrefix}${encodeURIComponent(clean)}`;
}

export function formatFollowerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

export function getMatchBadgeStyle(score: number, matchType: MatchType): {
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
  ringClass: string;
} {
  if (matchType === "exact" || score >= 90) {
    return {
      label: "Exact Match",
      shortLabel: "Exact",
      bgClass: "bg-emerald-50",
      textClass: "text-emerald-700",
      dotClass: "bg-emerald-500",
      ringClass: "border-emerald-200/80",
    };
  }
  if (matchType === "high" || score >= 78) {
    return {
      label: "Strong Match",
      shortLabel: "Strong",
      bgClass: "bg-emerald-50/90",
      textClass: "text-emerald-700",
      dotClass: "bg-emerald-500",
      ringClass: "border-emerald-200/70",
    };
  }
  if (matchType === "resemblance" || score >= 62) {
    return {
      label: "Resemblance",
      shortLabel: "Similar",
      bgClass: "bg-amber-50",
      textClass: "text-amber-700",
      dotClass: "bg-amber-500",
      ringClass: "border-amber-200/80",
    };
  }
  return {
    label: "Possible Lookalike",
    shortLabel: "Possible",
    bgClass: "bg-zinc-100",
    textClass: "text-zinc-600",
    dotClass: "bg-zinc-400",
    ringClass: "border-zinc-200",
  };
}

export interface DemoSample {
  id: string;
  name: string;
  hint: string;
  imagePath: string;
}

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "elena",
    name: "Elena",
    hint: "Cropped outdoor portrait",
    imagePath: "/samples/sample-elena.jpg",
  },
  {
    id: "marcus",
    name: "Marcus",
    hint: "Daylight knitwear portrait",
    imagePath: "/samples/sample-marcus.jpg",
  },
  {
    id: "amara",
    name: "Amara",
    hint: "Soft-light studio portrait",
    imagePath: "/samples/sample-amara.jpg",
  },
  {
    id: "liam",
    name: "Liam",
    hint: "Dark editorial headshot",
    imagePath: "/samples/sample-liam.jpg",
  },
];
