import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { MatchType, VisualSignaturePayload } from "@/db/schema";

export interface ExtractedImageSignature {
  sha256: string;
  dhash: string;
  ahash: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  visualVector: VisualSignaturePayload;
}

export interface SimilarityBreakdown {
  similarityScore: number;
  structuralScore: number;
  facialScore: number;
  toneScore: number;
  matchType: MatchType;
  matchReason: string;
}

export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble =
      ((bits[i] ?? 0) << 3) |
      ((bits[i + 1] ?? 0) << 2) |
      ((bits[i + 2] ?? 0) << 1) |
      (bits[i + 3] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}

function hexHammingDistance(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x > 0) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist + Math.abs(a.length - b.length) * 4;
}

function normalizeZeroMeanUnit(arr: number[]): number[] {
  const n = arr.length;
  if (n === 0) return [];
  const mean = arr.reduce((acc, v) => acc + v, 0) / n;
  const centered = arr.map((v) => v - mean);
  const norm = Math.sqrt(centered.reduce((acc, v) => acc + v * v, 0));
  if (norm < 1e-8) return centered.map(() => 0);
  return centered.map((v) => round4(v / norm));
}

function normalizeUnit(arr: number[]): number[] {
  const norm = Math.sqrt(arr.reduce((acc, v) => acc + v * v, 0));
  if (norm < 1e-8) return arr.map(() => 0);
  return arr.map((v) => round4(v / norm));
}

function normalizeL1(arr: number[]): number[] {
  const sum = arr.reduce((acc, v) => acc + Math.max(0, v), 0);
  if (sum < 1e-8) return arr.map(() => 0);
  return arr.map((v) => round4(Math.max(0, v) / sum));
}

function dotProduct(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function bhattacharyya(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += Math.sqrt(Math.max(0, a[i]) * Math.max(0, b[i]));
  }
  return clamp(s, 0, 1);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  const s = max < 1e-5 ? 0 : d / max;
  return [h, s, max];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Extracts multi-signal computer vision descriptors from any supported raster image buffer:
 * - SHA-256 byte fingerprint
 * - 64-bit difference hash (dHash) & average hash (aHash)
 * - 8x8 centered facial portrait zero-mean luminance grid
 * - 8x8 pooled Sobel edge magnitude grid (feature structure)
 * - 16-bin directional gradient orientation histogram
 * - 24-bin perceptual color/skin-tone/luminance histogram
 * - 4 dominant palette swatches
 */
export async function extractVisualSignature(
  inputBuffer: Buffer
): Promise<ExtractedImageSignature> {
  const sha256 = crypto.createHash("sha256").update(inputBuffer).digest("hex");

  // Auto-orient according to EXIF and verify metadata
  const oriented = sharp(inputBuffer, { failOn: "truncated" }).rotate();
  const orientedBuf = await oriented.toBuffer();
  const meta = await sharp(orientedBuf).metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions. Please upload a valid PNG, JPG, or WebP file.");
  }

  const width = meta.width;
  const height = meta.height;

  // 1. dHash (9x8 grayscale across whole portrait)
  const dhashRaw = await sharp(orientedBuf)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  const dBits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = dhashRaw[y * 9 + x];
      const right = dhashRaw[y * 9 + x + 1];
      dBits.push(left > right ? 1 : 0);
    }
  }
  const dhash = bitsToHex(dBits);

  // 2. aHash (8x8 grayscale)
  const ahashRaw = await sharp(orientedBuf)
    .grayscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let lumaSum = 0;
  for (let i = 0; i < 64; i++) lumaSum += ahashRaw[i];
  const avgLuma = lumaSum / 64;
  const aBits: number[] = [];
  for (let i = 0; i < 64; i++) {
    aBits.push(ahashRaw[i] >= avgLuma ? 1 : 0);
  }
  const ahash = bitsToHex(aBits);

  // 3. Facial-region center upper portrait crop (focuses on eyes/nose/mouth/hair silhouette)
  const cropLeft = Math.max(0, Math.floor(width * 0.14));
  const cropTop = Math.max(0, Math.floor(height * 0.06));
  const cropW = Math.max(8, Math.min(width - cropLeft, Math.floor(width * 0.72)));
  const cropH = Math.max(8, Math.min(height - cropTop, Math.floor(height * 0.74)));

  const faceGray8 = await sharp(orientedBuf)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .grayscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  const faceGrid = normalizeZeroMeanUnit(Array.from(faceGray8));

  // 4. Sobel edge energy grid (8x8 pooled from 32x32 center crop) + 16-bin orientation histogram
  const sobelSize = 32;
  const centerGray = await sharp(orientedBuf)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .grayscale()
    .resize(sobelSize, sobelSize, { fit: "fill" })
    .raw()
    .toBuffer();

  const edgePool = new Array<number>(64).fill(0);
  const orientBins = new Array<number>(16).fill(0);

  for (let y = 1; y < sobelSize - 1; y++) {
    for (let x = 1; x < sobelSize - 1; x++) {
      const idx = (yy: number, xx: number) => centerGray[yy * sobelSize + xx];
      const gx =
        -idx(y - 1, x - 1) +
        idx(y - 1, x + 1) -
        2 * idx(y, x - 1) +
        2 * idx(y, x + 1) -
        idx(y + 1, x - 1) +
        idx(y + 1, x + 1);
      const gy =
        -idx(y - 1, x - 1) -
        2 * idx(y - 1, x) -
        idx(y - 1, x + 1) +
        idx(y + 1, x - 1) +
        2 * idx(y + 1, x) +
        idx(y + 1, x + 1);
      const mag = Math.sqrt(gx * gx + gy * gy);

      const cellX = Math.min(7, Math.floor(x / 4));
      const cellY = Math.min(7, Math.floor(y / 4));
      edgePool[cellY * 8 + cellX] += mag;

      if (mag > 18) {
        // Unsigned orientation [0, PI) across 16 bins
        let angle = Math.atan2(gy, gx);
        if (angle < 0) angle += Math.PI;
        const bin = Math.min(15, Math.floor((angle / Math.PI) * 16));
        orientBins[bin] += mag;
      }
    }
  }

  const edgeGrid = normalizeUnit(edgePool);
  const orientHist = normalizeL1(orientBins);

  // 5. Color, skin-tone & lighting histogram (24 bins: 12 hue bins + 8 value bins + 4 saturation bins)
  const colorSize = 48;
  const colorRaw = await sharp(orientedBuf)
    .removeAlpha()
    .resize(colorSize, colorSize, { fit: "cover", position: "attention" })
    .raw()
    .toBuffer();

  const hueBins = new Array<number>(12).fill(0);
  const valBins = new Array<number>(8).fill(0);
  const satBins = new Array<number>(4).fill(0);
  let satSum = 0;

  // Color quantization bucket tracking for crisp 4-swatch dominant palette
  const swatchBuckets = new Map<
    string,
    { r: number; g: number; b: number; weight: number }
  >();

  const totalPx = colorSize * colorSize;
  for (let y = 0; y < colorSize; y++) {
    for (let x = 0; x < colorSize; x++) {
      const off = (y * colorSize + x) * 3;
      const r = colorRaw[off];
      const g = colorRaw[off + 1];
      const b = colorRaw[off + 2];

      // Weight center portrait pixels higher than edges
      const dx = (x - colorSize / 2) / (colorSize / 2);
      const dy = (y - colorSize * 0.44) / (colorSize / 2);
      const centerW = 1 + 1.2 * Math.exp(-(dx * dx + dy * dy));

      const [h, s, v] = rgbToHsv(r, g, b);
      satSum += s;

      const hBin = Math.min(11, Math.floor(h * 12));
      const vBin = Math.min(7, Math.floor(v * 8));
      const sBin = Math.min(3, Math.floor(s * 4));

      // Hue contributes proportionally when pixel has chromatic presence
      hueBins[hBin] += centerW * (0.2 + 0.8 * s);
      valBins[vBin] += centerW;
      satBins[sBin] += centerW;

      // Coarse 5-level quantized RGB bucket for palette extraction
      const key = `${Math.floor(r / 48)}-${Math.floor(g / 48)}-${Math.floor(b / 48)}`;
      const entry = swatchBuckets.get(key);
      if (entry) {
        entry.r += r * centerW;
        entry.g += g * centerW;
        entry.b += b * centerW;
        entry.weight += centerW;
      } else {
        swatchBuckets.set(key, {
          r: r * centerW,
          g: g * centerW,
          b: b * centerW,
          weight: centerW,
        });
      }
    }
  }

  const colorHist = [
    ...normalizeL1(hueBins),
    ...normalizeL1(valBins),
    ...normalizeL1(satBins),
  ];

  const sortedBuckets = Array.from(swatchBuckets.values())
    .sort((a, b) => b.weight - a.weight)
    .map((e) => ({
      r: e.r / e.weight,
      g: e.g / e.weight,
      b: e.b / e.weight,
    }));

  const palette: string[] = [];
  const chosen: Array<{ r: number; g: number; b: number }> = [];
  for (const cand of sortedBuckets) {
    const tooClose = chosen.some((c) => {
      const dr = c.r - cand.r;
      const dg = c.g - cand.g;
      const db = c.b - cand.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) < 44;
    });
    if (!tooClose) {
      chosen.push(cand);
      palette.push(rgbToHex(cand.r, cand.g, cand.b));
    }
    if (palette.length >= 4) break;
  }
  while (palette.length < 4 && sortedBuckets.length > 0) {
    const fb = sortedBuckets[palette.length % sortedBuckets.length];
    palette.push(rgbToHex(fb.r, fb.g, fb.b));
  }

  return {
    sha256,
    dhash,
    ahash,
    width,
    height,
    fileSizeBytes: inputBuffer.length,
    visualVector: {
      faceGrid,
      edgeGrid,
      colorHist,
      orientHist,
      palette,
      avgLuma: round4(avgLuma),
      avgSaturation: round4(satSum / totalPx),
    },
  };
}

/**
 * Normalizes and persists an uploaded query or profile image inside public/uploads/
 * returning the web path served via /api/media/[filename] so dynamic production renders never fail.
 */
export async function saveNormalizedImage(
  buffer: Buffer,
  prefix: string,
  maxDim = 960
): Promise<{ filename: string; publicUrl: string; width: number; height: number; size: number }> {
  ensureUploadDir();
  const id = `${prefix}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.jpg`;
  const fullPath = path.join(UPLOAD_DIR, id);

  const output = await sharp(buffer, { failOn: "truncated" })
    .rotate()
    .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  await fs.promises.writeFile(fullPath, output.data);

  return {
    filename: id,
    publicUrl: `/api/media/${id}`,
    width: output.info.width,
    height: output.info.height,
    size: output.info.size,
  };
}

/**
 * Computes calibrated multi-signal visual resemblance between a query image and an indexed profile.
 * Separates exact matches (90-99%), high matches / variants (78-89%), visual resemblances (62-77%),
 * and possible lookalikes (<62%).
 */
export function compareVisualSignatures(
  query: { sha256: string; dhash: string; ahash: string; visualVector: VisualSignaturePayload },
  target: { sha256: string; dhash: string; ahash: string; visualVector: VisualSignaturePayload }
): SimilarityBreakdown {
  if (query.sha256 === target.sha256) {
    return {
      similarityScore: 99,
      structuralScore: 99,
      facialScore: 99,
      toneScore: 99,
      matchType: "exact",
      matchReason: "Exact pixel-for-pixel match with this public profile photo",
    };
  }

  // Structural perceptual hashes
  const dDist = hexHammingDistance(query.dhash, target.dhash);
  const aDist = hexHammingDistance(query.ahash, target.ahash);
  const dSim = clamp(1 - dDist / 64, 0, 1);
  const aSim = clamp(1 - aDist / 64, 0, 1);

  // Contour orientation overlap
  const orientSim = bhattacharyya(
    query.visualVector.orientHist,
    target.visualVector.orientHist
  );

  // Facial center luminance correlation (-1..1 -> 0..1)
  const faceRawDot = dotProduct(
    query.visualVector.faceGrid,
    target.visualVector.faceGrid
  );
  const faceCorr = clamp((faceRawDot + 1) / 2, 0, 1);

  // Pooled edge geometry cosine similarity (0..1)
  const edgeCos = clamp(
    dotProduct(query.visualVector.edgeGrid, target.visualVector.edgeGrid),
    0,
    1
  );

  // Perceptual color, lighting and skin-tone histogram (slice into 3 sub-histograms)
  const qCol = query.visualVector.colorHist;
  const tCol = target.visualVector.colorHist;
  const hueOverlap = bhattacharyya(qCol.slice(0, 12), tCol.slice(0, 12));
  const valOverlap = bhattacharyya(qCol.slice(12, 20), tCol.slice(12, 20));
  const satOverlap = bhattacharyya(qCol.slice(20, 24), tCol.slice(20, 24));
  const satDiff = Math.abs(
    query.visualVector.avgSaturation - target.visualVector.avgSaturation
  );
  const lumaDiff =
    Math.abs(query.visualVector.avgLuma - target.visualVector.avgLuma) / 255;

  // Rescale each descriptor against natural baseline noise so scores separate cleanly
  const rawStructural = clamp(
    0.48 * dSim + 0.24 * aSim + 0.28 * Math.pow(orientSim, 1.8),
    0,
    1
  );
  const rawFacial = clamp(
    0.58 * Math.pow(faceCorr, 1.35) + 0.42 * Math.pow(edgeCos, 1.5),
    0,
    1
  );
  const rawTone = clamp(
    0.42 * Math.pow(hueOverlap, 1.4) +
      0.32 * Math.pow(valOverlap, 1.4) +
      0.16 * Math.pow(satOverlap, 1.2) +
      0.1 * clamp(1 - (satDiff * 0.9 + lumaDiff * 0.7), 0, 1),
    0,
    1
  );

  // Stretch realistic similarity curves cleanly into intuitive 0-99 display scores
  const calibrate = (raw: number, floor: number, ceil: number) => {
    const t = clamp((raw - floor) / (ceil - floor), 0, 1);
    return Math.round(clamp(32 + t * 66, 28, 98));
  };

  let structuralScore = calibrate(rawStructural, 0.42, 0.96);
  let facialScore = calibrate(rawFacial, 0.38, 0.96);
  let toneScore = calibrate(rawTone, 0.44, 0.97);

  // Strongly boost confidence when multiple independent descriptors converge simultaneously
  // (e.g., cropped, recompressed, slightly color-graded photo of the same public profile)
  const sameSubjectSignal =
    faceRawDot >= 0.82 && edgeCos >= 0.88 && dSim >= 0.72 && hueOverlap >= 0.86;
  const nearExactSignal =
    faceRawDot >= 0.92 && edgeCos >= 0.93 && dSim >= 0.82 && aSim >= 0.84;

  let weighted =
    facialScore * 0.44 + structuralScore * 0.32 + toneScore * 0.24;

  if (nearExactSignal) {
    const boost = clamp(
      92 + Math.round((faceRawDot - 0.92) * 75 + (dSim - 0.82) * 20),
      92,
      98
    );
    weighted = Math.max(weighted, boost);
    facialScore = Math.max(facialScore, Math.min(98, boost + 1));
    structuralScore = Math.max(structuralScore, Math.min(97, boost - 1));
    toneScore = Math.max(toneScore, Math.min(97, boost - 2));
  } else if (sameSubjectSignal) {
    const boost = clamp(
      84 + Math.round((faceRawDot - 0.82) * 70),
      84,
      93
    );
    weighted = Math.max(weighted, boost);
    facialScore = Math.max(facialScore, Math.min(95, boost + 1));
  }

  const similarityScore = clamp(Math.round(weighted), 30, 98);

  let matchType: MatchType = "possible";
  if (similarityScore >= 90) matchType = "exact";
  else if (similarityScore >= 78) matchType = "high";
  else if (similarityScore >= 62) matchType = "resemblance";

  const matchReason = buildMatchReason(
    matchType,
    facialScore,
    structuralScore,
    toneScore
  );

  return {
    similarityScore,
    structuralScore,
    facialScore,
    toneScore,
    matchType,
    matchReason,
  };
}

function buildMatchReason(
  matchType: MatchType,
  facial: number,
  structural: number,
  tone: number
): string {
  if (matchType === "exact") {
    return "Near-identical portrait structure, facial geometry, and lighting signature";
  }
  if (matchType === "high") {
    if (facial >= structural && facial >= tone) {
      return "High facial framing match with minor crop or color-grade variation";
    }
    return "Strong perceptual hash alignment and consistent subject palette";
  }
  if (matchType === "resemblance") {
    if (facial >= tone && facial >= structural) {
      return "Notable resemblance in portrait focus geometry and contour layout";
    }
    if (tone >= facial && tone >= structural) {
      return "Closely matched skin-tone lighting, framing, and tonal mood";
    }
    return "Comparable edge structure and studio headshot composition";
  }
  if (tone >= facial) {
    return "Light visual resemblance in ambient lighting and color register";
  }
  return "Subtle silhouette and headshot pose similarity";
}
