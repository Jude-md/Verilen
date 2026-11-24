import crypto from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/db";
import {
  publicProfiles,
  scanMatches,
  scans,
  type MatchType,
  type SocialPlatform,
} from "@/db/schema";
import { ensureProfilesSeeded } from "@/lib/seed";
import {
  getDefaultOffStatus,
  runLiveSearch,
} from "@/lib/live-search";
import type { LiveMatchDTO, LiveSearchStatus } from "@/lib/live-types";
import {
  compareVisualSignatures,
  extractVisualSignature,
  saveNormalizedImage,
} from "@/lib/vision";

export interface LinkedAccountDTO {
  id: number;
  platform: SocialPlatform;
  handle: string;
  profileUrl: string;
  avatarPath: string;
  verified: boolean;
}

export interface ScanMatchDTO {
  id: number;
  profileId: number;
  identityKey: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  profileUrl: string;
  avatarPath: string;
  bio: string;
  location: string;
  followersCount: number;
  verified: boolean;
  isUserAdded: boolean;
  similarityScore: number;
  structuralScore: number;
  facialScore: number;
  toneScore: number;
  matchType: MatchType;
  matchReason: string;
  isSaved: boolean;
  isFlagged: boolean;
  rank: number;
  linkedAccounts: LinkedAccountDTO[];
}

export interface ScanResultDTO {
  id: string;
  sourceType: string;
  queryLabel: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  fileSizeBytes: number;
  dhash: string;
  dominantColors: string[];
  platformsScanned: number;
  profilesScanned: number;
  matchCount: number;
  topSimilarity: number;
  durationMs: number;
  engineMode: string;
  createdAt: string;
  platformCounts: Record<SocialPlatform, number>;
  matches: ScanMatchDTO[];
  liveMatches: LiveMatchDTO[];
  liveStatus: LiveSearchStatus;
}

export interface ScanSummaryDTO {
  id: string;
  sourceType: string;
  queryLabel: string;
  imagePath: string;
  matchCount: number;
  topSimilarity: number;
  durationMs: number;
  topHandle: string | null;
  topPlatform: SocialPlatform | null;
  savedCount: number;
  createdAt: string;
}

const MAX_RETURNED_MATCHES = 18;
const MIN_MATCH_THRESHOLD = 46;

function emptyPlatformCounts(): Record<SocialPlatform, number> {
  return {
    instagram: 0,
    x: 0,
    linkedin: 0,
    tiktok: 0,
    github: 0,
    youtube: 0,
  };
}

/**
 * Runs a full visual similarity scan of an image buffer against all indexed public social profiles,
 * persists the query image, scan record, and ranked matches into PostgreSQL, and returns full results.
 */
export async function executeImageScan(options: {
  buffer: Buffer;
  sourceType: "upload" | "url" | "camera" | "sample";
  queryLabel: string;
  existingImagePath?: string;
  sourceImageUrl?: string;
}): Promise<ScanResultDTO> {
  const startedAt = Date.now();
  await ensureProfilesSeeded();

  // Automatically run real live open-web reverse-image & social-handle discovery
  // on every real user upload, camera snapshot, or image URL — ZERO manual API key required!
  // Sample demos stay instant against the built-in local catalog (users can still click live rescan).
  const isRealInput = options.sourceType !== "sample";
  const liveSearchPromise = isRealInput
    ? runLiveSearch({
        buffer: options.buffer,
        sourceImageUrl: options.sourceImageUrl,
      })
    : Promise.resolve({
        matches: [] as LiveMatchDTO[],
        status: {
          ...getDefaultOffStatus(),
          message: "Sample preview portrait — upload any real photo to search the live web automatically.",
        } satisfies LiveSearchStatus,
      });

  const extracted = await extractVisualSignature(options.buffer);

  // Persist normalized image copy unless reading a built-in static sample
  let imagePath = options.existingImagePath ?? "";
  let storedWidth = extracted.width;
  let storedHeight = extracted.height;
  let storedBytes = extracted.fileSizeBytes;

  if (!imagePath) {
    const saved = await saveNormalizedImage(options.buffer, "scan", 960);
    imagePath = saved.publicUrl;
    storedWidth = saved.width;
    storedHeight = saved.height;
    storedBytes = saved.size;
  }

  // Indexed catalog is optional: without a database we still run live web search.
  let allProfiles: Array<typeof publicProfiles.$inferSelect> = [];
  if (isDatabaseConfigured()) {
    try {
      allProfiles = await db.select().from(publicProfiles);
    } catch (err) {
      console.warn(
        "[verilens] Indexed catalog unavailable:",
        err instanceof Error ? err.message : err
      );
    }
  }
  const distinctPlatforms = new Set(allProfiles.map((p) => p.platform));

  // Group linked handles by identityKey so users can uncover every cross-platform handle
  const byIdentity = new Map<string, LinkedAccountDTO[]>();
  for (const p of allProfiles) {
    const arr = byIdentity.get(p.identityKey) ?? [];
    arr.push({
      id: p.id,
      platform: p.platform,
      handle: p.handle,
      profileUrl: p.profileUrl,
      avatarPath: p.avatarPath,
      verified: p.verified,
    });
    byIdentity.set(p.identityKey, arr);
  }

  // Score every single indexed public profile with genuine CV feature matching
  const scored = allProfiles.map((profile) => {
    const breakdown = compareVisualSignatures(extracted, {
      sha256: profile.sha256,
      dhash: profile.dhash,
      ahash: profile.ahash,
      visualVector: profile.visualVector,
    });
    return { profile, breakdown };
  });

  // Sort by highest overall similarity, then facial score, then verified/followers tiebreaker
  scored.sort((a, b) => {
    if (b.breakdown.similarityScore !== a.breakdown.similarityScore) {
      return b.breakdown.similarityScore - a.breakdown.similarityScore;
    }
    if (b.breakdown.facialScore !== a.breakdown.facialScore) {
      return b.breakdown.facialScore - a.breakdown.facialScore;
    }
    return b.profile.followersCount - a.profile.followersCount;
  });

  // Always retain profiles passing the resemblance threshold, guaranteeing top lookalikes appear even for unusual uploads
  let selected = scored
    .filter((item) => item.breakdown.similarityScore >= MIN_MATCH_THRESHOLD)
    .slice(0, MAX_RETURNED_MATCHES);

  if (selected.length < 6) {
    selected = scored.slice(0, Math.min(8, scored.length));
  }

  const liveOutcome = await liveSearchPromise;
  const liveMatches = liveOutcome.matches;
  const liveStatus = liveOutcome.status;

  const durationMs = Math.max(12, Date.now() - startedAt);
  const scanId = `scn_${crypto.randomBytes(6).toString("hex")}`;
  const localBest = selected[0]?.breakdown.similarityScore ?? 0;
  const liveBest = liveMatches[0]?.similarityScore ?? 0;
  const isLiveScan = options.sourceType !== "sample";
  const userExactLocal = selected.filter(
    (s) => s.profile.isUserAdded && s.breakdown.similarityScore >= 85
  ).length;
  const effectiveMatchCount = isLiveScan
    ? liveMatches.length + userExactLocal
    : selected.length;
  const topSimilarity = isLiveScan
    ? liveMatches.length > 0
      ? liveBest
      : userExactLocal > 0
        ? localBest
        : (liveStatus.webAppearances?.length ?? 0) > 0
          ? 80
          : (liveStatus.similarMatches?.length ?? 0) > 0
            ? 68
            : localBest
    : localBest;
  const engineMode = isLiveScan ? "live_web" : "indexed";

  let createdScan: typeof scans.$inferSelect | null = null;
  let insertedMatches: Array<typeof scanMatches.$inferSelect> = [];

  if (isDatabaseConfigured()) {
    try {
      const [savedScan] = await db
        .insert(scans)
        .values({
      id: scanId,
      sourceType: options.sourceType,
      queryLabel: options.queryLabel.slice(0, 120),
      imagePath,
      imageWidth: storedWidth,
      imageHeight: storedHeight,
      fileSizeBytes: storedBytes,
      sha256: extracted.sha256,
      dhash: extracted.dhash,
      dominantColors: extracted.visualVector.palette,
      platformsScanned: isLiveScan ? 17 : Math.max(6, distinctPlatforms.size),
      profilesScanned: allProfiles.length,
      matchCount: effectiveMatchCount,
      topSimilarity,
      durationMs,
      engineMode,
      liveResults: liveMatches,
        liveStatus,
      })
        .returning();
      createdScan = savedScan ?? null;

      if (selected.length > 0) {
        insertedMatches = await db
          .insert(scanMatches)
          .values(
            selected.map((item, idx) => ({
              scanId,
              profileId: item.profile.id,
              similarityScore: item.breakdown.similarityScore,
              structuralScore: item.breakdown.structuralScore,
              facialScore: item.breakdown.facialScore,
              toneScore: item.breakdown.toneScore,
              matchType: item.breakdown.matchType,
              matchReason: item.breakdown.matchReason,
              isSaved: false,
              isFlagged: false,
              rank: idx + 1,
            }))
          )
          .returning();
      }
    } catch (err) {
      console.warn(
        "[verilens] Scan persistence skipped:",
        err instanceof Error ? err.message : err
      );
      createdScan = null;
      insertedMatches = [];
    }
  }

  const platformCounts = emptyPlatformCounts();
  const rowByProfileId = new Map(insertedMatches.map((row) => [row.profileId, row]));
  const matches: ScanMatchDTO[] = selected.map((item, idx) => {
    const profile = item.profile;
    const row = rowByProfileId.get(profile.id);
    platformCounts[profile.platform] = (platformCounts[profile.platform] ?? 0) + 1;
    const siblingAccounts = (byIdentity.get(profile.identityKey) ?? []).filter(
      (acct) => acct.id !== profile.id
    );
    return {
      id: row?.id ?? -(idx + 1),
      profileId: profile.id,
      identityKey: profile.identityKey,
      platform: profile.platform,
      handle: profile.handle,
      displayName: profile.displayName,
      profileUrl: profile.profileUrl,
      avatarPath: profile.avatarPath,
      bio: profile.bio,
      location: profile.location,
      followersCount: profile.followersCount,
      verified: profile.verified,
      isUserAdded: profile.isUserAdded,
      similarityScore: row?.similarityScore ?? item.breakdown.similarityScore,
      structuralScore: row?.structuralScore ?? item.breakdown.structuralScore,
      facialScore: row?.facialScore ?? item.breakdown.facialScore,
      toneScore: row?.toneScore ?? item.breakdown.toneScore,
      matchType: row?.matchType ?? item.breakdown.matchType,
      matchReason: row?.matchReason ?? item.breakdown.matchReason,
      isSaved: row?.isSaved ?? false,
      isFlagged: row?.isFlagged ?? false,
      rank: row?.rank ?? idx + 1,
      linkedAccounts: siblingAccounts,
    };
  });

  return {
    id: createdScan?.id ?? scanId,
    sourceType: createdScan?.sourceType ?? options.sourceType,
    queryLabel: createdScan?.queryLabel ?? options.queryLabel.slice(0, 120),
    imagePath: createdScan?.imagePath ?? imagePath,
    imageWidth: createdScan?.imageWidth ?? storedWidth,
    imageHeight: createdScan?.imageHeight ?? storedHeight,
    fileSizeBytes: createdScan?.fileSizeBytes ?? storedBytes,
    dhash: createdScan?.dhash ?? extracted.dhash,
    dominantColors:
      createdScan?.dominantColors ?? extracted.visualVector.palette,
    platformsScanned:
      createdScan?.platformsScanned ?? (isLiveScan ? 17 : 6),
    profilesScanned: createdScan?.profilesScanned ?? allProfiles.length,
    matchCount: createdScan?.matchCount ?? effectiveMatchCount,
    topSimilarity: createdScan?.topSimilarity ?? topSimilarity,
    durationMs: createdScan?.durationMs ?? durationMs,
    engineMode: createdScan?.engineMode ?? engineMode,
    createdAt: (createdScan?.createdAt ?? new Date()).toISOString(),
    platformCounts,
    matches,
    liveMatches,
    liveStatus,
  };
}

/**
 * Loads a persisted scan and all ranked public social profile matches by ID.
 */
export async function getScanById(scanId: string): Promise<ScanResultDTO | null> {
  if (!isDatabaseConfigured()) return null;
  await ensureProfilesSeeded();
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!scan) return null;

  const joined = await db
    .select({
      match: scanMatches,
      profile: publicProfiles,
    })
    .from(scanMatches)
    .innerJoin(publicProfiles, eq(scanMatches.profileId, publicProfiles.id))
    .where(eq(scanMatches.scanId, scanId))
    .orderBy(scanMatches.rank);

  const identityKeys = Array.from(
    new Set(joined.map((r) => r.profile.identityKey))
  );
  const siblings =
    identityKeys.length > 0
      ? await db
          .select()
          .from(publicProfiles)
          .where(inArray(publicProfiles.identityKey, identityKeys))
      : [];

  const byIdentity = new Map<string, LinkedAccountDTO[]>();
  for (const p of siblings) {
    const list = byIdentity.get(p.identityKey) ?? [];
    list.push({
      id: p.id,
      platform: p.platform,
      handle: p.handle,
      profileUrl: p.profileUrl,
      avatarPath: p.avatarPath,
      verified: p.verified,
    });
    byIdentity.set(p.identityKey, list);
  }

  const platformCounts = emptyPlatformCounts();
  const matches: ScanMatchDTO[] = joined.map(({ match, profile }) => {
    platformCounts[profile.platform] = (platformCounts[profile.platform] ?? 0) + 1;
    return {
      id: match.id,
      profileId: profile.id,
      identityKey: profile.identityKey,
      platform: profile.platform,
      handle: profile.handle,
      displayName: profile.displayName,
      profileUrl: profile.profileUrl,
      avatarPath: profile.avatarPath,
      bio: profile.bio,
      location: profile.location,
      followersCount: profile.followersCount,
      verified: profile.verified,
      isUserAdded: profile.isUserAdded,
      similarityScore: match.similarityScore,
      structuralScore: match.structuralScore,
      facialScore: match.facialScore,
      toneScore: match.toneScore,
      matchType: match.matchType,
      matchReason: match.matchReason,
      isSaved: match.isSaved,
      isFlagged: match.isFlagged,
      rank: match.rank,
      linkedAccounts: (byIdentity.get(profile.identityKey) ?? []).filter(
        (acct) => acct.id !== profile.id
      ),
    };
  });

  return {
    id: scan.id,
    sourceType: scan.sourceType,
    queryLabel: scan.queryLabel,
    imagePath: scan.imagePath,
    imageWidth: scan.imageWidth,
    imageHeight: scan.imageHeight,
    fileSizeBytes: scan.fileSizeBytes,
    dhash: scan.dhash,
    dominantColors: scan.dominantColors,
    platformsScanned: scan.platformsScanned,
    profilesScanned: scan.profilesScanned,
    matchCount: matches.length,
    topSimilarity: matches[0]?.similarityScore ?? scan.topSimilarity,
    durationMs: scan.durationMs,
    engineMode: scan.engineMode,
    createdAt: scan.createdAt.toISOString(),
    platformCounts,
    matches,
    liveMatches: scan.liveResults ?? [],
    liveStatus: scan.liveStatus ?? getDefaultOffStatus(),
  };
}

/**
 * Lists recent persisted image scans with top-matched handle preview.
 */
export async function listRecentScans(limit = 25): Promise<ScanSummaryDTO[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureProfilesSeeded();
  const rows = await db
    .select()
    .from(scans)
    .orderBy(desc(scans.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const scanIds = rows.map((r) => r.id);
  const allMatchRows = await db
    .select({
      scanId: scanMatches.scanId,
      rank: scanMatches.rank,
      isSaved: scanMatches.isSaved,
      handle: publicProfiles.handle,
      platform: publicProfiles.platform,
    })
    .from(scanMatches)
    .innerJoin(publicProfiles, eq(scanMatches.profileId, publicProfiles.id))
    .where(inArray(scanMatches.scanId, scanIds));

  const metaByScan = new Map<
    string,
    { topHandle: string | null; topPlatform: SocialPlatform | null; savedCount: number }
  >();

  for (const m of allMatchRows) {
    const cur = metaByScan.get(m.scanId) ?? {
      topHandle: null,
      topPlatform: null,
      savedCount: 0,
    };
    if (m.rank === 1) {
      cur.topHandle = m.handle;
      cur.topPlatform = m.platform;
    }
    if (m.isSaved) cur.savedCount += 1;
    metaByScan.set(m.scanId, cur);
  }

  const toCore = (p: string): SocialPlatform | null => {
    if (p === "twitter" || p === "x") return "x";
    if (
      p === "instagram" ||
      p === "linkedin" ||
      p === "tiktok" ||
      p === "github" ||
      p === "youtube"
    ) {
      return p;
    }
    return null;
  };

  return rows.map((row) => {
    const meta = metaByScan.get(row.id);
    const firstLive = Array.isArray(row.liveResults) ? row.liveResults[0] : undefined;
    const isLive = row.engineMode === "live_web";
    const subjectName = row.liveStatus?.identifiedSubject?.name;
    return {
      id: row.id,
      sourceType: row.sourceType,
      queryLabel: subjectName && isLive ? `${subjectName} · ${row.queryLabel}` : row.queryLabel,
      imagePath: row.imagePath,
      matchCount: row.matchCount,
      topSimilarity: row.topSimilarity,
      durationMs: row.durationMs,
      topHandle: isLive
        ? firstLive?.handle ?? (row.liveStatus?.webAppearances?.[0]?.domain ?? null)
        : meta?.topHandle ?? null,
      topPlatform: isLive
        ? firstLive
          ? toCore(firstLive.platform)
          : null
        : meta?.topPlatform ?? null,
      savedCount: meta?.savedCount ?? 0,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Safely retrieves a remote HTTP(S) image with strict validation and SSRF protection.
 */
export async function fetchRemoteImageBuffer(rawUrl: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Please enter a valid http:// or https:// image URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS image URLs are supported.");
  }

  const host = parsed.hostname.toLowerCase();
  const isPrivateHost =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "::1" ||
    host.startsWith("[::1]") ||
    host.startsWith("fc") ||
    host.startsWith("fd");

  if (isPrivateHost) {
    throw new Error("Private or local network image URLs are not allowed.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "VeriLens/1.0 VisualLookup",
      },
    });
    if (!response.ok) {
      throw new Error(`Could not fetch image (HTTP ${response.status}).`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 10 * 1024 * 1024) {
      throw new Error("Image exceeds the 10 MB upload limit.");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      throw new Error("The URL does not point directly to an image file.");
    }
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > 10 * 1024 * 1024) {
      throw new Error("Image exceeds the 10 MB upload limit.");
    }
    if (arrayBuf.byteLength < 64) {
      throw new Error("The fetched file appears empty or corrupted.");
    }
    const baseName = decodeURIComponent(path.basename(parsed.pathname) || "remote-image.jpg");
    return {
      buffer: Buffer.from(arrayBuf),
      filename: baseName.slice(0, 80) || "remote-image.jpg",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timed out fetching image URL. Try downloading and uploading it directly.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

import path from "path";
