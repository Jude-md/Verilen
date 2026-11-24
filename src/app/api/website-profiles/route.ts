import { NextRequest, NextResponse } from "next/server";
import { scanWebsiteProfiles } from "@/lib/apify-profile-finder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/website-profiles
 * Finds real linked public social media profiles across 16 platforms from 1–10 websites.
 * Uses Apify Actor `automation-lab/social-media-profile-finder` automatically whenever
 * APIFY_API_TOKEN (or APIFY_TOKEN) is set (and prefers Standby Server URL when configured),
 * falling back seamlessly to our real built-in live HTML + JSON-LD `sameAs` + script extractor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      urls?: string[] | string;
      maxExtraPages?: number;
      forceBuiltin?: boolean;
    } | null;

    if (!body || !body.urls) {
      return NextResponse.json(
        {
          error:
            "Provide one or more website domains or URLs (e.g. apify.com, stripe.com).",
        },
        { status: 400 }
      );
    }

    const rawList: string[] = Array.isArray(body.urls)
      ? body.urls.map((u) => String(u))
      : String(body.urls)
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);

    if (rawList.length === 0) {
      return NextResponse.json(
        { error: "Enter at least one domain or website URL to scan." },
        { status: 400 }
      );
    }

    const maxExtraPages =
      typeof body.maxExtraPages === "number" && Number.isFinite(body.maxExtraPages)
        ? Math.max(0, Math.min(5, Math.round(body.maxExtraPages)))
        : 2;

    const outcome = await scanWebsiteProfiles({
      rawUrls: rawList,
      maxExtraPages,
      forceBuiltin: Boolean(body.forceBuiltin),
    });

    return NextResponse.json(outcome, { status: 200 });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Could not scan the provided website.";
    const isInputErr =
      msg.includes("valid website") ||
      msg.includes("domain") ||
      msg.includes("Enter at least");
    return NextResponse.json(
      { error: msg },
      { status: isInputErr ? 400 : 500 }
    );
  }
}
