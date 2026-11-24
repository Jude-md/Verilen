"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowRight, Camera, Globe, Link2, Loader2, ScanSearch, Upload, X } from "lucide-react";
import { DEMO_SAMPLES, SOCIAL_PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icons";

interface UploadStageProps {
  indexedCount: number;
  liveEnabled: boolean;
  apifyEnabled: boolean;
  isScanningWebsite: boolean;
  error: string | null;
  onClearError: () => void;
  onUploadFile: (file: File, sourceType?: "upload" | "camera") => void;
  onScanUrl: (url: string) => void;
  onScanWebsite: (rawUrls: string) => void;
  onScanSample: (sampleId: string, previewUrl: string, label: string) => void;
  onOpenCamera: () => void;
  onOpenSettings: (tab?: "apify" | "serpapi") => void;
}

export function UploadStage({
  indexedCount,
  liveEnabled,
  apifyEnabled,
  isScanningWebsite,
  error,
  onClearError,
  onUploadFile,
  onScanUrl,
  onScanWebsite,
  onScanSample,
  onOpenCamera,
  onOpenSettings,
}: UploadStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inlineMode, setInlineMode] = useState<"none" | "imageUrl" | "website">("none");
  const [urlValue, setUrlValue] = useState("");
  const [websiteValue, setWebsiteValue] = useState("");

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onClearError();
      onUploadFile(file, "upload");
    }
  }

  function handleUrlSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    onClearError();
    onScanUrl(trimmed);
  }

  function handleWebsiteSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = websiteValue.trim();
    if (!trimmed || isScanningWebsite) return;
    onClearError();
    onScanWebsite(trimmed);
  }

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      {/* Ultra-subtle soft studio spotlight over off-white ground */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(ellipse_60%_50%_at_50%_18%,rgba(79,70,229,0.055),transparent_72%)]"
      />

      <div className="relative z-10 w-full max-w-[620px]">
        {/* Crisp Editorial Headline */}
        <div className="mb-8 text-center sm:mb-9">
          <h1 className="font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#111827] sm:text-[44px]">
            Find public social profiles
            <br className="hidden sm:inline" /> from any picture.
          </h1>
          <p className="mx-auto mt-3.5 max-w-[490px] text-[15px] leading-relaxed text-[#52525B] sm:text-[16px]">
            Upload a photo to scan indexed public handles and detect exact image
            matches or visual resemblance across major social networks.
          </p>
        </div>

        {/* Precision Studio Upload Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-2xl border bg-white p-2.5 transition-all duration-200 ${
            isDragging
              ? "border-indigo-500 shadow-[0_12px_36px_-12px_rgba(79,70,229,0.22)] ring-4 ring-indigo-50"
              : "border-zinc-200/90 shadow-[0_1px_3px_rgba(17,24,39,0.04),0_10px_28px_-14px_rgba(17,24,39,0.08)]"
          }`}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload an image to scan for matching public social profiles"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors sm:py-12 ${
              isDragging
                ? "border-indigo-400 bg-indigo-50/45"
                : "border-zinc-200 bg-[#FCFCFD] hover:border-indigo-300 hover:bg-indigo-50/20"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onClearError();
                  onUploadFile(file, "upload");
                }
                e.currentTarget.value = "";
              }}
            />

            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200 ${
                isDragging
                  ? "scale-105 border-indigo-200 bg-indigo-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 shadow-xs group-hover:border-indigo-200 group-hover:text-indigo-600"
              }`}
            >
              {isDragging ? (
                <ScanSearch className="h-5 w-5" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>

            <p className="text-[15px] font-medium text-[#111827]">
              {isDragging
                ? "Release to start visual scan"
                : "Drop a portrait or photo here"}
            </p>
            <p className="mt-1 text-[13px] text-zinc-500">
              JPG, PNG, or WebP up to 10 MB · paste with{" "}
              <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">
                ⌘V
              </kbd>
            </p>

            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgba(79,70,229,0.28)] transition-colors group-hover:bg-[#4338CA]">
              <Upload className="h-3.5 w-3.5" />
              Upload image
            </span>
          </div>

          {/* Inline secondary controls bar */}
          <div className="mt-2 px-1 pb-0.5">
            {inlineMode === "imageUrl" ? (
              <form
                onSubmit={handleUrlSubmit}
                className="flex items-center gap-2 rounded-lg bg-zinc-50 p-1.5 ring-1 ring-zinc-200/90 focus-within:bg-white focus-within:ring-indigo-500"
              >
                <Link2 className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://example.com/portrait.jpg"
                  autoFocus
                  required
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#111827] placeholder:text-zinc-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#111827] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Scan
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Close image URL input"
                  onClick={() => {
                    setInlineMode("none");
                    setUrlValue("");
                  }}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : inlineMode === "website" ? (
              <form
                onSubmit={handleWebsiteSubmit}
                className="flex items-center gap-2 rounded-lg bg-zinc-50 p-1.5 ring-1 ring-zinc-200/90 focus-within:bg-white focus-within:ring-indigo-500"
              >
                <Globe className="ml-2 h-4 w-4 shrink-0 text-indigo-500" />
                <input
                  type="text"
                  value={websiteValue}
                  onChange={(e) => setWebsiteValue(e.target.value)}
                  placeholder="apify.com, stripe.com (scans 16 platforms live)"
                  autoFocus
                  required
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#111827] placeholder:text-zinc-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isScanningWebsite}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#111827] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
                >
                  {isScanningWebsite ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Scanning
                    </>
                  ) : (
                    <>
                      Find handles
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Close website scan input"
                  onClick={() => {
                    setInlineMode("none");
                    setWebsiteValue("");
                  }}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => setInlineMode("imageUrl")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-[#111827]"
                >
                  <Link2 className="h-3.5 w-3.5 text-zinc-500" />
                  Paste image URL
                </button>
                <span className="h-3.5 w-px bg-zinc-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setInlineMode("website")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-[#111827]"
                >
                  <Globe className="h-3.5 w-3.5 text-indigo-500" />
                  Scan website
                </button>
                <span className="h-3.5 w-px bg-zinc-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={onOpenCamera}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-[#111827]"
                >
                  <Camera className="h-3.5 w-3.5 text-zinc-500" />
                  Use camera
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline error feedback */}
        {error && (
          <div
            role="alert"
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/90 px-4 py-2.5 text-[13px] text-red-700"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              aria-label="Dismiss error"
              className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Single-click Sample Portraits Strip */}
        <div className="mt-7 flex flex-col items-center">
          <p className="mb-3 text-[12px] font-medium tracking-wide text-zinc-400 uppercase">
            Try a sample photo
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {DEMO_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() =>
                  onScanSample(sample.id, sample.imagePath, sample.name)
                }
                title={`Scan ${sample.name} — ${sample.hint}`}
                className="group inline-flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white py-1 pr-3.5 pl-1 text-[13px] font-medium text-zinc-700 shadow-[0_1px_2px_rgba(17,24,39,0.03)] transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:text-[#111827] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <img
                  src={sample.imagePath}
                  alt={sample.name}
                  className="h-7 w-7 rounded-full object-cover object-top ring-1 ring-black/5 transition-transform group-hover:scale-105"
                />
                <span>{sample.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quiet Trust & Indexed Platforms Footnote */}
        <div className="mt-10 flex flex-col items-center gap-2.5 text-center">
          <div className="flex items-center gap-4 text-zinc-400">
            {SOCIAL_PLATFORMS.map((platform) => (
              <span
                key={platform.id}
                title={platform.name}
                className="transition-colors hover:text-zinc-700"
              >
                <PlatformIcon platform={platform.id} className="h-[15px] w-[15px]" />
              </span>
            ))}
          </div>
          <p className="inline-flex flex-wrap items-center justify-center gap-1.5 text-[12px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>
              Live web search active across 17 platforms
              {liveEnabled ? " · Google Lens boosted" : ""}
              {apifyEnabled ? " · Apify connected" : ""}
            </span>
            <span className="text-zinc-300">·</span>
            <button
              type="button"
              onClick={() => onOpenSettings("apify")}
              className="text-zinc-400 transition-colors hover:text-indigo-600"
              title={`${indexedCount} profiles also stored in local index`}
            >
              API boost
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
