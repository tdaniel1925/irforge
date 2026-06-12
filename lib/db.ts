import fs from "fs";
import path from "path";
import type { AuditEvent, Database } from "./types";
import { buildSeed } from "./seed";

// Local-first JSON store. Seeds itself on first access — zero setup.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let cache: Database | null = null;

export function getDb(): Database {
  if (cache) return cache;
  if (fs.existsSync(DB_FILE)) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as Database;
    // Forward-compat: fields added after a db.json was created default safely.
    if (!cache.scoreHistory) cache.scoreHistory = [];
    if (!cache.publicQuestions) cache.publicQuestions = [];
    if (!cache.pressReleases) cache.pressReleases = [];
    if (!cache.disclosureChecks) cache.disclosureChecks = [];
    if (!cache.calendar) cache.calendar = [];
  } else {
    cache = buildSeed();
    persist(cache);
  }
  return cache;
}

export function saveDb(db: Database): void {
  cache = db;
  persist(db);
}

function persist(db: Database): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf-8");
  fs.renameSync(tmp, DB_FILE);
}

export function resetDb(): Database {
  cache = buildSeed();
  persist(cache);
  return cache;
}

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

// Unified accessor: returns the logged-in user's Supabase-backed DB when available,
// otherwise the local JSON store. Routes call this, mutate db, then call ctx.save().
// This is the single seam that makes every route multi-tenant without rewriting its logic.
export async function getStore(): Promise<{ db: Database; save: () => Promise<void>; authed: boolean }> {
  // Lazy import to avoid loading Supabase server deps in non-route contexts.
  const { loadCompanyDb } = await import("./supabase/store");
  const remote = await loadCompanyDb();
  if (remote) {
    return { db: remote.db, save: remote.save, authed: true };
  }
  const db = getDb();
  return { db, save: async () => saveDb(db), authed: false };
}

// Audit log is append-only by construction: this is the only writer.
export function logAudit(db: Database, actor: string, action: string, detail: string): void {
  const event: AuditEvent = {
    id: newId("aud"),
    ts: new Date().toISOString(),
    actor,
    action,
    detail,
  };
  db.audit.unshift(event);
}
