import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scanMatches } from "@/db/schema";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id, matchId } = await context.params;
    const numericId = Number(matchId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "Invalid match ID." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      isSaved?: boolean;
      isFlagged?: boolean;
    } | null;

    if (
      !body ||
      (typeof body.isSaved !== "boolean" && typeof body.isFlagged !== "boolean")
    ) {
      return NextResponse.json(
        { error: "Provide isSaved or isFlagged boolean." },
        { status: 400 }
      );
    }

    const updates: Partial<{ isSaved: boolean; isFlagged: boolean }> = {};
    if (typeof body.isSaved === "boolean") updates.isSaved = body.isSaved;
    if (typeof body.isFlagged === "boolean") updates.isFlagged = body.isFlagged;

    const [updated] = await db
      .update(scanMatches)
      .set(updates)
      .where(and(eq(scanMatches.id, numericId), eq(scanMatches.scanId, id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      isSaved: updated.isSaved,
      isFlagged: updated.isFlagged,
    });
  } catch (err) {
    console.error("PATCH match failed:", err);
    return NextResponse.json(
      { error: "Failed to update match status." },
      { status: 500 }
    );
  }
}
