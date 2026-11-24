"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Plus, Radio } from "lucide-react";
import type {
  ScanMatchDTO,
  ScanResultDTO,
  ScanSummaryDTO,
} from "@/lib/scan-service";
import { VeriLensLogo } from "@/components/platform-icons";
import { UploadStage } from "@/components/upload-stage";
import { ScanningView } from "@/components/scanning-view";
import { ResultsWorkspace } from "@/components/results-workspace";
import { CompareModal } from "@/components/compare-modal";
import { HistoryDrawer } from "@/components/history-drawer";
import type {
  ProviderSettingsDTO,
  WebsiteProfileScanResponse,
} from "@/lib/live-types";
import { AddProfileModal } from "@/components/add-profile-modal";
import { CameraModal } from "@/components/camera-modal";
import { SettingsModal } from "@/components/settings-modal";
import { WebsiteResults } from "@/components/website-results";

interface VeriLensAppProps {
  initialIndexedCount: number;
  initialRecentScans: ScanSummaryDTO[];
  initialScan: ScanResultDTO | null;
  initialSettings: ProviderSettingsDTO;
  databaseReady?: boolean;
}

const MIN_SCAN_ANIMATION_MS = 1050;

export function VeriLensApp({
  initialIndexedCount,
  initialRecentScans,
  initialScan,
  initialSettings,
  databaseReady = true,
}: VeriLensAppProps) {
  const [indexedCount, setIndexedCount] = useState(initialIndexedCount);
  const [recentScans, setRecentScans] =
    useState<ScanSummaryDTO[]>(initialRecentScans);
  const [activeScan, setActiveScan] = useState<ScanResultDTO | null>(
    initialScan
  );
  const [scanningPreview, setScanningPreview] = useState<{
    url: string | null;
    label: string;
    revokeOnDone?: boolean;
  } | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"apify" | "serpapi">("apify");
  const [providerSettings, setProviderSettings] =
    useState<ProviderSettingsDTO>(initialSettings);
  const [websiteScan, setWebsiteScan] =
    useState<WebsiteProfileScanResponse | null>(null);
  const [isScanningWebsite, setIsScanningWebsite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const serpConfigured = providerSettings.serpapi.configured;
  const apifyConfigured = providerSettings.apify.configured;

  const openSettings = useCallback((tab: "apify" | "serpapi" = "apify") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const syncUrlScanParam = useCallback((scanId: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (scanId) url.searchParams.set("scan", scanId);
    else url.searchParams.delete("scan");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const refreshHistory = useCallback(async (withSpinner = false) => {
    if (withSpinner) setHistoryLoading(true);
    try {
      const res = await fetch("/api/scans", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.scans)) setRecentScans(data.scans);
      if (typeof data.indexedProfiles === "number") {
        setIndexedCount(data.indexedProfiles);
      }
    } catch {
      // ignore offline transient
    } finally {
      if (withSpinner) setHistoryLoading(false);
    }
  }, []);

  const runWithMinimumDelay = useCallback(
    async (
      preview: { url: string | null; label: string; revokeOnDone?: boolean },
      runner: () => Promise<Response>
    ) => {
      setError(null);
      setSelectedMatchId(null);
      setScanningPreview(preview);
      const started = Date.now();

      try {
        const res = await runner();
        const data = await res.json();

        if (!res.ok) {
          setError(data?.error ?? "Unable to complete scan. Please try another image.");
          return;
        }

        const elapsed = Date.now() - started;
        if (elapsed < MIN_SCAN_ANIMATION_MS) {
          await new Promise((r) =>
            window.setTimeout(r, MIN_SCAN_ANIMATION_MS - elapsed)
          );
        }

        const scan = data.scan as ScanResultDTO;
        setWebsiteScan(null);
        setActiveScan(scan);
        syncUrlScanParam(scan.id);
        refreshHistory(false);
      } catch {
        setError("Network error while scanning image. Please try again.");
      } finally {
        if (preview.revokeOnDone && preview.url) {
          URL.revokeObjectURL(preview.url);
        }
        setScanningPreview(null);
      }
    },
    [refreshHistory, syncUrlScanParam]
  );

  const handleUploadFile = useCallback(
    (file: File, sourceType: "upload" | "camera" = "upload") => {
      if (file.size > 10 * 1024 * 1024) {
        setError("Image exceeds the 10 MB limit. Choose a smaller photo.");
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("sourceType", sourceType);
      runWithMinimumDelay(
        { url: objectUrl, label: file.name || "Uploaded image", revokeOnDone: true },
        () => fetch("/api/scans", { method: "POST", body: fd })
      );
    },
    [runWithMinimumDelay]
  );

  const handleScanUrl = useCallback(
    (imageUrl: string) => {
      runWithMinimumDelay(
        { url: imageUrl, label: imageUrl },
        () =>
          fetch("/api/scans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl }),
          })
      );
    },
    [runWithMinimumDelay]
  );

  const handleScanSample = useCallback(
    (sampleId: string, previewUrl: string, label: string) => {
      runWithMinimumDelay(
        { url: previewUrl, label },
        () =>
          fetch("/api/scans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sampleId }),
          })
      );
    },
    [runWithMinimumDelay]
  );

  const handleScanWebsite = useCallback(
    async (rawUrls: string, maxExtraPages = 2) => {
      setError(null);
      setIsScanningWebsite(true);
      try {
        const res = await fetch("/api/website-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: rawUrls, maxExtraPages }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Unable to scan website profiles.");
          return;
        }
        setActiveScan(null);
        syncUrlScanParam(null);
        setWebsiteScan(data as WebsiteProfileScanResponse);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setError("Network error while scanning website profiles.");
      } finally {
        setIsScanningWebsite(false);
      }
    },
    [syncUrlScanParam]
  );

  // Allow instant Cmd+V / Ctrl+V clipboard paste of any image on landing stage
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeScan || scanningPreview || addProfileOpen || historyOpen || cameraOpen) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            handleUploadFile(blob, "upload");
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [activeScan, scanningPreview, addProfileOpen, historyOpen, cameraOpen, handleUploadFile]);

  const handleOpenHistoricalScan = useCallback(
    async (scanId: string) => {
      setHistoryOpen(false);
      setError(null);
      try {
        const res = await fetch(`/api/scans/${encodeURIComponent(scanId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          showToast("Scan not found");
          return;
        }
        const data = await res.json();
        setWebsiteScan(null);
        setActiveScan(data.scan as ScanResultDTO);
        syncUrlScanParam(scanId);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        showToast("Unable to open scan");
      }
    },
    [showToast, syncUrlScanParam]
  );

  const handleRescan = useCallback(async () => {
    if (!activeScan || isRescanning) return;
    setIsRescanning(true);
    try {
      const res = await fetch(
        `/api/scans/${encodeURIComponent(activeScan.id)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        showToast("Unable to re-scan right now");
        return;
      }
      const data = await res.json();
      const refreshed = data.scan as ScanResultDTO;
      setActiveScan(refreshed);
      syncUrlScanParam(refreshed.id);
      refreshHistory(false);
      showToast(`Re-scanned against ${refreshed.profilesScanned} profiles`);
    } catch {
      showToast("Re-scan failed");
    } finally {
      setIsRescanning(false);
    }
  }, [activeScan, isRescanning, refreshHistory, showToast, syncUrlScanParam]);

  const handleDeleteScan = useCallback(
    async (scanId: string) => {
      try {
        const res = await fetch(`/api/scans/${encodeURIComponent(scanId)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          showToast("Failed to delete scan");
          return;
        }
        setRecentScans((prev) => prev.filter((s) => s.id !== scanId));
        if (activeScan?.id === scanId) {
          setActiveScan(null);
          setSelectedMatchId(null);
          syncUrlScanParam(null);
        }
        showToast("Scan and uploaded photo deleted");
      } catch {
        showToast("Failed to delete scan");
      }
    },
    [activeScan, showToast, syncUrlScanParam]
  );

  const handleToggleSave = useCallback(
    async (match: ScanMatchDTO) => {
      if (!activeScan) return;
      const next = !match.isSaved;

      // Optimistic toggle
      setActiveScan((prev) =>
        prev
          ? {
              ...prev,
              matches: prev.matches.map((m) =>
                m.id === match.id ? { ...m, isSaved: next } : m
              ),
            }
          : prev
      );

      try {
        const res = await fetch(
          `/api/scans/${encodeURIComponent(activeScan.id)}/matches/${match.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isSaved: next }),
          }
        );
        if (!res.ok) throw new Error("fail");
        showToast(next ? `Saved ${match.handle}` : `Removed ${match.handle}`);
        refreshHistory(false);
      } catch {
        // Revert
        setActiveScan((prev) =>
          prev
            ? {
                ...prev,
                matches: prev.matches.map((m) =>
                  m.id === match.id ? { ...m, isSaved: !next } : m
                ),
              }
            : prev
        );
        showToast("Could not update bookmark");
      }
    },
    [activeScan, refreshHistory, showToast]
  );

  const handleToggleFlag = useCallback(
    async (match: ScanMatchDTO) => {
      if (!activeScan) return;
      const next = !match.isFlagged;

      setActiveScan((prev) =>
        prev
          ? {
              ...prev,
              matches: prev.matches.map((m) =>
                m.id === match.id ? { ...m, isFlagged: next } : m
              ),
            }
          : prev
      );

      try {
        const res = await fetch(
          `/api/scans/${encodeURIComponent(activeScan.id)}/matches/${match.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFlagged: next }),
          }
        );
        if (!res.ok) throw new Error("fail");
        showToast(
          next ? "Marked as unrelated match" : "Removed mismatch flag"
        );
      } catch {
        setActiveScan((prev) =>
          prev
            ? {
                ...prev,
                matches: prev.matches.map((m) =>
                  m.id === match.id ? { ...m, isFlagged: !next } : m
                ),
              }
            : prev
        );
      }
    },
    [activeScan, showToast]
  );

  const handleCopyHandle = useCallback(
    (handle: string) => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(handle).catch(() => undefined);
      }
      showToast(`Copied ${handle}`);
    },
    [showToast]
  );

  const handleResetToUpload = useCallback(() => {
    setActiveScan(null);
    setWebsiteScan(null);
    setSelectedMatchId(null);
    setError(null);
    syncUrlScanParam(null);
  }, [syncUrlScanParam]);

  const selectedMatch =
    activeScan?.matches.find((m) => m.id === selectedMatchId) ?? null;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111827]">
      {/* Minimal Precision Studio Top Header */}
      <header className="sticky top-0 z-30 h-16 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={handleResetToUpload}
            className="inline-flex items-center gap-2.5 text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <VeriLensLogo className="h-7 w-7" />
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[#111827]">
              VeriLens
            </span>
          </button>

          <nav aria-label="Primary" className="flex items-center gap-1.5 sm:gap-2">
            {(activeScan || websiteScan) && !scanningPreview && (
              <button
                type="button"
                onClick={handleResetToUpload}
                className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-[#111827] sm:inline-flex"
              >
                New scan
              </button>
            )}

            <button
              type="button"
              onClick={() => openSettings("apify")}
              title={
                serpConfigured && apifyConfigured
                  ? "Live web search + Google Lens + Apify Actor active"
                  : serpConfigured
                    ? "Live web search + Google Lens active"
                    : apifyConfigured
                      ? "Live web search + Apify Actor active"
                      : "Live open-web search is active automatically (no key required) — click for optional API boosts"
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/90 bg-emerald-50/70 px-2.5 py-1.5 text-[12.5px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100/75"
            >
              <Radio className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">
                {serpConfigured && apifyConfigured
                  ? "Live + APIs"
                  : serpConfigured
                    ? "Live + Lens"
                    : apifyConfigured
                      ? "Live + Apify"
                      : "Live search"}
              </span>
              <span className="sm:hidden">Live</span>
            </button>

            <button
              type="button"
              onClick={() => setAddProfileOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-[#111827]"
            >
              <Plus className="h-3.5 w-3.5 text-zinc-500" />
              <span className="hidden sm:inline">Index profile</span>
              <span className="sm:hidden">Index</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHistoryOpen(true);
                refreshHistory(recentScans.length === 0);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-[#111827] transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              <span>History</span>
              {recentScans.length > 0 && (
                <span className="font-mono-num ml-0.5 rounded-full bg-zinc-100 px-1.5 py-0.2 text-[11px] text-zinc-600">
                  {recentScans.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Deployment setup notice — app stays fully usable without persistence */}
      {!databaseReady && (
        <div className="border-b border-amber-200/80 bg-amber-50/80">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12.5px] sm:px-6 lg:px-8">
            <p className="text-amber-800">
              <span className="font-medium">Live search is active.</span>{" "}
              Scan history, bookmarks and the demo catalog need a database — add{" "}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[11.5px]">
                DATABASE_URL
              </code>{" "}
              in your host&apos;s environment variables, then redeploy.
            </p>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
            >
              View status
            </a>
          </div>
        </div>
      )}

      {/* Main Focused Application Stage */}
      <main>
        {scanningPreview ? (
          <ScanningView
            previewUrl={scanningPreview.url}
            queryLabel={scanningPreview.label}
          />
        ) : websiteScan ? (
          <WebsiteResults
            data={websiteScan}
            isScanning={isScanningWebsite}
            apifyConfigured={apifyConfigured}
            onBack={handleResetToUpload}
            onScanMore={(raw, pages) => handleScanWebsite(raw, pages)}
            onCopyHandle={handleCopyHandle}
            onOpenApifySettings={() => openSettings("apify")}
          />
        ) : activeScan ? (
          <ResultsWorkspace
            scan={activeScan}
            isRescanning={isRescanning}
            onNewScan={handleResetToUpload}
            onRescan={handleRescan}
            onDeleteScan={handleDeleteScan}
            key={activeScan.id}
            onSelectMatch={(m) => setSelectedMatchId(m.id)}
            onToggleSave={handleToggleSave}
            onCopyHandle={handleCopyHandle}
            onScanDomain={(d) => handleScanWebsite(d, 2)}
            onOpenAddProfile={() => setAddProfileOpen(true)}
            onOpenSettings={(tab) => openSettings(tab ?? "apify")}
          />
        ) : (
          <UploadStage
            indexedCount={indexedCount}
            liveEnabled={serpConfigured}
            apifyEnabled={apifyConfigured}
            isScanningWebsite={isScanningWebsite}
            error={error}
            onClearError={() => setError(null)}
            onUploadFile={handleUploadFile}
            onScanUrl={handleScanUrl}
            onScanWebsite={(raw) => handleScanWebsite(raw, 2)}
            onScanSample={handleScanSample}
            onOpenCamera={() => setCameraOpen(true)}
            onOpenSettings={(tab) => openSettings(tab ?? "apify")}
          />
        )}
      </main>

      {/* Side-by-Side Comparison Modal */}
      {selectedMatch && (
        <CompareModal
          key={selectedMatch.id}
          match={selectedMatch}
          queryImageUrl={activeScan?.imagePath ?? ""}
          queryLabel={activeScan?.queryLabel ?? ""}
          onClose={() => setSelectedMatchId(null)}
          onToggleSave={handleToggleSave}
          onToggleFlag={handleToggleFlag}
          onCopyHandle={handleCopyHandle}
        />
      )}

      {/* Slide-Over Persisted History Drawer */}
      <HistoryDrawer
        open={historyOpen}
        scans={recentScans}
        activeScanId={activeScan?.id ?? null}
        loading={historyLoading}
        onClose={() => setHistoryOpen(false)}
        onSelectScan={handleOpenHistoricalScan}
        onDeleteScan={handleDeleteScan}
      />

      {/* Index a New Public Social Profile Modal */}
      {addProfileOpen && (
        <AddProfileModal
          open={addProfileOpen}
          onClose={() => setAddProfileOpen(false)}
          onProfileAdded={(profile, uploadedFile) => {
            setIndexedCount((c) => c + 1);
            showToast(`Indexed ${profile.handle}`);
            if (uploadedFile) {
              handleUploadFile(uploadedFile, "upload");
            }
          }}
          onProfileDeleted={() => {
            setIndexedCount((c) => Math.max(0, c - 1));
            showToast("Removed profile from index");
          }}
        />
      )}

      {/* Live Browser Camera Modal */}
      {cameraOpen && (
        <CameraModal
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => handleUploadFile(file, "camera")}
        />
      )}

      {/* Live Web Search API Settings Modal (Apify + SerpApi) */}
      {settingsOpen && (
        <SettingsModal
          key={settingsTab}
          open={settingsOpen}
          initialTab={settingsTab}
          settings={providerSettings}
          onClose={() => setSettingsOpen(false)}
          onUpdated={(next, msg) => {
            setProviderSettings(next);
            showToast(msg);
          }}
        />
      )}

      {/* Crisp Minimal Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-[#111827] px-4 py-2 text-[12.5px] font-medium text-white shadow-lg">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
