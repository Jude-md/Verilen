"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Globe,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import type {
  ExtendedSocialPlatform,
  WebsiteProfileScanResponse,
} from "@/lib/live-types";
import { PlatformIcon } from "@/components/platform-icons";

interface WebsiteResultsProps {
  data: WebsiteProfileScanResponse;
  isScanning: boolean;
  apifyConfigured: boolean;
  onBack: () => void;
  onScanMore: (rawUrls: string, maxExtraPages: number) => void;
  onCopyHandle: (value: string) => void;
  onOpenApifySettings: () => void;
}

const PLATFORM_DISPLAY: Record<
  ExtendedSocialPlatform,
  { label: string; color: string; core?: "instagram" | "x" | "linkedin" | "tiktok" | "youtube" | "github" }
> = {
  instagram: { label: "Instagram", color: "#E1306C", core: "instagram" },
  twitter: { label: "X / Twitter", color: "#111827", core: "x" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", core: "linkedin" },
  tiktok: { label: "TikTok", color: "#111827", core: "tiktok" },
  youtube: { label: "YouTube", color: "#DC2626", core: "youtube" },
  github: { label: "GitHub", color: "#24292F", core: "github" },
  facebook: { label: "Facebook", color: "#1877F2" },
  threads: { label: "Threads", color: "#111827" },
  bluesky: { label: "Bluesky", color: "#0285FF" },
  pinterest: { label: "Pinterest", color: "#E60023" },
  reddit: { label: "Reddit", color: "#FF4500" },
  discord: { label: "Discord", color: "#5865F2" },
  telegram: { label: "Telegram", color: "#26A5E4" },
  whatsapp: { label: "WhatsApp", color: "#16A34A" },
  snapchat: { label: "Snapchat", color: "#CA8A04" },
  medium: { label: "Medium", color: "#111827" },
  mastodon: { label: "Mastodon", color: "#6364FF" },
};

const SOURCE_LABELS: Record<string, string> = {
  jsonLd: "JSON-LD",
  anchor: "Link",
  script: "Code",
};

function renderPlatformGlyph(platform: ExtendedSocialPlatform) {
  const info = PLATFORM_DISPLAY[platform];
  if (info.core) {
    return <PlatformIcon platform={info.core} className="h-4 w-4 shrink-0" colored />;
  }
  const monogram =
    platform === "facebook"
      ? "f"
      : platform === "threads"
        ? "@"
        : platform === "bluesky"
          ? "B"
          : platform === "pinterest"
          ? "P"
          : platform === "reddit"
            ? "r/"
            : platform === "discord"
              ? "D"
              : platform === "telegram"
                ? "tg"
                : platform === "whatsapp"
                  ? "W"
                  : platform === "snapchat"
                    ? "S"
                    : platform === "medium"
                      ? "M"
                      : "M";
  return (
    <span
      aria-hidden="true"
      className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
      style={{ backgroundColor: info.color }}
    >
      {monogram}
    </span>
  );
}

export function WebsiteResults({
  data,
  isScanning,
  apifyConfigured,
  onBack,
  onScanMore,
  onCopyHandle,
  onOpenApifySettings,
}: WebsiteResultsProps) {
  const [inputUrls, setInputUrls] = useState(
    data.results.map((r) => r.domain).join(", ")
  );
  const [maxExtraPages, setMaxExtraPages] = useState(2);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAlternates, setShowAlternates] = useState(false);

  function copy(key: string, val: string) {
    onCopyHandle(val);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((cur) => (cur === key ? null : cur));
    }, 1500);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = inputUrls.trim();
    if (!trimmed || isScanning) return;
    onScanMore(trimmed, maxExtraPages);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data.results, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "social-profiles.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const header = ["domain", "platform", "handle", "url", "sources", "selected"];
    const rows = [header.join(",")];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    for (const site of data.results) {
      for (const c of site.profileCandidates) {
        if (!showAlternates && !c.selected) continue;
        rows.push(
          [
            esc(site.domain),
            esc(c.platform),
            esc(c.handle),
            esc(c.url),
            esc(c.sources.join("+")),
            c.selected ? "true" : "false",
          ].join(",")
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "social-profiles.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const engineLabel =
    data.engine === "apify_server"
      ? "Apify Server Actor"
      : data.engine === "apify_actor"
        ? "Apify Actor"
        : "Built-in Live Scanner";

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-7 sm:px-6 sm:py-10">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 transition-colors hover:text-[#111827]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to scanner
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
              data.engine === "builtin_live"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-indigo-200 bg-indigo-50 text-indigo-700"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                data.engine === "builtin_live" ? "bg-emerald-500" : "bg-indigo-600"
              }`}
            />
            {engineLabel}
            {data.estimatedCostUsd > 0 && (
              <span className="font-mono-num text-indigo-600/80">
                · ~${data.estimatedCostUsd.toFixed(3)}
              </span>
            )}
          </span>

          {data.totalProfilesFound > 0 && (
            <>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
                CSV
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
                JSON
              </button>
            </>
          )}
        </div>
      </div>

      {/* Headline & Inline Batch Rescan Bar */}
      <div className="mt-5">
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.025em] text-[#111827] sm:text-[30px]">
          <span className="font-mono-num">{data.totalProfilesFound}</span> real{" "}
          {data.totalProfilesFound === 1 ? "social profile" : "social profiles"}{" "}
          found
        </h1>
        <p className="mt-1 text-[13.5px] text-zinc-500">
          Scanned <span className="font-mono-num">{data.totalUrls}</span>{" "}
          {data.totalUrls === 1 ? "website" : "websites"} across 16 platforms in{" "}
          <span className="font-mono-num">{data.durationMs}ms</span> · live HTML,
          Schema.org <code className="font-mono text-[12px]">sameAs</code> &amp;
          page code
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-5 flex flex-col gap-2 rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
            <Globe className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              type="text"
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              placeholder="Enter up to 10 domains (e.g. apify.com, stripe.com, github.com)"
              className="min-w-0 flex-1 bg-transparent py-2 text-[13.5px] text-[#111827] placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 px-1 sm:px-0">
            <label htmlFor="extra-pages" className="sr-only">
              Fallback about/contact pages
            </label>
            <select
              id="extra-pages"
              value={maxExtraPages}
              onChange={(e) => setMaxExtraPages(Number(e.target.value))}
              title="Extra contact/about pages to inspect when homepage lists no profiles"
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[12px] font-medium text-zinc-600 focus:border-indigo-500 focus:outline-none"
            >
              <option value={0}>Home only</option>
              <option value={2}>+2 contact pages</option>
              <option value={5}>+5 contact pages</option>
            </select>
            <button
              type="submit"
              disabled={isScanning || !inputUrls.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60"
            >
              {isScanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {isScanning ? "Scanning…" : "Scan sites"}
            </button>
          </div>
        </form>
      </div>

      {/* Fallback note if Apify Actor failed and we switched to built-in */}
      {data.fallbackNote && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[12.5px] text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{data.fallbackNote}</span>
        </div>
      )}

      {/* Results Per Website */}
      <div className="mt-6 space-y-5">
        {data.results.map((site) => {
          const shown = showAlternates
            ? site.profileCandidates
            : site.profileCandidates.filter((c) => c.selected);
          const extraCount = site.profileCandidates.length - site.profileCandidates.filter((c) => c.selected).length;
          const allKey = `all-${site.domain}`;

          return (
            <section
              key={site.url || site.domain}
              className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(17,24,39,0.03)]"
            >
              {/* Site Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display inline-flex items-center gap-1.5 text-[16px] font-semibold text-[#111827] hover:text-indigo-600"
                    >
                      {site.domain}
                      <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                    </a>
                    {site.httpStatus && (
                      <span className="font-mono-num rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] text-zinc-500">
                        HTTP {site.httpStatus}
                      </span>
                    )}
                  </div>
                  <p className="font-mono-num mt-0.5 text-[12px] text-zinc-400">
                    {site.profileCount}{" "}
                    {site.profileCount === 1 ? "platform" : "platforms"} ·{" "}
                    {site.pagesScanned.length}{" "}
                    {site.pagesScanned.length === 1 ? "page" : "pages"} read ·{" "}
                    {site.checkTimeMs}ms
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAlternates((v) => !v)}
                      className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11.5px] font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      {showAlternates
                        ? "Primary only"
                        : `+${extraCount} extra links`}
                    </button>
                  )}
                  {shown.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const list = shown
                          .map((c) => `${PLATFORM_DISPLAY[c.platform].label}: ${c.handle} (${c.url})`)
                          .join("\n");
                        copy(allKey, list);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-[#FAFAFA] px-2.5 py-1 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-white"
                    >
                      {copiedKey === allKey ? (
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
                  )}
                </div>
              </div>

              {/* Profiles Grid or Error */}
              <div className="p-5">
                {site.error ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-[13px] text-amber-800">
                    <span>{site.error}</span>
                    {!apifyConfigured && (site.httpStatus === 403 || site.httpStatus === 429 || site.httpStatus === 503) && (
                      <button
                        type="button"
                        onClick={onOpenApifySettings}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-[12px] font-medium text-amber-900 hover:bg-amber-50"
                      >
                        Enable Apify proxy retry
                      </button>
                    )}
                  </div>
                ) : shown.length === 0 ? (
                  <p className="text-[13px] text-zinc-500">
                    No public social profile URLs were declared in the HTML, JSON-LD{" "}
                    <code className="font-mono text-[12px]">sameAs</code>, or contact
                    pages of {site.domain}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map((item, i) => {
                      const key = `${site.domain}-${item.platform}-${i}`;
                      const copied = copiedKey === key;
                      const meta = PLATFORM_DISPLAY[item.platform];
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between gap-2.5 rounded-xl border p-3 transition-colors ${
                            item.selected
                              ? "border-zinc-200/90 bg-[#FAFAFA] hover:border-zinc-300 hover:bg-white"
                              : "border-dashed border-zinc-200 bg-white/60 opacity-85"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            {renderPlatformGlyph(item.platform)}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[12px] font-medium text-[#111827]">
                                  {meta.label}
                                </span>
                                {item.sources.map((src) => (
                                  <span
                                    key={src}
                                    className={`rounded px-1 py-0.2 text-[9.5px] font-medium ${
                                      src === "jsonLd"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : src === "script"
                                          ? "bg-indigo-50 text-indigo-700"
                                          : "bg-zinc-200/70 text-zinc-600"
                                    }`}
                                  >
                                    {SOURCE_LABELS[src] ?? src}
                                  </span>
                                ))}
                              </div>
                              <p
                                className="truncate font-mono text-[12px] text-zinc-600"
                                title={item.url}
                              >
                                {item.handle}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => copy(key, item.handle)}
                              aria-label={`Copy ${item.handle}`}
                              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-[#111827]"
                            >
                              {copied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open ${meta.label} profile ${item.handle}`}
                              className="rounded-md p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Subtle Apify upgrade callout when running on the free built-in extractor */}
      {!apifyConfigured && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
          <div className="flex items-start gap-2.5 text-[12.5px] text-zinc-600">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <p>
              Powered by{" "}
              <span className="font-mono text-[12px] text-[#111827]">
                automation-lab/social-media-profile-finder
              </span>{" "}
              adapter (built-in mode · free). Connect your Apify token for
              automatic proxy retries on blocked sites ($0.001/site on Server
              mode).
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenApifySettings}
            className="shrink-0 rounded-lg border border-zinc-200 bg-[#FAFAFA] px-3 py-1.5 text-[12.5px] font-medium text-[#111827] transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
          >
            Connect Apify
          </button>
        </div>
      )}
    </div>
  );
}
