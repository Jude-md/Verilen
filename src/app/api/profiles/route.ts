import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { publicProfiles } from "@/db/schema";
import {
  buildProfileUrl,
  formatHandle,
  isSocialPlatform,
} from "@/lib/platforms";
import { fetchRemoteImageBuffer } from "@/lib/scan-service";
import { ensureProfilesSeeded } from "@/lib/seed";
import {
  extractVisualSignature,
  MAX_UPLOAD_BYTES,
  saveNormalizedImage,
} from "@/lib/vision";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureProfilesSeeded();
    const rows = await db
      .select({
        id: publicProfiles.id,
        identityKey: publicProfiles.identityKey,
        platform: publicProfiles.platform,
        handle: publicProfiles.handle,
        displayName: publicProfiles.displayName,
        profileUrl: publicProfiles.profileUrl,
        avatarPath: publicProfiles.avatarPath,
        bio: publicProfiles.bio,
        location: publicProfiles.location,
        followersCount: publicProfiles.followersCount,
        verified: publicProfiles.verified,
        isUserAdded: publicProfiles.isUserAdded,
        createdAt: publicProfiles.createdAt,
      })
      .from(publicProfiles)
      .orderBy(desc(publicProfiles.isUserAdded), desc(publicProfiles.createdAt));

    return NextResponse.json({
      total: rows.length,
      profiles: rows,
    });
  } catch (err) {
    console.error("GET /api/profiles failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch indexed profiles." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureProfilesSeeded();
    const formData = await req.formData();

    const platformRaw = String(formData.get("platform") ?? "").toLowerCase();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const handleRaw = String(formData.get("handle") ?? "").trim();
    const profileUrlRaw = String(formData.get("profileUrl") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim().slice(0, 260);
    const location = String(formData.get("location") ?? "").trim().slice(0, 80);
    const followersRaw = Number(formData.get("followersCount") ?? 0);
    const verified = String(formData.get("verified") ?? "false") === "true";
    const imageUrl = String(formData.get("imageUrl") ?? "").trim();
    const file = formData.get("file");

    if (!isSocialPlatform(platformRaw)) {
      return NextResponse.json(
        { error: "Choose a supported platform (Instagram, X, LinkedIn, TikTok, GitHub, or YouTube)." },
        { status: 400 }
      );
    }

    if (displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json(
        { error: "Display name must be between 2 and 80 characters." },
        { status: 400 }
      );
    }

    const strippedHandle = handleRaw.replace(/^@+/, "").replace(/^in\//i, "").trim();
    if (!/^[a-zA-Z0-9._-]{2,50}$/.test(strippedHandle)) {
      return NextResponse.json(
        { error: "Handle can only contain letters, numbers, dots, hyphens, and underscores." },
        { status: 400 }
      );
    }

    const handle = formatHandle(platformRaw, strippedHandle);

    let profileUrl = buildProfileUrl(platformRaw, strippedHandle);
    if (profileUrlRaw) {
      try {
        const parsed = new URL(profileUrlRaw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          profileUrl = parsed.toString();
        } else {
          return NextResponse.json(
            { error: "Profile URL must start with https:// or http://." },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Please provide a valid public profile URL." },
          { status: 400 }
        );
      }
    }

    let buffer: Buffer;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Profile image exceeds the 10 MB limit." },
          { status: 413 }
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (imageUrl) {
      const fetched = await fetchRemoteImageBuffer(imageUrl);
      buffer = fetched.buffer;
    } else {
      return NextResponse.json(
        { error: "Upload a profile image or provide a public photo URL." },
        { status: 400 }
      );
    }

    const sig = await extractVisualSignature(buffer);
    const saved = await saveNormalizedImage(buffer, "profile", 720);

    const identityKey = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `profile-${Date.now()}`;

    const followersCount = Number.isFinite(followersRaw)
      ? Math.max(0, Math.min(500_000_000, Math.round(followersRaw)))
      : 0;

    // Check if handle already exists on this platform
    const existingRows = await db
      .select({ id: publicProfiles.id })
      .from(publicProfiles)
      .where(eq(publicProfiles.handle, handle));

    const duplicate = existingRows.length > 0;
    const [inserted] = await db
      .insert(publicProfiles)
      .values({
        identityKey,
        platform: platformRaw,
        handle,
        displayName,
        profileUrl,
        avatarPath: saved.publicUrl,
        bio: bio || `Public ${platformRaw} profile for ${displayName}.`,
        location,
        followersCount,
        verified,
        isUserAdded: true,
        sha256: sig.sha256,
        dhash: sig.dhash,
        ahash: sig.ahash,
        visualVector: sig.visualVector,
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      return NextResponse.json(
        {
          error: duplicate
            ? `${handle} is already indexed on this platform.`
            : "This public handle already exists in the index.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        profile: {
          id: inserted.id,
          identityKey: inserted.identityKey,
          platform: inserted.platform,
          handle: inserted.handle,
          displayName: inserted.displayName,
          profileUrl: inserted.profileUrl,
          avatarPath: inserted.avatarPath,
          bio: inserted.bio,
          location: inserted.location,
          followersCount: inserted.followersCount,
          verified: inserted.verified,
          isUserAdded: inserted.isUserAdded,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not index profile.";
    return NextResponse.json(
      {
        error: message.includes("Input buffer")
          ? "Invalid image file. Use JPG, PNG, or WebP."
          : message,
      },
      { status: 400 }
    );
  }
}
