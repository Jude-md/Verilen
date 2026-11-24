import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Strictly allowlisted HTTPS thumbnail image CDN hosts used by live open-web reverse image searches. */
const ALLOWED_HOST_SUFFIXES = [
  "avatars.mds.yandex.net",
  "avatars.githubusercontent.com",
  "cdn.bsky.app",
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
  "i.ytimg.com",
  "upload.wikimedia.org",
  "pbs.twimg.com",
  "encrypted-tbn0.gstatic.com",
  "encrypted-tbn1.gstatic.com",
  "encrypted-tbn2.gstatic.com",
  "encrypted-tbn3.gstatic.com",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "media.licdn.com",
  "images.pexels.com",
  "images.unsplash.com",
  "i.pinimg.com",
  "gravatar.com",
  "www.gravatar.com",
];

const MAX_BYTES = 2 * 1024 * 1024;

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`)
  );
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u")?.trim();
  if (!raw) {
    return new NextResponse("Missing u", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (target.protocol !== "https:" || !isAllowedHost(target.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  try {
    const res = await fetch(target.toString(), {
      signal: AbortSignal.timeout(7_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.5",
      },
    });

    if (!res.ok) {
      return new NextResponse("Upstream unavailable", { status: 502 });
    }

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.startsWith("image/")) {
      return new NextResponse("Not an image", { status: 415 });
    }

    const lenHeader = Number(res.headers.get("content-length") ?? "0");
    if (lenHeader > MAX_BYTES) {
      return new NextResponse("Too large", { status: 413 });
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
      return new NextResponse("Bad image size", { status: 413 });
    }

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": ctype.split(";")[0],
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
