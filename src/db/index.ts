import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy PostgreSQL connection.
 *
 * IMPORTANT (Vercel / CI): Next.js imports route modules during the build
 * ("Collecting page data"). Throwing at module scope breaks the build when
 * DATABASE_URL is not injected yet, so this module must never evaluate the
 * connection eagerly. The pool is created on first real query instead.
 */

const globalForDb = globalThis as typeof globalThis & {
  __veriLensPool?: Pool;
  __veriLensDb?: NodePgDatabase;
  __veriLensWarned?: boolean;
};

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

/** True when a PostgreSQL connection string is available at runtime. */
export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

function needsSsl(connectionString: string): boolean {
  if (/[?&]sslmode=(require|prefer|verify-ca|verify-full)/i.test(connectionString)) {
    return false; // pg honours sslmode from the URL
  }
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host === "host.docker.internal"
    );
  } catch {
    return false;
  }
}

function createPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return new Pool({
    connectionString,
    // Serverless-friendly pool sizing (Vercel functions)
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ...(needsSsl(connectionString)
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
}

function getPoolInstance(): Pool {
  if (!globalForDb.__veriLensPool) {
    globalForDb.__veriLensPool = createPool();
  }
  return globalForDb.__veriLensPool;
}

function getDbInstance(): NodePgDatabase {
  if (!globalForDb.__veriLensDb) {
    globalForDb.__veriLensDb = drizzle(getPoolInstance());
  }
  return globalForDb.__veriLensDb;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const instance = getPoolInstance();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * Drizzle client that resolves the underlying connection on first use, so
 * importing this module during a build without DATABASE_URL never throws.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    if (!isDatabaseConfigured()) {
      if (!globalForDb.__veriLensWarned) {
        globalForDb.__veriLensWarned = true;
        console.warn(
          "[verilens] DATABASE_URL is not set — persistence is disabled (live web search still works)."
        );
      }
      throw new Error("DATABASE_URL is not configured");
    }
    const instance = getDbInstance();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has() {
    return isDatabaseConfigured();
  },
});
