"use client";

import { useEffect, useState } from "react";
import { SOCIAL_PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icons";

interface ScanningViewProps {
  previewUrl: string | null;
  queryLabel: string;
}

const STEPS = [
  "Searching the live open web for this picture",
  "Finding matching & visually similar social profiles",
  "Resolving linked handles across 17 networks",
  "Enriching matched websites & scoring similarity",
];

export function ScanningView({ previewUrl, queryLabel }: ScanningViewProps) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStepIdx((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 850);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      aria-live="polite"
      className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12"
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {/* Framed Uploaded Image with Optical Precision Scan Beam */}
        <div className="relative aspect-[4/5] w-60 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_14px_40px_-16px_rgba(17,24,39,0.16)] sm:w-64">
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-zinc-100">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Scanning ${queryLabel}`}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400">
                Fetching remote image...
              </div>
            )}

            {/* Subtle tint & corner optical reticles */}
            <div className="pointer-events-none absolute inset-0 bg-indigo-950/[0.04]" />
            <div className="pointer-events-none absolute inset-5">
              <span className="absolute top-0 left-0 h-4 w-4 rounded-tl border-t-2 border-l-2 border-white/90 drop-shadow" />
              <span className="absolute top-0 right-0 h-4 w-4 rounded-tr border-t-2 border-r-2 border-white/90 drop-shadow" />
              <span className="absolute bottom-0 left-0 h-4 w-4 rounded-bl border-b-2 border-l-2 border-white/90 drop-shadow" />
              <span className="absolute right-0 bottom-0 h-4 w-4 rounded-br border-r-2 border-b-2 border-white/90 drop-shadow" />
            </div>

            {/* Animated vertical scanning line */}
            <div className="animate-optical-scan pointer-events-none absolute inset-x-0">
              <div className="h-[2px] w-full bg-indigo-500 shadow-[0_0_12px_2px_rgba(79,70,229,0.75)]" />
              <div className="h-10 w-full bg-gradient-to-b from-indigo-500/20 to-transparent" />
            </div>
          </div>
        </div>

        {/* Minimal Status Text */}
        <div className="mt-7 flex items-center gap-2 text-[15px] font-medium text-[#111827]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live scanning public profiles
        </div>
        <p className="mt-1.5 text-[13px] text-zinc-500 transition-opacity duration-200">
          {STEPS[stepIdx]}
        </p>

        {/* Quiet Social Network Pulse Strip */}
        <div className="mt-6 flex items-center gap-2.5">
          {SOCIAL_PLATFORMS.map((platform, idx) => {
            const active = idx <= stepIdx + 2;
            return (
              <div
                key={platform.id}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300 ${
                  active
                    ? "border-indigo-200 bg-white text-[#111827] shadow-2xs"
                    : "border-zinc-200/70 bg-zinc-50 text-zinc-300"
                }`}
              >
                <PlatformIcon platform={platform.id} className="h-3.5 w-3.5" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
