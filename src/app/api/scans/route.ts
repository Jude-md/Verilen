import fs from "fs";
import path from "path";
import { count } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { publicProfiles } from "@/db/schema";
import { DEMO_SAMPLES } from "@/lib/platforms";
import {
  executeImageScan,
  fetchRemoteImageBuffer,
  listRecentScans,
} from "@/lib/scan-service";
import { ensureProfilesSeeded } from "@/lib/seed";
import { MAX_UPLOAD_BYTES } from "@/lib/vision";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureProfilesSeeded();
    const [recentScans, [{ total: indexedProfiles }]] = await Promise.all([
      listRecentScans(24),
      db.select({ total: count() }).from(publicProfiles),
    ]);

    return NextResponse.json({
      scans: recentScans,
      indexedProfiles,
      platformsCount: 6,
      engineMode: process.env.SERPAPI_API_KEY ? "hybrid_live" : "indexed",
    });
  } catch (err) {
    console.error("GET /api/scans failed:", err);
    return NextResponse.json(
      { error: "Unable to load scan history." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // 1. Multipart file upload or webcam capture
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const rawSource = String(formData.get("sourceType") ?? "upload");
      const sourceType = rawSource === "camera" ? "camera" : "upload";

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Please attach an image file (JPG, PNG, or WebP)." },
          { status: 400 }
        );
      }

      if (file.size === 0) {
        return NextResponse.json(
          { error: "Uploaded file is empty." },
          { status: 400 }
        );
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Image exceeds the 10 MB size limit." },
          { status: 413 }
        );
      }

      const allowedMime = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/gif",
      ];
      if (file.type && !allowedMime.includes(file.type.toLowerCase())) {
        return NextResponse.json(
          { error: "Unsupported format. Upload a JPG, PNG, WebP, or AVIF image." },
          { status: 400 }
        );
      }

      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const label =
        file.name && file.name !== "blob"
          ? file.name
          : sourceType === "camera"
            ? "Camera snapshot.jpg"
            : "Uploaded portrait.jpg";

      const scan = await executeImageScan({
        buffer,
        sourceType,
        queryLabel: label,
      });

      return NextResponse.json({ scan }, { status: 201 });
    }

    // 2. JSON payload: sample portrait or remote image URL
    const body = (await req.json().catch(() => null)) as {
      sampleId?: string;
      imageUrl?: string;
    } | null;

    if (!body) {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 }
      );
    }

    if (body.sampleId) {
      const sample = DEMO_SAMPLES.find((s) => s.id === body.sampleId);
      if (!sample) {
        return NextResponse.json(
          { error: "Unknown sample photo." },
          { status: 404 }
        );
      }
      const sampleDiskPath = path.join(
        process.cwd(),
        "public",
        sample.imagePath.replace(/^\/+/, "")
      );
      const buffer = await fs.promises.readFile(sampleDiskPath);
      const scan = await executeImageScan({
        buffer,
        sourceType: "sample",
        queryLabel: `${sample.name} (${sample.hint})`,
        existingImagePath: sample.imagePath,
      });

      return NextResponse.json({ scan }, { status: 201 });
    }

    if (body.imageUrl && typeof body.imageUrl === "string") {
      const { buffer, filename } = await fetchRemoteImageBuffer(body.imageUrl);
      const scan = await executeImageScan({
        buffer,
        sourceType: "url",
        queryLabel: filename,
        sourceImageUrl: body.imageUrl.trim(),
      });
      return NextResponse.json({ scan }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Provide an image file, sampleId, or imageUrl to scan." },
      { status: 400 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to analyze image.";
    const isClientErr =
      message.includes("valid") ||
      message.includes("URL") ||
      message.includes("format") ||
      message.includes("limit") ||
      message.includes("private") ||
      message.includes("Unsupported") ||
      message.includes("corrupted") ||
      message.includes("fetch") ||
      message.includes("dimensions") ||
      message.includes("Input buffer");

    return NextResponse.json(
      {
        error: message.includes("Input buffer")
          ? "Unsupported or corrupted image file. Try a standard JPG, PNG, or WebP."
          : message,
      },
      { status: isClientErr ? 400 : 500 }
    );
  }
}
