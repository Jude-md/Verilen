import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getUploadDirs } from "@/lib/vision";

const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/;

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  if (!SAFE_FILENAME.test(filename)) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
  }

  const dirs = getUploadDirs();
  for (const dir of dirs) {
    const fullPath = path.resolve(dir, filename);
    if (!fullPath.startsWith(path.resolve(dir) + path.sep)) continue;

    try {
      const data = await fs.promises.readFile(fullPath);
      const ext = path.extname(filename).toLowerCase();
      const contentType =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : "image/jpeg";

      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // Try the next storage location
    }
  }

  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
