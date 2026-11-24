import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { publicProfiles } from "@/db/schema";
import { UPLOAD_DIR } from "@/lib/vision";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "Invalid profile ID." }, { status: 400 });
    }

    const [deleted] = await db
      .delete(publicProfiles)
      .where(
        and(eq(publicProfiles.id, numericId), eq(publicProfiles.isUserAdded, true))
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "User-submitted profile not found." },
        { status: 404 }
      );
    }

    if (deleted.avatarPath.startsWith("/api/media/")) {
      const fname = path.basename(deleted.avatarPath.replace("/api/media/", ""));
      await fs.promises.unlink(path.join(UPLOAD_DIR, fname)).catch(() => undefined);
    }

    return NextResponse.json({ deleted: true, id: deleted.id });
  } catch (err) {
    console.error("DELETE /api/profiles/[id] failed:", err);
    return NextResponse.json(
      { error: "Failed to delete profile." },
      { status: 500 }
    );
  }
}
