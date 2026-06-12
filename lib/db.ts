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
