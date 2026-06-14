import fs from "fs";
import path from "path";
import { runTickerAudit, type TickerAudit } from "./audit";

// Public ticker pages cache audits for 15 minutes so repeat visits are instant
// and we stay polite to the upstream public APIs.

const CACHE_FILE = path.join(process.cwd(), "data", "ticker-cache.json");
const TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  ts: number;
  audit: TickerAudit;
}

// On serverless hosts (Vercel) the project dir is READ-ONLY, so fs writes throw
// EROFS. We must never let a cache read/write failure take down a page that
// otherwise has perfectly good live data. The file cache is a best-effort
// optimization for the local/long-lived process; an in-memory map covers the
// warm serverless instance.
const memCache = new Map<string, CacheEntry>();

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmp = CACHE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache), "utf-8");
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    // Read-only FS (serverless) or disk error — ignore; memCache still holds it.
  }
}

export async function getPublicTickerAudit(ticker: string, peers: string[] = []): Promise<TickerAudit> {
  const key = `${ticker.toUpperCase()}|${peers.map((p) => p.toUpperCase()).sort().join(",")}`;

  // 1) In-memory hit (survives within a warm serverless instance).
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < TTL_MS) return mem.audit;

  // 2) File hit (local/long-lived process). Never let a bad file throw.
  let cache: Record<string, CacheEntry> = {};
  try {
    cache = readCache();
  } catch {
    cache = {};
  }
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < TTL_MS) {
    memCache.set(key, hit);
    return hit.audit;
  }

  // 3) Recompute live. runTickerAudit degrades per-source and always resolves.
  const audit = await runTickerAudit(ticker, peers);
  const entry: CacheEntry = { ts: Date.now(), audit };
  memCache.set(key, entry);

  // Best-effort persist (no-op on read-only FS). Prune stale entries while here.
  const fresh: Record<string, CacheEntry> = {};
  for (const k of Object.keys(cache)) {
    if (Date.now() - cache[k].ts < TTL_MS) fresh[k] = cache[k];
  }
  fresh[key] = entry;
  writeCache(fresh);

  return audit;
}
