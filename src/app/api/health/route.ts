import { sql } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Healthcheck that never crashes the deployment.
 * Returns 200 with `database: false` when DATABASE_URL is missing so a
 * Vercel preview deploy can still boot and run live web search.
 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      {
        ok: true,
        database: false,
        liveSearch: true,
        message:
          "App is running. Add DATABASE_URL (Neon/Supabase/Vercel Postgres) to enable scan history, bookmarks, and the indexed catalog.",
      },
      { status: 200 }
    );
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: true, liveSearch: true });
  } catch (err) {
    console.error("Healthcheck DB error:", err);
    return Response.json(
      {
        ok: false,
        database: false,
        liveSearch: true,
        error:
          err instanceof Error
            ? err.message.slice(0, 180)
            : "Database connection failed",
      },
      { status: 200 }
    );
  }
}
