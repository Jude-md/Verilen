import fs from "fs";
import path from "path";

/**
 * Runtime-safe secret store for live discovery providers:
 *   - SERPAPI_API_KEY (alias: SERPAPI_KEY) — Google Lens reverse image search
 *   - APIFY_API_TOKEN (alias: APIFY_TOKEN) — Apify automation-lab/social-media-profile-finder
 *   - APIFY_PROFILE_FINDER_SERVER_URL      — Optional Apify Standby Server URL
 *
 * Automatically reads environment secrets configured on the platform/sandbox
 * first (no manual input needed), and also re-reads `.env` on change so a key
 * saved from the Settings modal takes effect immediately without a restart.
 */

const ENV_PATH = path.join(process.cwd(), ".env");

const globalForEnv = globalThis as typeof globalThis & {
  __veriLensEnvCache?: { mtimeMs: number; map: Map<string, string> };
};

export type SecretSource = "env" | "dotenv" | null;

const SECRET_COMMENTS: Record<string, string> = {
  SERPAPI_API_KEY: "Optional Google Lens upgrade key (SerpApi)",
  APIFY_API_TOKEN: "Optional Apify Actor token (automation-lab/social-media-profile-finder)",
  APIFY_PROFILE_FINDER_SERVER_URL: "Optional Apify Standby Server URL",
};

function loadDotEnvMap(): Map<string, string> {
  try {
    const stat = fs.statSync(ENV_PATH);
    const cache = globalForEnv.__veriLensEnvCache;
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.map;

    const raw = fs.readFileSync(ENV_PATH, "utf8");
    const map = new Map<string, string>();
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (val) map.set(key, val);
    }
    globalForEnv.__veriLensEnvCache = { mtimeMs: stat.mtimeMs, map };
    return map;
  } catch {
    return new Map();
  }
}

/** Reads a secret from process.env (or fallback aliases), then from live `.env`. */
export function readSecret(name: string, aliases: string[] = []): string | undefined {
  const dotMap = loadDotEnvMap();
  for (const key of [name, ...aliases]) {
    const fromEnv = process.env[key]?.trim();
    if (fromEnv) return fromEnv;
    const fromFile = dotMap.get(key)?.trim();
    if (fromFile) return fromFile;
  }
  return undefined;
}

/** Identifies whether a secret came from the host environment or local `.env`. */
export function readSecretWithSource(
  name: string,
  aliases: string[] = []
): { value: string | undefined; source: SecretSource; envName: string | null } {
  const dotMap = loadDotEnvMap();
  for (const key of [name, ...aliases]) {
    const fileVal = dotMap.get(key)?.trim();
    const envVal = process.env[key]?.trim();
    if (envVal && fileVal && envVal === fileVal) {
      return { value: envVal, source: "dotenv", envName: key };
    }
    if (envVal) {
      return { value: envVal, source: "env", envName: key };
    }
    if (fileVal) {
      return { value: fileVal, source: "dotenv", envName: key };
    }
  }
  return { value: undefined, source: null, envName: null };
}

/** Writes or removes a secret inside `.env` (mode 0600) and updates `process.env` live. */
export function writeSecret(name: string, value: string | null): void {
  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf8");
  } catch {
    content = "";
  }

  const lines = content.split(/\r?\n/);
  const prefix = `${name}=`;
  const commentLabel = SECRET_COMMENTS[name];
  const nextLine = value === null ? null : `${name}=${value.replace(/[\r\n]/g, "")}`;

  let replaced = false;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      replaced = true;
      if (nextLine !== null) {
        out.push(nextLine);
      } else if (
        commentLabel &&
        out.length > 0 &&
        out[out.length - 1].trim() === `# ${commentLabel}`
      ) {
        out.pop();
      }
      continue;
    }
    out.push(line);
  }

  // Collapse extra trailing blank lines cleanly
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();

  if (!replaced && nextLine !== null) {
    if (out.length > 0) out.push("");
    if (commentLabel) out.push(`# ${commentLabel}`);
    out.push(nextLine);
  }

  const finalBody = out.length > 0 ? `${out.join("\n")}\n` : "";
  fs.writeFileSync(ENV_PATH, finalBody, { mode: 0o600 });
  globalForEnv.__veriLensEnvCache = undefined;

  if (value !== null) {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

export function maskKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 10) return "••••••";
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}
