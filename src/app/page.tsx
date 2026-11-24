import { count } from "drizzle-orm";
import { db } from "@/db";
import { publicProfiles } from "@/db/schema";
import { ensureProfilesSeeded } from "@/lib/seed";
import { getScanById, listRecentScans } from "@/lib/scan-service";
import { getProviderSettings } from "@/lib/live-search";
import { VeriLensApp } from "@/components/verilens-app";

export const dynamic = "force-dynamic";

interface HomePageProps {
  searchParams: Promise<{ scan?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  await ensureProfilesSeeded();
  const params = await searchParams;
  const requestedScanId =
    typeof params?.scan === "string" && params.scan.trim()
      ? params.scan.trim()
      : null;

  const [[{ total }], recentScans, initialScan] = await Promise.all([
    db.select({ total: count() }).from(publicProfiles),
    listRecentScans(24),
    requestedScanId ? getScanById(requestedScanId) : Promise.resolve(null),
  ]);

  const initialSettings = getProviderSettings();

  return (
    <VeriLensApp
      initialIndexedCount={total}
      initialRecentScans={recentScans}
      initialScan={initialScan}
      initialSettings={initialSettings}
    />
  );
}
