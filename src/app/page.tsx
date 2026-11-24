import { count } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/db";
import { publicProfiles } from "@/db/schema";
import { ensureProfilesSeeded } from "@/lib/seed";
import { getScanById, listRecentScans } from "@/lib/scan-service";
import { getProviderSettings } from "@/lib/live-search";
import { VeriLensApp } from "@/components/verilens-app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface HomePageProps {
  searchParams: Promise<{ scan?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const requestedScanId =
    typeof params?.scan === "string" && params.scan.trim()
      ? params.scan.trim()
      : null;

  // The page must render even when DATABASE_URL is missing, the database is
  // unreachable, or tables have not been pushed yet (e.g. first Vercel deploy).
  let indexedCount = 0;
  let recentScans: Awaited<ReturnType<typeof listRecentScans>> = [];
  let initialScan: Awaited<ReturnType<typeof getScanById>> = null;
  let databaseReady = false;

  if (isDatabaseConfigured()) {
    try {
      await ensureProfilesSeeded();
      const [[{ total }], scans, scan] = await Promise.all([
        db.select({ total: count() }).from(publicProfiles),
        listRecentScans(24),
        requestedScanId ? getScanById(requestedScanId) : Promise.resolve(null),
      ]);
      indexedCount = total;
      recentScans = scans;
      initialScan = scan;
      databaseReady = true;
    } catch (err) {
      console.error(
        "[verilens] Database unavailable, running in live-search-only mode:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return (
    <VeriLensApp
      initialIndexedCount={indexedCount}
      initialRecentScans={recentScans}
      initialScan={initialScan}
      initialSettings={getProviderSettings()}
      databaseReady={databaseReady}
    />
  );
}
