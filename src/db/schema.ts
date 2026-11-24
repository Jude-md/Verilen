import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { LiveMatchDTO, LiveSearchStatus } from "@/lib/live-types";

export type SocialPlatform =
  | "instagram"
  | "x"
  | "linkedin"
  | "tiktok"
  | "github"
  | "youtube";

export type MatchType = "exact" | "high" | "resemblance" | "possible";

export interface VisualSignaturePayload {
  /** Normalized 8x8 portrait center luminance grid (facial framing descriptor) */
  faceGrid: number[];
  /** Normalized 8x8 center vertical+horizontal gradient energy */
  edgeGrid: number[];
  /** 24-bin quantized RGB palette histogram (focus on skin-tone / lighting / ambience) */
  colorHist: number[];
  /** 16-bin Sobel edge orientation histogram */
  orientHist: number[];
  /** 4 dominant hex swatch colors extracted from the portrait */
  palette: string[];
  /** Mean grayscale luminance (0-255) */
  avgLuma: number;
  /** Saturation ratio (0-1, separates monochrome from vivid color) */
  avgSaturation: number;
}

export const publicProfiles = pgTable(
  "public_profiles",
  {
    id: serial("id").primaryKey(),
    identityKey: text("identity_key").notNull(),
    platform: text("platform").$type<SocialPlatform>().notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    profileUrl: text("profile_url").notNull(),
    avatarPath: text("avatar_path").notNull(),
    bio: text("bio").notNull().default(""),
    location: text("location").notNull().default(""),
    followersCount: integer("followers_count").notNull().default(0),
    verified: boolean("verified").notNull().default(false),
    isUserAdded: boolean("is_user_added").notNull().default(false),
    sha256: text("sha256").notNull(),
    dhash: text("dhash").notNull(),
    ahash: text("ahash").notNull(),
    visualVector: jsonb("visual_vector").$type<VisualSignaturePayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("public_profiles_platform_handle_idx").on(
      table.platform,
      table.handle
    ),
    index("public_profiles_identity_idx").on(table.identityKey),
    index("public_profiles_platform_idx").on(table.platform),
  ]
);

export const scans = pgTable(
  "scans",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull().default("upload"),
    queryLabel: text("query_label").notNull(),
    imagePath: text("image_path").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    dhash: text("dhash").notNull(),
    dominantColors: jsonb("dominant_colors").$type<string[]>().notNull(),
    platformsScanned: integer("platforms_scanned").notNull().default(6),
    profilesScanned: integer("profiles_scanned").notNull().default(0),
    matchCount: integer("match_count").notNull().default(0),
    topSimilarity: integer("top_similarity").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    engineMode: text("engine_mode").notNull().default("indexed"),
    liveResults: jsonb("live_results")
      .$type<LiveMatchDTO[]>()
      .notNull()
      .default([]),
    liveStatus: jsonb("live_status")
      .$type<LiveSearchStatus>()
      .notNull()
      .default({
        enabled: true,
        state: "live",
        reverseImageHits: 0,
        similarImageHits: 0,
        socialHandlesFound: 0,
        lensHits: 0,
        siteHits: 0,
        websiteHits: 0,
        queriesRun: 0,
      }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("scans_created_at_idx").on(table.createdAt)]
);

export const scanMatches = pgTable(
  "scan_matches",
  {
    id: serial("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => publicProfiles.id, { onDelete: "cascade" }),
    similarityScore: integer("similarity_score").notNull(),
    structuralScore: integer("structural_score").notNull(),
    facialScore: integer("facial_score").notNull(),
    toneScore: integer("tone_score").notNull(),
    matchType: text("match_type").$type<MatchType>().notNull(),
    matchReason: text("match_reason").notNull(),
    isSaved: boolean("is_saved").notNull().default(false),
    isFlagged: boolean("is_flagged").notNull().default(false),
    rank: integer("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("scan_matches_scan_idx").on(table.scanId),
    index("scan_matches_profile_idx").on(table.profileId),
  ]
);

export type PublicProfileRow = typeof publicProfiles.$inferSelect;
export type ScanRow = typeof scans.$inferSelect;
export type ScanMatchRow = typeof scanMatches.$inferSelect;
