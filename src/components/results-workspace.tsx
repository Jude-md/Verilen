"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Grid2x2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { SocialPlatform } from "@/db/schema";
import type { ScanMatchDTO, ScanResultDTO } from "@/lib/scan-service";
import type {
  LiveMatchDTO,
  LiveMatchSource,
  LiveSearchStatus,
} from "@/lib/live-types";
import {
  formatFollowerCount,
  getMatchBadgeStyle,
  PLATFORM_MAP,
  SOCIAL_PLATFORMS,
} from "@/lib/platforms";
import { PlatformIcon, VerifiedBadge } from "@/components/platform-icons";

type ViewTab = "handles" | "similar" | "pages" | "local";
type SortMode = "similarity" | "facial" | "saved";

interface ResultsWorkspaceProps {
  scan: ScanResultDTO;
  isRescanning: boolean;
  onNewScan: () => void;
  onRescan: () => void;
  onDeleteScan: (scanId: string) => void;
  onSelectMatch: (match: ScanMatchDTO) => void;
  onToggleSave: (match: ScanMatchDTO) => void;
  onCopyHandle: (handle: string) => void;
  onScanDomain: (domainOrUrl: string) => void;
  onOpenAddProfile: () => void;
  onOpenSettings: (tab?: "apify" | "serpapi") => void;
}

const ANY_PLATFORM_META: Record<
  string,
  { label: string; domain: string; color: string; mono: string; core?: SocialPlatform }
> = {
  instagram: { label: "Instagram", domain: "instagram.com", color: "#E1306C", mono: "IG", core: "instagram" },
  x: { label: "X", domain: "x.com", color: "#111827", mono: "X", core: "x" },
  twitter: { label: "X", domain: "x.com", color: "#111827", mono: "X", core: "x" },
  linkedin: { label: "LinkedIn", domain: "linkedin.com", color: "#0A66C2", mono: "in", core: "linkedin" },
  tiktok: { label: "TikTok", domain: "tiktok.com", color: "#111827", mono: "TT", core: "tiktok" },
  youtube: { label: "YouTube", domain: "youtube.com", color: "#DC2626", mono: "YT", core: "youtube" },
  github: { label: "GitHub", domain: "github.com", color: "#24292F", mono: "GH", core: "github" },
  facebook: { label: "Facebook", domain: "facebook.com", color: "#1877F2", mono: "f" },
  threads: { label: "Threads", domain: "threads.net", color: "#111827", mono: "@" },
  bluesky: { label: "Bluesky", domain: "bsky.app", color: "#0285FF", mono: "B" },
  pinterest: { label: "Pinterest", domain: "pinterest.com", color: "#E60023", mono: "P" },
  reddit: { label: "Reddit", domain: "reddit.com", color: "#FF4500", mono: "r/" },
  discord: { label: "Discord", domain: "discord.com", color: "#5865F2", mono: "D" },
  telegram: { label: "Telegram", domain: "t.me", color: "#26A5E4", mono: "tg" },
  whatsapp: { label: "WhatsApp", domain: "whatsapp.com", color: "#16A34A", mono: "W" },
  snapchat: { label: "Snapchat", domain: "snapchat.com", color: "#CA8A04", mono: "S" },
  medium: { label: "Medium", domain: "medium.com", color: "#111827", mono: "M" },
  mastodon: { label: "Mastodon", domain: "mastodon.social", color: "#6364FF", mono: "m" },
};

const SOURCE_BADGE: Record<LiveMatchSource, string> = {
  reverse_image: "Exact photo",
  similar_image: "Visual lookalike",
  github_api: "GitHub",
  bluesky_api: "Bluesky",
  wikidata: "Verified ID",
  website: "Linked site",
  apify: "Apify Finder",
  lens: "Google Lens",
  site: "Web search",
  knowledge: "Google Lens",
};

function AnyPlatformGlyph({
  platform,
  size = "sm",
}: {
  platform: string;
  size?: "sm" | "lg";
}) {
  const key = platform === "twitter" ? "x" : platform;
  const meta = ANY_PLATFORM_META[key] ?? {
    label: platform,
    domain: `${platform}.com`,
    color: "#3F3F46",
    mono: platform.slice(0, 2).toUpperCase(),
  };

  if (meta.core) {
    return (
      <PlatformIcon
        platform={meta.core}
        className={size === "lg" ? "h-7 w-7 shrink-0" : "h-3.5 w-3.5 shrink-0"}
        colored
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold text-white ${
        size === "lg" ? "h-8 w-8 rounded-lg text-[13px]" : "h-4 w-4 text-[9.5px]"
      }`}
      style={{ backgroundColor: meta.color }}
    >
      {meta.mono}
    </span>
  );
}

export function ResultsWorkspace({
  scan,
  isRescanning,
  onNewScan,
  onRescan,
  onDeleteScan,
  onSelectMatch,
  onToggleSave,
  onCopyHandle,
  onScanDomain,
  onOpenAddProfile,
  onOpenSettings,
}: ResultsWorkspaceProps) {
  const isLiveScan = scan.sourceType !== "sample";
  const liveMatches = useMemo<LiveMatchDTO[]>(
    () => scan.liveMatches ?? [],
    [scan.liveMatches]
  );
  const liveStatus: LiveSearchStatus = scan.liveStatus ?? {
    enabled: false,
    state: "off",
    reverseImageHits: 0,
    similarImageHits: 0,
    socialHandlesFound: 0,
    lensHits: 0,
    siteHits: 0,
    queriesRun: 0,
  };
  const webAppearances = useMemo(
    () => liveStatus.webAppearances ?? [],
    [liveStatus.webAppearances]
  );
  const similarMatches = useMemo(
    () => liveStatus.similarMatches ?? [],
    [liveStatus.similarMatches]
  );
  const subject = liveStatus.identifiedSubject ?? null;

  // User-added local matches with high similarity surface directly alongside live handles
  const userIndexedHits = useMemo(
    () => scan.matches.filter((m) => m.isUserAdded && m.similarityScore >= 85),
    [scan.matches]
  );

  // Pick smartest default view for each scan type
  const defaultTab: ViewTab = !isLiveScan
    ? "local"
    : liveMatches.length > 0 || userIndexedHits.length > 0
      ? "handles"
      : similarMatches.length > 0
        ? "similar"
        : webAppearances.length > 0
          ? "pages"
          : "handles";

  const [tab, setTab] = useState<ViewTab>(defaultTab);
  const [livePlatformFilter, setLivePlatformFilter] = useState<string>("all");
  const [localPlatformFilter, setLocalPlatformFilter] = useState<"all" | SocialPlatform>("all");
  const [minScore, setMinScore] = useState<number>(45);
  const [sortMode, setSortMode] = useState<SortMode>("similarity");
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  // Dynamic platform chips available in the discovered live handles
  const livePlatformCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of liveMatches) {
      const k = m.platform === "twitter" ? "x" : m.platform;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [liveMatches]);

  const filteredLiveHandles = useMemo(() => {
    if (livePlatformFilter === "all") return liveMatches;
    return liveMatches.filter((m) => {
      const k = m.platform === "twitter" ? "x" : m.platform;
      return k === livePlatformFilter;
    });
  }, [liveMatches, livePlatformFilter]);

  // Sample / local catalog filters
  const thresholdLocal = useMemo(
    () => scan.matches.filter((m) => m.similarityScore >= minScore),
    [scan.matches, minScore]
  );

  const localPlatformCounts = useMemo(() => {
    const counts: Record<SocialPlatform, number> = {
      instagram: 0,
      x: 0,
      linkedin: 0,
      tiktok: 0,
      github: 0,
      youtube: 0,
    };
    for (const m of thresholdLocal) counts[m.platform] += 1;
    return counts;
  }, [thresholdLocal]);

  const filteredLocal = useMemo(() => {
    let list = thresholdLocal;
    if (localPlatformFilter !== "all") {
      list = list.filter((m) => m.platform === localPlatformFilter);
    }
    if (sortMode === "saved") list = list.filter((m) => m.isSaved);
    const copy = [...list];
    if (sortMode === "facial") {
      copy.sort(
        (a, b) =>
          b.facialScore - a.facialScore || b.similarityScore - a.similarityScore
      );
    } else {
      copy.sort((a, b) => b.similarityScore - a.similarityScore);
    }
    return copy;
  }, [thresholdLocal, localPlatformFilter, sortMode]);

  const localIdentityCluster = useMemo(() => {
    if (isLiveScan) return null;
    const strong = scan.matches.filter((m) => m.similarityScore >= 78);
    if (strong.length === 0) return null;
    const lead = strong[0];
    const group = scan.matches.filter(
      (m) => m.identityKey === lead.identityKey && m.similarityScore >= 72
    );
    if (group.length < 2) return null;
    return {
      displayName: lead.displayName,
      topScore: lead.similarityScore,
      handles: group,
    };
  }, [scan.matches, isLiveScan]);

  const savedCount = useMemo(
    () => scan.matches.filter((m) => m.isSaved).length,
    [scan.matches]
  );

  function copyValue(key: string, value: string) {
    onCopyHandle(value);
    setCopiedId(key);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === key ? null : cur));
    }, 1500);
  }

  function copyAllLiveHandles() {
    if (liveMatches.length === 0) return;
    const header = subject ? [`${subject.name}${subject.description ? ` — ${subject.description}` : ""}`] : [];
    const lines = [
      ...header,
      ...liveMatches.map((m) => {
        const meta = ANY_PLATFORM_META[m.platform] ?? { label: m.platform };
        return `${meta.label}: ${m.handle} (${m.profileUrl})`;
      }),
    ].join("\n");
    copyValue("copy-all-live", lines);
  }

  function copyAllLocalCluster() {
    if (!localIdentityCluster) return;
    const lines = [
      localIdentityCluster.displayName,
      ...localIdentityCluster.handles.map(
        (h) => `${PLATFORM_MAP[h.platform].shortName}: ${h.handle} (${h.profileUrl})`
      ),
    ].join("\n");
    copyValue("cluster-all", lines);
  }

  const totalLiveHandles = liveMatches.length + userIndexedHits.length;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-9">
        {/* LEFT: Sticky Reference Query Image Panel */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-[288px]">
          <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="relative aspect-[4/4.5] w-full overflow-hidden rounded-xl bg-zinc-100">
              <img
                src={scan.imagePath}
                alt={scan.queryLabel}
                className="h-full w-full object-cover object-top"
              />

              {showOverlay && (
                <div className="pointer-events-none absolute inset-0 bg-indigo-950/15 transition-opacity">
                  <div
                    className="absolute rounded-lg border border-indigo-400 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.45)_inset]"
                    style={{ left: "14%", top: "6%", width: "72%", height: "74%" }}
                  >
                    <div className="grid h-full w-full grid-cols-4 grid-rows-4 opacity-45">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className="border border-white/40" />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowOverlay((v) => !v)}
                aria-pressed={showOverlay}
                title="Toggle visual focus region"
                className={`absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition-colors ${
                  showOverlay
                    ? "bg-indigo-600 text-white"
                    : "bg-white/90 text-zinc-700 ring-1 ring-black/8 hover:bg-white"
                }`}
              >
                <Grid2x2 className="h-3 w-3" />
                Region
              </button>
            </div>

            {/* Metadata + Dominant Palette */}
            <div className="mt-3.5">
              <p
                className="truncate text-[13.5px] font-medium text-[#111827]"
                title={scan.queryLabel}
              >
                {subject ? subject.name : scan.queryLabel}
              </p>
              <p className="font-mono-num mt-0.5 text-[11.5px] text-zinc-500">
                {scan.imageWidth}×{scan.imageHeight} ·{" "}
                {scan.durationMs >= 1000
                  ? `${(scan.durationMs / 1000).toFixed(1)}s`
                  : `${scan.durationMs}ms`}
                {isLiveScan
                  ? ` · ${liveStatus.reverseImageHits + liveStatus.similarImageHits + liveStatus.lensHits} web hits`
                  : ` · ${scan.profilesScanned} indexed`}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
                <div className="flex items-center gap-1.5" title="Extracted portrait color palette">
                  {scan.dominantColors.slice(0, 4).map((hex, i) => (
                    <span
                      key={`${hex}-${i}`}
                      className="h-4 w-4 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                <span className="font-mono text-[11px] text-zinc-400">
                  #{scan.dhash.slice(0, 8)}
                </span>
              </div>
            </div>

            {/* Min match slider only shown while viewing local catalog */}
            {tab === "local" && (
              <div className="mt-3.5 border-t border-zinc-100 pt-3.5">
                <div className="mb-2 flex items-center justify-between text-[12px]">
                  <label
                    htmlFor="min-similarity-range"
                    className="inline-flex items-center gap-1.5 font-medium text-zinc-600"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                    Min match
                  </label>
                  <span className="font-mono-num font-medium text-[#111827]">
                    {minScore}%
                  </span>
                </div>
                <input
                  id="min-similarity-range"
                  type="range"
                  min={45}
                  max={90}
                  step={5}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="studio-range w-full"
                />
              </div>
            )}

            {/* Primary Actions */}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={onNewScan}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-3.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA]"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload new image
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRescan}
                  disabled={isRescanning}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12.5px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRescanning ? "animate-spin" : ""}`}
                  />
                  {isRescanning ? "Scanning…" : "Re-scan"}
                </button>
                {confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => onDeleteScan(scan.id)}
                    className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    title="Delete uploaded photo & scan history"
                    aria-label="Delete this scan"
                    className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {liveStatus.externalSearchUrl && (
                <a
                  href={liveStatus.externalSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 pt-1 text-[11.5px] font-medium text-zinc-500 transition-colors hover:text-indigo-600"
                >
                  View full web match index
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT: Primary Discovery Canvas */}
        <div className="min-w-0 flex-1">
          {/* Clean Headline */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {isLiveScan ? (
                <>
                  <div className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {liveStatus.engineLabel || "Live open-web search"}
                  </div>
                  <h1 className="font-display text-[25px] font-semibold tracking-[-0.025em] text-[#111827] sm:text-[28px]">
                    {totalLiveHandles > 0 ? (
                      <>
                        <span className="font-mono-num">{totalLiveHandles}</span>{" "}
                        real social{" "}
                        {totalLiveHandles === 1 ? "handle" : "handles"} found
                      </>
                    ) : webAppearances.length > 0 || similarMatches.length > 0 ? (
                      <>
                        <span className="font-mono-num">
                          {webAppearances.length + similarMatches.length}
                        </span>{" "}
                        web matches found
                      </>
                    ) : (
                      "No exact public handles found"
                    )}
                  </h1>
                  <p className="mt-1 text-[13.5px] text-zinc-500">
                    {totalLiveHandles > 0 ? (
                      <>
                        Matched live across the open web
                        {webAppearances.length > 0 && (
                          <> · {webAppearances.length} web pages</>
                        )}
                        {similarMatches.length > 0 && (
                          <> · {similarMatches.length} visually similar</>
                        )}
                      </>
                    ) : webAppearances.length > 0 || similarMatches.length > 0 ? (
                      <>
                        Found matching pages &amp; visually similar photos online — inspect
                        below or click any site to pull its official social handles.
                      </>
                    ) : (
                      liveStatus.message ||
                      "This exact photo doesn't appear to be published on an indexed public social profile yet."
                    )}
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-indigo-600">
                    Sample portrait · Indexed catalog preview
                  </div>
                  <h1 className="font-display text-[25px] font-semibold tracking-[-0.025em] text-[#111827] sm:text-[28px]">
                    <span className="font-mono-num">{filteredLocal.length}</span>{" "}
                    {filteredLocal.length === 1 ? "profile" : "profiles"} matched
                  </h1>
                  <p className="mt-1 text-[13.5px] text-zinc-500">
                    Upload your own picture anytime to automatically run a real
                    open-web scan across 17 social networks.
                  </p>
                </>
              )}
            </div>

            {tab === "local" && (
              <div className="shrink-0">
                <label htmlFor="sort-select" className="sr-only">
                  Sort local catalog matches
                </label>
                <select
                  id="sort-select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-zinc-700 hover:border-zinc-300 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="similarity">Sort: Best match</option>
                  <option value="facial">Sort: Facial resemblance</option>
                  <option value="saved">Saved ({savedCount})</option>
                </select>
              </div>
            )}
          </div>

          {/* Detected Real Person Multi-Platform Summary Card */}
          {isLiveScan && liveMatches.length > 0 && (
            <div className="mt-5 rounded-2xl border border-emerald-200/80 bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(16,185,129,0.06)] sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-display text-[14.5px] font-semibold text-[#111827]">
                      {subject ? subject.name : "Fetched public social handles"}
                    </span>
                    {subject?.confidence === "high" && (
                      <VerifiedBadge className="h-3.5 w-3.5" />
                    )}
                    {subject?.website && (
                      <button
                        type="button"
                        onClick={() => onScanDomain(subject.website!)}
                        title="Scan official website for all 17 social networks"
                        className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <Globe className="h-3 w-3" />
                        {subject.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </button>
                    )}
                  </div>
                  {subject?.description && (
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-zinc-500">
                      {subject.description}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={copyAllLiveHandles}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2.5 py-1 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-white"
                >
                  {copiedId === "copy-all-live" ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copied all
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-zinc-400" />
                      Copy all ({liveMatches.length})
                    </>
                  )}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {liveMatches.slice(0, 12).map((item) => {
                  const k = `chip-${item.id}`;
                  const copied = copiedId === k;
                  return (
                    <div
                      key={item.id}
                      className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200/90 bg-[#FAFAFA] text-[12px] transition-colors hover:border-zinc-300"
                    >
                      <a
                        href={item.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[#111827] hover:bg-zinc-100"
                      >
                        <AnyPlatformGlyph platform={item.platform} />
                        <span className="max-w-[160px] truncate font-mono text-[11.5px]">
                          {item.handle}
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyValue(k, item.handle)}
                        aria-label={`Copy ${item.handle}`}
                        className="border-l border-zinc-200/80 px-2 py-1.5 text-zinc-400 hover:bg-white hover:text-[#111827]"
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Local Sample Multi-Platform Strip */}
          {localIdentityCluster && tab === "local" && localPlatformFilter === "all" && sortMode !== "saved" && (
            <div className="mt-5 rounded-xl border border-indigo-200/70 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(79,70,229,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-medium text-[#111827]">
                    {localIdentityCluster.displayName}
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500">
                    {localIdentityCluster.handles.length} linked sample handles
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-num rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
                    {localIdentityCluster.topScore}% match
                  </span>
                  <button
                    type="button"
                    onClick={copyAllLocalCluster}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-600 hover:text-[#111827]"
                  >
                    {copiedId === "cluster-all" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 text-zinc-400" />
                        Copy all
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {localIdentityCluster.handles.map((item) => {
                  const key = `cluster-${item.id}`;
                  return (
                    <div
                      key={item.id}
                      className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200/90 bg-[#FAFAFA] text-[12px]"
                    >
                      <a
                        href={item.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-zinc-800 hover:bg-zinc-100"
                      >
                        <PlatformIcon platform={item.platform} className="h-3.5 w-3.5" colored />
                        <span className="font-mono text-[11.5px]">{item.handle}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyValue(key, item.handle)}
                        aria-label={`Copy ${item.handle}`}
                        className="border-l border-zinc-200/80 px-2 py-1.5 text-zinc-400 hover:bg-white hover:text-[#111827]"
                      >
                        {copiedId === key ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* View Mode Navigation Tabs */}
          {isLiveScan && (
            <div
              role="tablist"
              aria-label="Scan result categories"
              className="mt-6 flex items-center gap-1 border-b border-zinc-200/90 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {(
                [
                  { id: "handles", label: "Social handles", count: totalLiveHandles },
                  { id: "similar", label: "Visual resemblance", count: similarMatches.length },
                  { id: "pages", label: "Web pages", count: webAppearances.length },
                  { id: "local", label: "Saved catalog", count: scan.matches.length },
                ] as Array<{ id: ViewTab; label: string; count: number }>
              ).map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                      active
                        ? "border-indigo-600 text-[#111827]"
                        : "border-transparent text-zinc-500 hover:text-[#111827]"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`font-mono-num rounded-full px-1.5 py-0.2 text-[11px] ${
                        active
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── TAB 1: REAL LIVE SOCIAL HANDLES ─────────────────────────────── */}
          {tab === "handles" && isLiveScan && (
            <>
              {/* Optional platform pills */}
              {livePlatformCounts.length > 1 && (
                <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setLivePlatformFilter("all")}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                      livePlatformFilter === "all"
                        ? "bg-[#111827] text-white"
                        : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    All <span className="font-mono-num opacity-75">{liveMatches.length}</span>
                  </button>
                  {livePlatformCounts.map(([plat, cnt]) => {
                    const meta = ANY_PLATFORM_META[plat];
                    const active = livePlatformFilter === plat;
                    return (
                      <button
                        key={plat}
                        type="button"
                        onClick={() => setLivePlatformFilter(plat)}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                          active
                            ? "bg-[#4F46E5] text-white"
                            : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                        }`}
                      >
                        {!active && <AnyPlatformGlyph platform={plat} />}
                        <span>{meta?.label ?? plat}</span>
                        <span className="font-mono-num opacity-70">{cnt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredLiveHandles.length > 0 || userIndexedHits.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {/* Exact matches indexed directly by the user first */}
                  {livePlatformFilter === "all" &&
                    userIndexedHits.map((m) => {
                      const badge = getMatchBadgeStyle(m.similarityScore, m.matchType);
                      const key = `u-${m.id}`;
                      return (
                        <article
                          key={key}
                          className="group flex flex-col overflow-hidden rounded-2xl border border-indigo-200/90 bg-white transition-all hover:shadow-[0_10px_28px_-16px_rgba(79,70,229,0.22)]"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectMatch(m)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectMatch(m);
                              }
                            }}
                            className="relative aspect-[4/3.6] w-full cursor-pointer overflow-hidden bg-zinc-100"
                          >
                            <img
                              src={m.avatarPath}
                              alt={m.displayName}
                              className="h-full w-full object-cover object-top"
                            />
                            <span
                              className={`font-mono-num absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur-md ${badge.textClass}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                              {m.similarityScore}% {badge.shortLabel}
                            </span>
                            <span className="absolute bottom-2.5 left-2.5 rounded-md bg-indigo-600/90 px-2 py-0.5 text-[10px] font-medium text-white">
                              Your index
                            </span>
                          </div>
                          <div className="flex flex-1 flex-col p-3.5">
                            <div className="flex items-center gap-1.5">
                              <AnyPlatformGlyph platform={m.platform} />
                              <h2 className="truncate text-[14px] font-semibold text-[#111827]">
                                {m.displayName}
                              </h2>
                              {m.verified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />}
                            </div>
                            <button
                              type="button"
                              onClick={() => copyValue(key, m.handle)}
                              className="mt-1 inline-flex items-center gap-1.5 text-left font-mono text-[12.5px] text-zinc-600 hover:text-[#111827]"
                            >
                              <span className="truncate">{m.handle}</span>
                              {copiedId === key ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3 text-zinc-400" />
                              )}
                            </button>
                            <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[12px]">
                              <button
                                type="button"
                                onClick={() => onSelectMatch(m)}
                                className="font-medium text-zinc-500 hover:text-[#111827]"
                              >
                                Compare
                              </button>
                              <a
                                href={m.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
                              >
                                Open profile
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        </article>
                      );
                    })}

                  {/* Live real social handles fetched across the open web */}
                  {filteredLiveHandles.map((live) => {
                    const key = `live-${live.id}`;
                    const copied = copiedId === key;
                    const badge = getMatchBadgeStyle(live.similarityScore, live.matchType);
                    const meta = ANY_PLATFORM_META[live.platform] ?? {
                      label: live.platform,
                      domain: live.sourceLabel,
                      color: "#3F3F46",
                    };
                    const sourceTag = SOURCE_BADGE[live.source] ?? "Live web";

                    return (
                      <article
                        key={live.id}
                        className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white transition-all duration-150 hover:border-zinc-300 hover:shadow-[0_10px_28px_-16px_rgba(17,24,39,0.16)]"
                      >
                        <div className="relative aspect-[4/3.4] w-full overflow-hidden bg-zinc-100">
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#FAFAFA] to-zinc-100">
                            <AnyPlatformGlyph platform={live.platform} size="lg" />
                            <span className="font-mono text-[11.5px] text-zinc-500">
                              {meta.domain}
                            </span>
                          </div>
                          {live.thumbUrl && (
                            <img
                              src={live.thumbUrl}
                              alt={`${live.displayName} (${live.handle})`}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.visibility = "hidden";
                              }}
                              className="relative h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                          )}

                          <span
                            className={`font-mono-num absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/92 px-2.5 py-1 text-[11.5px] font-semibold shadow-xs backdrop-blur-md ${badge.textClass}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                            {live.similarityScore}% {badge.shortLabel}
                          </span>

                          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-zinc-900/78 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">
                            {sourceTag}
                          </span>
                        </div>

                        <div className="flex flex-1 flex-col p-3.5">
                          <div className="flex items-center gap-1.5">
                            <AnyPlatformGlyph platform={live.platform} />
                            <h2 className="truncate text-[14px] font-semibold text-[#111827]">
                              {live.displayName}
                            </h2>
                            {live.verified && (
                              <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />
                            )}
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => copyValue(key, live.handle)}
                              title="Copy handle"
                              className="group/copy inline-flex min-w-0 items-center gap-1.5 text-left font-mono text-[12.5px] text-zinc-600 transition-colors hover:text-[#111827]"
                            >
                              <span className="truncate">{live.handle}</span>
                              {copied ? (
                                <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3 shrink-0 text-zinc-400 group-hover/copy:text-indigo-600" />
                              )}
                            </button>
                            {typeof live.followersCount === "number" &&
                              live.followersCount > 0 && (
                                <span className="font-mono-num inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-400">
                                  <Users className="h-3 w-3" />
                                  {formatFollowerCount(live.followersCount)}
                                </span>
                              )}
                          </div>

                          {live.snippet && (
                            <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-zinc-500">
                              {live.snippet}
                            </p>
                          )}

                          <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[12px]">
                            <span className="truncate pr-2 text-[11.5px] text-zinc-400">
                              {meta.label}
                            </span>
                            <a
                              href={live.profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 font-medium text-indigo-600 transition-colors hover:text-indigo-700"
                            >
                              Open profile
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-zinc-200/90 bg-white px-6 py-10 text-center">
                  <p className="font-display text-[15.5px] font-semibold text-[#111827]">
                    No direct social media handle found for this exact picture
                  </p>
                  <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-zinc-500">
                    {similarMatches.length > 0 || webAppearances.length > 0
                      ? "We found live open-web appearances and visually similar pictures — switch tabs above to inspect them, or pull linked handles from any website where the photo appeared."
                      : "Private photos or fresh uploads never posted online won't appear on public accounts. You can also connect Google Lens or open the search directly below."}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {similarMatches.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTab("similar")}
                        className="rounded-lg bg-[#4F46E5] px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-[#4338CA]"
                      >
                        View {similarMatches.length} visual lookalikes
                      </button>
                    )}
                    {webAppearances.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTab("pages")}
                        className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        View {webAppearances.length} web pages
                      </button>
                    )}
                    {liveStatus.externalSearchUrl && (
                      <a
                        href={liveStatus.externalSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Browse visually similar online
                        <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenSettings("serpapi")}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-[#FAFAFA] px-3.5 py-2 text-[12.5px] font-medium text-zinc-600 hover:text-[#111827]"
                    >
                      Add Google Lens boost
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB 2: LIVE VISUALLY SIMILAR / RESEMBLANCE PHOTOS ───────────── */}
          {tab === "similar" && isLiveScan && (
            similarMatches.length > 0 ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {similarMatches.map((item) => (
                  <article
                    key={item.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white transition-all hover:border-zinc-300 hover:shadow-[0_10px_28px_-16px_rgba(17,24,39,0.16)]"
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-[4/3.4] w-full overflow-hidden bg-zinc-100"
                    >
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-50 text-[11.5px] font-mono text-zinc-400">
                        {item.domain}
                      </div>
                      {item.thumbUrl && (
                        <img
                          src={item.thumbUrl}
                          alt={item.title}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                          className="relative h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      )}
                      <span className="absolute top-2.5 left-2.5 rounded-full bg-white/92 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 shadow-xs backdrop-blur-md">
                        Visual match
                      </span>
                    </a>
                    <div className="flex flex-1 flex-col p-3.5">
                      <p className="line-clamp-2 text-[13px] font-medium text-[#111827]">
                        {item.title}
                      </p>
                      <p className="mt-1 truncate font-mono text-[11.5px] text-zinc-400">
                        {item.domain}
                      </p>
                      <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[12px]">
                        {item.canScanWebsite ? (
                          <button
                            type="button"
                            onClick={() => onScanDomain(item.domain)}
                            className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-indigo-600"
                          >
                            <Search className="h-3 w-3" />
                            Find handles
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-400">Open web</span>
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Visit
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-[13px] text-zinc-500">
                No extra visual resemblance results returned for this photo.
              </div>
            )
          )}

          {/* ── TAB 3: EXACT WEB PAGES MATCHING THIS PHOTO ──────────────────── */}
          {tab === "pages" && isLiveScan && (
            webAppearances.length > 0 ? (
              <ul className="mt-5 space-y-2.5">
                {webAppearances.map((site) => (
                  <li
                    key={site.id}
                    className="flex items-center gap-3.5 rounded-2xl border border-zinc-200/90 bg-white p-3 transition-colors hover:border-zinc-300"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        <Globe className="h-5 w-5" />
                      </div>
                      {site.thumbUrl && (
                        <img
                          src={site.thumbUrl}
                          alt={site.title}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                          className="absolute inset-0 h-full w-full object-cover object-top"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-1 text-[13.5px] font-semibold text-[#111827] hover:text-indigo-600"
                      >
                        {site.title}
                      </a>
                      <p className="truncate font-mono text-[11.5px] text-zinc-400">
                        {site.domain}
                      </p>
                      {site.snippet && (
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-zinc-500">
                          {site.snippet}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {site.canScanWebsite && (
                        <button
                          type="button"
                          onClick={() => onScanDomain(site.domain)}
                          title={`Scan ${site.domain} across 17 platforms for linked social media profiles`}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700"
                        >
                          <Search className="h-3 w-3" />
                          <span className="hidden sm:inline">Find handles</span>
                        </button>
                      )}
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${site.domain}`}
                        className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-[13px] text-zinc-500">
                No non-social webpages indexed this exact picture.
              </div>
            )
          )}

          {/* ── TAB 4: LOCAL SAVED / SAMPLE CATALOG ─────────────────────────── */}
          {tab === "local" && (
            <>
              <div
                role="tablist"
                aria-label="Filter local profiles by platform"
                className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={localPlatformFilter === "all"}
                  onClick={() => setLocalPlatformFilter("all")}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    localPlatformFilter === "all"
                      ? "bg-[#111827] text-white"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-[#111827]"
                  }`}
                >
                  All
                  <span className="font-mono-num text-[11px] opacity-75">
                    {thresholdLocal.length}
                  </span>
                </button>
                {SOCIAL_PLATFORMS.map((platform) => {
                  const cnt = localPlatformCounts[platform.id];
                  const active = localPlatformFilter === platform.id;
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setLocalPlatformFilter(platform.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                        active
                          ? "bg-[#4F46E5] text-white"
                          : cnt === 0
                            ? "border border-zinc-200/70 bg-white/60 text-zinc-400"
                            : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                      }`}
                    >
                      <PlatformIcon
                        platform={platform.id}
                        className="h-3.5 w-3.5"
                        colored={!active && cnt > 0}
                      />
                      <span>{platform.shortName}</span>
                      <span className="font-mono-num text-[11px] opacity-70">{cnt}</span>
                    </button>
                  );
                })}
              </div>

              {filteredLocal.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredLocal.map((match) => {
                    const badge = getMatchBadgeStyle(
                      match.similarityScore,
                      match.matchType
                    );
                    const cardKey = `card-${match.id}`;
                    const meta = PLATFORM_MAP[match.platform];
                    return (
                      <article
                        key={match.id}
                        className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white transition-all hover:border-zinc-300 hover:shadow-[0_10px_28px_-16px_rgba(17,24,39,0.16)]"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectMatch(match)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectMatch(match);
                            }
                          }}
                          aria-label={`Compare photo with ${match.displayName} on ${meta.name}`}
                          className="relative aspect-[4/4.1] w-full cursor-pointer overflow-hidden bg-zinc-100"
                        >
                          <img
                            src={match.avatarPath}
                            alt={`${match.displayName} (${match.handle})`}
                            loading="lazy"
                            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                          <span
                            className={`font-mono-num absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[11.5px] font-semibold shadow-xs backdrop-blur-md ${badge.textClass}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
                            {match.similarityScore}% {badge.shortLabel}
                          </span>
                          <button
                            type="button"
                            aria-label={match.isSaved ? "Unsave" : "Save"}
                            aria-pressed={match.isSaved}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSave(match);
                            }}
                            className={`absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-all ${
                              match.isSaved
                                ? "bg-indigo-600 text-white"
                                : "bg-white/88 text-zinc-600 hover:bg-white hover:text-[#111827]"
                            }`}
                          >
                            <Bookmark
                              className={`h-3.5 w-3.5 ${match.isSaved ? "fill-current" : ""}`}
                            />
                          </button>
                          {match.isUserAdded && (
                            <span className="absolute bottom-2.5 left-2.5 rounded-md bg-zinc-900/75 px-2 py-0.5 text-[10px] font-medium text-white">
                              Indexed by you
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-3.5">
                          <div className="flex items-center gap-1.5">
                            <PlatformIcon platform={match.platform} className="h-3.5 w-3.5 shrink-0" colored />
                            <h2
                              onClick={() => onSelectMatch(match)}
                              className="cursor-pointer truncate text-[14px] font-semibold text-[#111827] hover:text-indigo-600"
                            >
                              {match.displayName}
                            </h2>
                            {match.verified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />}
                          </div>
                          <button
                            type="button"
                            onClick={() => copyValue(cardKey, match.handle)}
                            className="mt-1 inline-flex items-center gap-1.5 text-left font-mono text-[12.5px] text-zinc-600 hover:text-[#111827]"
                          >
                            <span className="truncate">{match.handle}</span>
                            {copiedId === cardKey ? (
                              <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3 shrink-0 text-zinc-400" />
                            )}
                          </button>
                          <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[12px]">
                            <button
                              type="button"
                              onClick={() => onSelectMatch(match)}
                              className="font-medium text-zinc-500 hover:text-[#111827]"
                            >
                              Compare
                            </button>
                            <a
                              href={match.profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              Open profile
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-[13px] text-zinc-500">
                  No catalog entries match the selected filter.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setLocalPlatformFilter("all");
                      setMinScore(45);
                      setSortMode("similarity");
                    }}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </>
          )}

          {/* Minimal Footnote Bar */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white px-4 py-3 text-[12px] text-zinc-500">
            <span>
              Public profiles only · supports 17 social networks with live reverse-image &amp; website detection.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAddProfile}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2.5 py-1 text-[12px] font-medium text-[#111827] hover:border-indigo-300 hover:text-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Index profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
