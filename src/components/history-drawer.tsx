"use client";

import { useEffect } from "react";
import { Bookmark, Clock, Trash2, X } from "lucide-react";
import type { ScanSummaryDTO } from "@/lib/scan-service";
import { PlatformIcon } from "@/components/platform-icons";

interface HistoryDrawerProps {
  open: boolean;
  scans: ScanSummaryDTO[];
  activeScanId: string | null;
  loading: boolean;
  onClose: () => void;
  onSelectScan: (scanId: string) => void;
  onDeleteScan: (scanId: string) => void;
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "Just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function HistoryDrawer({
  open,
  scans,
  activeScanId,
  loading,
  onClose,
  onSelectScan,
  onDeleteScan,
}: HistoryDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recent image scans"
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/35 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[400px] flex-col border-l border-zinc-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[#111827]">
              Recent scans
            </h2>
            <p className="text-[12px] text-zinc-500">
              {scans.length === 0
                ? "Uploaded scans are saved here for quick access"
                : `${scans.length} saved ${scans.length === 1 ? "scan" : "scans"} · delete anytime`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recent scans"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2.5 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-zinc-100 p-2.5"
                >
                  <div className="h-14 w-12 animate-pulse rounded-lg bg-zinc-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-zinc-100" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : scans.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-400">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-[14px] font-medium text-[#111827]">
                No scans yet
              </p>
              <p className="mt-1 text-[12.5px] text-zinc-500">
                Upload a picture or try one of the sample portraits to see
                matched social handles here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {scans.map((item) => {
                const isActive = item.id === activeScanId;
                const scoreColor =
                  item.topSimilarity >= 78
                    ? "text-emerald-700 bg-emerald-50"
                    : item.topSimilarity >= 62
                      ? "text-amber-700 bg-amber-50"
                      : "text-zinc-600 bg-zinc-100";

                return (
                  <li key={item.id}>
                    <div
                      className={`group flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${
                        isActive
                          ? "border-indigo-200 bg-indigo-50/50"
                          : "border-transparent hover:border-zinc-200/80 hover:bg-[#FAFAFA]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectScan(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <img
                          src={item.imagePath}
                          alt={item.queryLabel}
                          className="h-14 w-12 shrink-0 rounded-lg bg-zinc-100 object-cover object-top ring-1 ring-black/5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] font-medium text-[#111827]">
                              {item.queryLabel}
                            </p>
                            <span
                              className={`font-mono-num shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${scoreColor}`}
                            >
                              {item.topSimilarity}%
                            </span>
                          </div>

                          {item.topHandle && item.topPlatform && (
                            <p className="mt-0.5 inline-flex max-w-full items-center gap-1 font-mono text-[11.5px] text-zinc-600">
                              <PlatformIcon
                                platform={item.topPlatform}
                                className="h-3 w-3 shrink-0"
                                colored
                              />
                              <span className="truncate">{item.topHandle}</span>
                            </p>
                          )}

                          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                            <span>{item.matchCount} matches</span>
                            <span>·</span>
                            <span>{formatRelativeTime(item.createdAt)}</span>
                            {item.savedCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5 text-indigo-600">
                                  <Bookmark className="h-2.5 w-2.5 fill-current" />
                                  {item.savedCount}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteScan(item.id)}
                        aria-label={`Delete scan ${item.queryLabel}`}
                        title="Delete scan and photo"
                        className="shrink-0 rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-600 group-hover:text-zinc-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
