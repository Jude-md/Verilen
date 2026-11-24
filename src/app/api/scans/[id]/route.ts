import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { executeImageScan, getScanById } from "@/lib/scan-service";
import { UPLOAD_DIR } from "@/lib/vision";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const scan = await getScanById(id);
    if (!scan) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }
    return NextResponse.json({ scan });
  } catch (err) {
    console.error("GET /api/scans/[id] failed:", err);
    return NextResponse.json(
      { error: "Failed to load scan." },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const [existing] = await db.select().from(scans).where(eq(scans.id, id));
    if (!existing) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }

    let filePath: string;
    if (existing.imagePath.startsWith("/api/media/")) {
      const name = existing.imagePath.replace("/api/media/", "");
      filePath = path.join(UPLOAD_DIR, path.basename(name));
    } else {
      filePath = path.join(
        process.cwd(),
        "public",
        existing.imagePath.replace(/^\/+/, "")
      );
    }

    const buffer = await fs.promises.readFile(
      /*turbopackIgnore: true*/ filePath
    );
    const sourceType =
      existing.sourceType === "url" ||
      existing.sourceType === "camera" ||
      existing.sourceType === "sample"
        ? existing.sourceType
        : "upload";

    const rescanned = await executeImageScan({
      buffer,
      sourceType,
      queryLabel: existing.queryLabel,
      existingImagePath: existing.imagePath,
    });

    return NextResponse.json({ scan: rescanned }, { status: 201 });
  } catch (err) {
    console.error("POST /api/scans/[id] rescan failed:", err);
    return NextResponse.json(
      { error: "Unable to re-scan this image." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const [deleted] = await db
      .delete(scans)
      .where(eq(scans.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }

    // Delete dynamic uploaded image file when no other scans reference it
    if (deleted.imagePath.startsWith("/api/media/")) {
      const remaining = await db
        .select({ id: scans.id })
        .from(scans)
        .where(eq(scans.imagePath, deleted.imagePath))
        .limit(1);

      if (remaining.length === 0) {
        const fname = path.basename(deleted.imagePath.replace("/api/media/", ""));
        const full = path.join(UPLOAD_DIR, fname);
        await fs.promises.unlink(full).catch(() => undefined);
      }
    }

    return NextResponse.json({ deleted: true, id: deleted.id });
  } catch (err) {
    console.error("DELETE /api/scans/[id] failed:", err);
    return NextResponse.json(
      { error: "Failed to delete scan." },
      { status: 500 }
    );
  }
}
