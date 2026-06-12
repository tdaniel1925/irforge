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

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const tmp = CACHE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache), "utf-8");
  fs.renameSync(tmp, CACHE_FILE);
}

export async function getPublicTickerAudit(ticker: string, peers: string[] = []): Promise<TickerAudit> {
  const key = `${ticker.toUpperCase()}|${peers.map((p) => p.toUpperCase()).sort().join(",")}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.audit;

  const audit = await runTickerAudit(ticker, peers);

  // Prune stale entries while we're here.
  const fresh: Record<string, CacheEntry> = {};
  for (const k of Object.keys(cache)) {
    if (Date.now() - cache[k].ts < TTL_MS) fresh[k] = cache[k];
  }
  fresh[key] = { ts: Date.now(), audit };
  writeCache(fresh);
  return audit;
}
