import "server-only";

import { Pool } from "pg";

declare global {
  var auraFarmReviewPool: Pool | undefined;
  var auraFarmReviewPoolConnectionString: string | undefined;
}

function createPool(connectionString: string) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return new Pool({
    connectionString,
    max: 1,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const currentPool = globalThis.auraFarmReviewPool;
  const currentConnectionString = globalThis.auraFarmReviewPoolConnectionString;

  if (currentPool && currentConnectionString === connectionString) {
    return currentPool;
  }

  if (currentPool) {
    void currentPool.end().catch(() => undefined);
  }

  const nextPool = createPool(connectionString);
  globalThis.auraFarmReviewPool = nextPool;
  globalThis.auraFarmReviewPoolConnectionString = connectionString;

  return nextPool;
}

export const db = getPool();
