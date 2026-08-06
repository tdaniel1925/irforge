import fs from "fs";
import path from "path";
import type { AuditEvent, Database } from "./types";
import { buildSeed, emptyDb } from "./seed";

// In production / multi-tenant mode (AUTH_ENABLED), real data lives per-company in
// Supabase. The legacy single-tenant JSON store must NEVER serve demo (Meridian
// Lithium) data — public pages and fallbacks get a clean empty DB instead.
const PROD_MODE = process.env.AUTH_ENABLED === "1";

// Local-first JSON store. Seeds itself on first access — zero setup.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let cache: Database | null = null;

export function getDb(): Database {
  if (cache) return cache;
  // Production: never seed, never read/write the local file — return a clean empty DB.
  if (PROD_MODE) {
    cache = emptyDb();
    return cache;
  }
  if (fs.existsSync(DB_FILE)) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as Database;
    // Forward-compat: fields added after a db.json was created default safely.
    if (!cache.scoreHistory) cache.scoreHistory = [];
    if (!cache.publicQuestions) cache.publicQuestions = [];
    if (!cache.pressReleases) cache.pressReleases = [];
    if (!cache.disclosureChecks) cache.disclosureChecks = [];
    if (!cache.calendar) cache.calendar = [];
    if (!cache.contacts) cache.contacts = [];
    if (!cache.documents) cache.documents = [];
    if (!cache.docAnalyses) cache.docAnalyses = [];
    if (!cache.convertibleNotes) cache.convertibleNotes = [];
    if (!cache.capTable) cache.capTable = [];
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
  // In production this is a no-op-ish clean reset (empty), never the demo seed.
  cache = PROD_MODE ? emptyDb() : buildSeed();
  if (!PROD_MODE) persist(cache);
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

// Save + translate a concurrency conflict into a ready 409 response. Routes that
// want proper "someone else edited this — reload" behavior (instead of a generic
// 500) wrap their save() with this:
//   const conflict = await saveOr409(ctx.save);
//   if (conflict) return conflict;
// Returns null on success, or a 409 NextResponse when a StaleWriteError occurred.
export async function saveOr409(save: () => Promise<void>): Promise<import("next/server").NextResponse | null> {
  const { StaleWriteError, SuspendedCompanyError } = await import("./supabase/store");
  const { NextResponse } = await import("next/server");
  try {
    await save();
    return null;
  } catch (e) {
    if (e instanceof SuspendedCompanyError) {
      return NextResponse.json({ error: e.message, suspended: true }, { status: 403 });
    }
    if (e instanceof StaleWriteError) {
      return NextResponse.json({ error: e.message, conflict: true }, { status: 409 });
    }
    throw e; // not a concurrency issue — let the route's own handler deal with it
  }
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
