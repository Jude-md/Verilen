import { NextRequest, NextResponse } from "next/server";
import { maskKey, readSecret, writeSecret } from "@/lib/env-secure";
import { getProviderSettings, testSerpApiKey } from "@/lib/live-search";
import {
  getApifyServerUrl,
  getApifyToken,
  verifyApifyCredentials,
} from "@/lib/apify-profile-finder";
import type { ProviderSettingsDTO } from "@/lib/live-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ONLY_NOTE =
  "Saved for this running instance. This host has a read-only filesystem, so add the same value as an environment variable in your host dashboard (e.g. Vercel → Settings → Environment Variables) to make it permanent.";

function buildSettingsPayload(): ProviderSettingsDTO & {
  configured: boolean;
  maskedKey: string | null;
  envPersistence: "dotenv" | "memory";
} {
  const settings = getProviderSettings();
  return {
    ...settings,
    // Always active automatically via zero-key live engine; individual flags show optional boosts
    configured: settings.serpapi.configured,
    maskedKey: settings.serpapi.maskedKey,
    envPersistence: process.env.VERCEL ? "memory" : "dotenv",
  };
}

export async function GET() {
  try {
    return NextResponse.json(buildSettingsPayload());
  } catch (err) {
    console.error("GET /api/settings failed:", err);
    return NextResponse.json(
      { error: "Could not read provider settings." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      provider?: "apify" | "serpapi";
      action?: "save" | "clear" | "test";
      apiKey?: string;
      serverUrl?: string;
    } | null;

    const provider = body?.provider === "apify" ? "apify" : "serpapi";
    const action = body?.action ?? "save";
    const apiKey = (body?.apiKey ?? "").trim();
    const serverUrl = (body?.serverUrl ?? "").trim();

    if (provider === "apify") {
      if (action === "clear") {
        writeSecret("APIFY_API_TOKEN", null);
        writeSecret("APIFY_PROFILE_FINDER_SERVER_URL", null);
        return NextResponse.json({
          ...buildSettingsPayload(),
          message:
            "Apify token removed. Website scanning automatically uses the free built-in HTML/JSON-LD scanner.",
        });
      }

      if (action === "test") {
        const tokenToTest = apiKey || getApifyToken() || "";
        const srvToTest = serverUrl || getApifyServerUrl() || "";
        const result = await verifyApifyCredentials(tokenToTest, srvToTest || null);
        return NextResponse.json({
          ok: result.ok,
          message: result.message,
          username: result.username,
          ...buildSettingsPayload(),
        });
      }

      // action === "save"
      const tokenToSave = apiKey || getApifyToken() || "";
      const result = await verifyApifyCredentials(
        tokenToSave,
        serverUrl || null
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      let persisted = true;
      if (apiKey) {
        persisted = writeSecret("APIFY_API_TOKEN", apiKey) && persisted;
      }
      if (serverUrl) {
        persisted =
          writeSecret(
            "APIFY_PROFILE_FINDER_SERVER_URL",
            serverUrl.replace(/\/+$/, "")
          ) && persisted;
      } else if (body && "serverUrl" in body && body.serverUrl === "") {
        writeSecret("APIFY_PROFILE_FINDER_SERVER_URL", null);
      }

      return NextResponse.json({
        ...buildSettingsPayload(),
        message: persisted ? result.message : `${result.message} ${READ_ONLY_NOTE}`,
        persisted,
      });
    }

    // SerpApi provider
    if (action === "clear") {
      writeSecret("SERPAPI_API_KEY", null);
      return NextResponse.json({
        ...buildSettingsPayload(),
        message: "SerpApi key removed — Google Lens live photo search is off.",
      });
    }

    if (action === "test") {
      const key = apiKey || readSecret("SERPAPI_API_KEY", ["SERPAPI_KEY"]) || "";
      const result = await testSerpApiKey(key);
      return NextResponse.json({
        ok: result.ok,
        message: result.message,
        ...buildSettingsPayload(),
      });
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Paste your SerpApi API key to enable live Google Lens photo search." },
        { status: 400 }
      );
    }

    if (apiKey.length < 16 || /\s/.test(apiKey)) {
      return NextResponse.json(
        { error: "That doesn't look like a valid SerpApi key. Copy your private key from serpapi.com/manage-api-key." },
        { status: 400 }
      );
    }

    const verification = await testSerpApiKey(apiKey);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.message }, { status: 400 });
    }

    const persisted = writeSecret("SERPAPI_API_KEY", apiKey);
    return NextResponse.json({
      ...buildSettingsPayload(),
      maskedKey: maskKey(apiKey),
      message: persisted
        ? verification.message
        : `${verification.message} ${READ_ONLY_NOTE}`,
      persisted,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not update settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
