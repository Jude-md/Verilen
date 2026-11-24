"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  ScanSearch,
  SearchCheck,
  X,
} from "lucide-react";
import type { ProviderSettingsDTO } from "@/lib/live-types";

interface SettingsModalProps {
  open: boolean;
  initialTab?: "serpapi" | "apify";
  settings: ProviderSettingsDTO;
  onClose: () => void;
  onUpdated: (next: ProviderSettingsDTO, toastMessage: string) => void;
}

export function SettingsModal({
  open,
  initialTab = "apify",
  settings,
  onClose,
  onUpdated,
}: SettingsModalProps) {
  const [tab, setTab] = useState<"serpapi" | "apify">(initialTab);

  // SerpApi form fields
  const [serpKey, setSerpKey] = useState("");
  const [showSerp, setShowSerp] = useState(false);

  // Apify form fields
  const [apifyToken, setApifyToken] = useState("");
  const [showApify, setShowApify] = useState(false);
  const [serverUrl, setServerUrl] = useState(settings.apify.serverUrl ?? "");

  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function runAction(
    provider: "serpapi" | "apify",
    action: "save" | "test" | "clear"
  ) {
    setBusy(action);
    setFeedback(null);
    try {
      const payload: Record<string, string> = { provider, action };
      if (provider === "serpapi" && action !== "clear") {
        payload.apiKey = serpKey.trim();
      }
      if (provider === "apify" && action !== "clear") {
        payload.apiKey = apifyToken.trim();
        payload.serverUrl = serverUrl.trim();
      }

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedback({ ok: false, text: data?.error ?? "Request failed." });
        return;
      }

      const nextSettings: ProviderSettingsDTO = {
        builtinLive: data.builtinLive ?? settings.builtinLive,
        serpapi: data.serpapi ?? settings.serpapi,
        apify: data.apify ?? settings.apify,
      };

      if (action === "test") {
        setFeedback({ ok: Boolean(data.ok), text: String(data.message ?? "") });
        return;
      }

      if (provider === "serpapi") setSerpKey("");
      if (provider === "apify") {
        setApifyToken("");
        setServerUrl(nextSettings.apify.serverUrl ?? "");
      }

      const msg = String(data.message ?? "Updated.");
      setFeedback({ ok: true, text: msg });
      onUpdated(nextSettings, msg);
    } catch {
      setFeedback({ ok: false, text: "Network error — please try again." });
    } finally {
      setBusy(null);
    }
  }

  function handleSaveSerp(e: FormEvent) {
    e.preventDefault();
    if (!serpKey.trim()) {
      setFeedback({ ok: false, text: "Paste your SerpApi API key first." });
      return;
    }
    runAction("serpapi", "save");
  }

  function handleSaveApify(e: FormEvent) {
    e.preventDefault();
    if (!apifyToken.trim() && !settings.apify.configured) {
      setFeedback({
        ok: false,
        text: "Paste your personal Apify API token (from Apify Console → Integrations).",
      });
      return;
    }
    runAction("apify", "save");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-[580px] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div>
            <h2
              id="settings-title"
              className="font-display text-[17px] font-semibold text-[#111827]"
            >
              Live search engine
            </h2>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">
              Live reverse-image search &amp; 17-platform handle lookup are already{" "}
              <span className="font-medium text-emerald-700">active automatically</span>{" "}
              with no key needed. Add optional tokens below to unlock extra engines.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Clean Two-Provider Tab Selector */}
        <div className="border-b border-zinc-100 px-6 pt-3">
          <div className="flex gap-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "apify"}
              onClick={() => {
                setTab("apify");
                setFeedback(null);
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 text-[13px] font-medium transition-colors ${
                tab === "apify"
                  ? "border-indigo-600 text-[#111827]"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Apify Profile Finder</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  settings.apify.configured ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={tab === "serpapi"}
              onClick={() => {
                setTab("serpapi");
                setFeedback(null);
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 text-[13px] font-medium transition-colors ${
                tab === "serpapi"
                  ? "border-indigo-600 text-[#111827]"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <ScanSearch className="h-3.5 w-3.5" />
              <span>Google Lens (Photos)</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  settings.serpapi.configured ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {tab === "apify" ? (
            <>
              {/* Apify Status Banner */}
              <div
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  settings.apify.configured
                    ? "border-emerald-200 bg-emerald-50/70"
                    : "border-zinc-200 bg-[#FAFAFA]"
                }`}
              >
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    settings.apify.configured ? "text-emerald-600" : "text-indigo-600"
                  }`}
                />
                <div className="min-w-0 text-[12.5px]">
                  <p className="font-medium text-[#111827]">
                    {settings.apify.configured
                      ? `Apify connected · ${settings.apify.maskedToken}${
                          settings.apify.source === "env"
                            ? ` (from ${settings.apify.envName})`
                            : ""
                        }`
                      : "Built-in live website scanner active (no key required)"}
                  </p>
                  <p className="mt-0.5 leading-relaxed text-zinc-600">
                    Actor:{" "}
                    <code className="font-mono text-[11.5px] text-zinc-800">
                      automation-lab/social-media-profile-finder
                    </code>{" "}
                    — extracts real social handles across 16 platforms from websites
                    (HTML, JSON-LD <code className="font-mono text-[11px]">sameAs</code>,
                    page code + contact pages) and auto-enriches domains found during
                    image scans. Connect a token for Apify Proxy retry on blocked sites.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveApify} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="apify-token"
                    className="mb-1.5 block text-[12.5px] font-medium text-zinc-700"
                  >
                    Apify API token
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 focus-within:border-indigo-500">
                    <input
                      id="apify-token"
                      type={showApify ? "text" : "password"}
                      value={apifyToken}
                      onChange={(e) => setApifyToken(e.target.value)}
                      placeholder={
                        settings.apify.configured
                          ? `${settings.apify.maskedToken} (connected)`
                          : "apify_api_••••••••••••••••"
                      }
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-[13px] text-[#111827] placeholder:text-zinc-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApify((v) => !v)}
                      aria-label={showApify ? "Hide token" : "Show token"}
                      className="rounded p-1.5 text-zinc-400 hover:text-zinc-700"
                    >
                      {showApify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-zinc-500">
                    Copy your personal token from{" "}
                    <a
                      href="https://console.apify.com/settings/integrations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Apify Console → API &amp; Integrations
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    . Verified for free via <code className="font-mono">/v2/users/me</code>.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="apify-server-url"
                    className="mb-1.5 block text-[12px] font-medium text-zinc-600"
                  >
                    Standby Server URL{" "}
                    <span className="font-normal text-zinc-400">
                      (optional — skips $0.035 run start fee)
                    </span>
                  </label>
                  <input
                    id="apify-server-url"
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://…apify.actor (from the Actor's Server tab)"
                    autoComplete="off"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-[12.5px] text-[#111827] placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {feedback && (
                  <p
                    className={`rounded-lg border px-3 py-2 text-[12.5px] ${
                      feedback.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {feedback.text}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60"
                    >
                      {busy === "save" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <SearchCheck className="h-3.5 w-3.5" />
                      )}
                      Verify &amp; save
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction("apify", "test")}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {busy === "test" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Test token
                    </button>
                  </div>

                  {settings.apify.configured && settings.apify.source === "dotenv" && (
                    <button
                      type="button"
                      onClick={() => runAction("apify", "clear")}
                      disabled={busy !== null}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-[12.5px] font-medium text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </form>

              {/* Transparent Apify Pay-Per-Event Pricing Summary */}
              <div className="rounded-xl border border-zinc-200/80 bg-[#FAFAFA] px-4 py-3 text-[12px] text-zinc-600">
                <p className="font-medium text-[#111827]">Apify pay-per-event pricing</p>
                <p className="mt-1 leading-relaxed">
                  Normal batch run: <span className="font-mono-num">$0.035</span> start +{" "}
                  <span className="font-mono-num">$0.001</span>/website scanned. Standby
                  Server mode: <span className="font-mono-num">$0.001</span>/website (no start
                  fee). Built-in mode without a token: <span className="font-medium text-emerald-700">$0.00</span>.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* SerpApi Status */}
              <div
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  settings.serpapi.configured
                    ? "border-emerald-200 bg-emerald-50/70"
                    : "border-amber-200 bg-amber-50/70"
                }`}
              >
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    settings.serpapi.configured ? "text-emerald-600" : "text-amber-600"
                  }`}
                />
                <div className="min-w-0 text-[12.5px]">
                  <p
                    className={`font-medium ${
                      settings.serpapi.configured ? "text-emerald-900" : "text-amber-900"
                    }`}
                  >
                    {settings.serpapi.configured
                      ? `Google Lens live · ${settings.serpapi.maskedKey}${
                          settings.serpapi.source === "env"
                            ? ` (from ${settings.serpapi.envName})`
                            : ""
                        }`
                      : "Optional boost — built-in live photo search is already active"}
                  </p>
                  <p
                    className={`mt-0.5 leading-relaxed ${
                      settings.serpapi.configured ? "text-emerald-700" : "text-amber-800"
                    }`}
                  >
                    VeriLens already scans real open-web matches, GitHub, Bluesky,
                    Wikidata &amp; personal websites with zero key. Adding a SerpApi key
                    also merges Google Lens matches in parallel for extra coverage.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSerp} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="serpapi-key"
                    className="mb-1.5 block text-[12.5px] font-medium text-zinc-700"
                  >
                    SerpApi API key
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 focus-within:border-indigo-500">
                    <input
                      id="serpapi-key"
                      type={showSerp ? "text" : "password"}
                      value={serpKey}
                      onChange={(e) => setSerpKey(e.target.value)}
                      placeholder={
                        settings.serpapi.configured
                          ? `${settings.serpapi.maskedKey} (connected)`
                          : "Paste your private SerpApi key"
                      }
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-[13px] text-[#111827] placeholder:text-zinc-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSerp((v) => !v)}
                      aria-label={showSerp ? "Hide key" : "Show key"}
                      className="rounded p-1.5 text-zinc-400 hover:text-zinc-700"
                    >
                      {showSerp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-zinc-500">
                    Stored server-side only (never exposed to browser).{" "}
                    <a
                      href="https://serpapi.com/manage-api-key"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Get a free key
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    (includes free monthly photo scans).
                  </p>
                </div>

                {feedback && (
                  <p
                    className={`rounded-lg border px-3 py-2 text-[12.5px] ${
                      feedback.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {feedback.text}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60"
                    >
                      {busy === "save" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <SearchCheck className="h-3.5 w-3.5" />
                      )}
                      Verify &amp; save
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction("serpapi", "test")}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {busy === "test" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Test key
                    </button>
                  </div>

                  {settings.serpapi.configured && settings.serpapi.source === "dotenv" && (
                    <button
                      type="button"
                      onClick={() => runAction("serpapi", "clear")}
                      disabled={busy !== null}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-[12.5px] font-medium text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
