"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Columns2,
  Copy,
  Flag,
  MapPin,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import type { ScanMatchDTO } from "@/lib/scan-service";
import {
  formatFollowerCount,
  getMatchBadgeStyle,
  PLATFORM_MAP,
} from "@/lib/platforms";
import { PlatformIcon, VerifiedBadge } from "@/components/platform-icons";

interface CompareModalProps {
  match: ScanMatchDTO | null;
  queryImageUrl: string;
  queryLabel: string;
  onClose: () => void;
  onToggleSave: (match: ScanMatchDTO) => void;
  onToggleFlag: (match: ScanMatchDTO) => void;
  onCopyHandle: (handle: string) => void;
}

export function CompareModal({
  match,
  queryImageUrl,
  queryLabel,
  onClose,
  onToggleSave,
  onToggleFlag,
  onCopyHandle,
}: CompareModalProps) {
  const [viewMode, setViewMode] = useState<"side" | "overlay">("side");
  const [splitPos, setSplitPos] = useState(50);
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match, onClose]);

  if (!match) return null;

  const platform = PLATFORM_MAP[match.platform];
  const badge = getMatchBadgeStyle(match.similarityScore, match.matchType);

  function copy(value: string) {
    onCopyHandle(value);
    setCopiedHandle(value);
    window.setTimeout(() => {
      setCopiedHandle((prev) => (prev === value ? null : prev));
    }, 1500);
  }

  const metrics = [
    { label: "Facial framing", value: match.facialScore },
    { label: "Perceptual hash", value: match.structuralScore },
    { label: "Tone & lighting", value: match.toneScore },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      >
        {/* Top Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <PlatformIcon
              platform={match.platform}
              className="h-4 w-4 shrink-0"
              colored
            />
            <h2
              id="compare-modal-title"
              className="font-display truncate text-[17px] font-semibold text-[#111827]"
            >
              {match.displayName}
            </h2>
            {match.verified && <VerifiedBadge className="h-4 w-4 shrink-0" />}
            <span
              className={`font-mono-num hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium sm:inline-flex ${badge.bgClass} ${badge.textClass} ${badge.ringClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
              {match.similarityScore}% · {badge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="hidden rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 sm:inline-flex">
              <button
                type="button"
                onClick={() => setViewMode("side")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                  viewMode === "side"
                    ? "bg-white text-[#111827] shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Columns2 className="h-3 w-3" />
                Side by side
              </button>
              <button
                type="button"
                onClick={() => setViewMode("overlay")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                  viewMode === "overlay"
                    ? "bg-white text-[#111827] shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                Split check
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison dialog"
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Visual Comparison Surface */}
        <div className="p-5 sm:p-6">
          {viewMode === "side" ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <div className="relative aspect-[4/4.6] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                  <img
                    src={queryImageUrl}
                    alt={queryLabel}
                    className="h-full w-full object-cover object-top"
                  />
                  <span className="absolute bottom-2.5 left-2.5 rounded-md bg-zinc-900/75 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                    Uploaded photo
                  </span>
                </div>
              </div>
              <div>
                <div className="relative aspect-[4/4.6] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                  <img
                    src={match.avatarPath}
                    alt={`${match.displayName} on ${platform.name}`}
                    className="h-full w-full object-cover object-top"
                  />
                  <span className="absolute bottom-2.5 left-2.5 rounded-md bg-white/92 px-2 py-0.5 text-[11px] font-medium text-[#111827] shadow-xs backdrop-blur-sm">
                    {platform.shortName} profile
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[380px]">
              <div className="relative aspect-[4/4.6] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 select-none">
                <img
                  src={match.avatarPath}
                  alt={match.displayName}
                  className="h-full w-full object-cover object-top"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                >
                  <img
                    src={queryImageUrl}
                    alt={queryLabel}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.45)]"
                  style={{ left: `${splitPos}%` }}
                />
                <span className="absolute bottom-2.5 left-2.5 rounded-md bg-zinc-900/75 px-2 py-0.5 text-[10.5px] font-medium text-white">
                  Uploaded
                </span>
                <span className="absolute right-2.5 bottom-2.5 rounded-md bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-[#111827]">
                  {platform.shortName}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[11px] text-zinc-400">Query</span>
                <input
                  type="range"
                  aria-label="Blend between uploaded photo and matched portrait"
                  min={0}
                  max={100}
                  value={splitPos}
                  onChange={(e) => setSplitPos(Number(e.target.value))}
                  className="studio-range flex-1"
                />
                <span className="text-[11px] text-zinc-400">Match</span>
              </div>
            </div>
          )}

          {/* Computed Similarity Breakdown */}
          <div className="mt-5 rounded-xl border border-zinc-200/80 bg-[#FAFAFA] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12.5px] text-zinc-600">{match.matchReason}</p>
              <span className={`font-mono-num text-[13px] font-semibold ${badge.textClass}`}>
                {match.similarityScore}% overall
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg bg-white p-2.5 ring-1 ring-zinc-200/70">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-zinc-500">{m.label}</span>
                    <span className="font-mono-num font-semibold text-[#111827]">
                      {m.value}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        m.value >= 78
                          ? "bg-emerald-500"
                          : m.value >= 62
                            ? "bg-amber-500"
                            : "bg-zinc-400"
                      }`}
                      style={{ width: `${m.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Public Profile Details & Primary Actions */}
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => copy(match.handle)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-[13px] font-medium text-[#111827] transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  {match.handle}
                  {copiedHandle === match.handle ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                </button>

                {match.followersCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
                    <Users className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="font-mono-num">
                      {formatFollowerCount(match.followersCount)}
                    </span>{" "}
                    followers
                  </span>
                )}

                {match.location && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                    {match.location}
                  </span>
                )}
              </div>

              {match.bio && (
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-zinc-600">
                  {match.bio}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleSave(match)}
                aria-pressed={match.isSaved}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                  match.isSaved
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${match.isSaved ? "fill-current" : ""}`}
                />
                {match.isSaved ? "Saved" : "Save"}
              </button>

              <a
                href={match.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#4338CA]"
              >
                Open {platform.shortName}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Also Linked On — Cross-platform social handles for the same subject */}
          {match.linkedAccounts.length > 0 && (
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <p className="mb-2.5 text-[11.5px] font-medium tracking-wide text-zinc-400 uppercase">
                Other public handles for {match.displayName}
              </p>
              <div className="flex flex-wrap gap-2">
                {match.linkedAccounts.map((acct) => (
                  <div
                    key={acct.id}
                    className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-white text-[12px]"
                  >
                    <a
                      href={acct.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#111827]"
                    >
                      <PlatformIcon
                        platform={acct.platform}
                        className="h-3.5 w-3.5"
                        colored
                      />
                      <span className="font-mono text-[11.5px]">
                        {acct.handle}
                      </span>
                      <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                    </a>
                    <button
                      type="button"
                      onClick={() => copy(acct.handle)}
                      aria-label={`Copy ${acct.handle}`}
                      className="border-l border-zinc-100 px-2 py-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                    >
                      {copiedHandle === acct.handle ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subtle mismatch flag footer */}
          <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-3 text-[11.5px] text-zinc-400">
            <span>Public directory profile · {platform.domain}</span>
            <button
              type="button"
              onClick={() => onToggleFlag(match)}
              aria-pressed={match.isFlagged}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
                match.isFlagged
                  ? "bg-amber-50 text-amber-700"
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              }`}
            >
              <Flag className="h-3 w-3" />
              {match.isFlagged ? "Flagged as unrelated" : "Not the same person?"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
