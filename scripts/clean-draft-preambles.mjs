// One-off cleanup: strip AI preamble tweets ("Here is the thread:", etc.) from
// drafts already stored in company_data before the parseTweets fix shipped.
// Run: node scripts/clean-draft-preambles.mjs           (dry run — shows changes)
//      node scripts/clean-draft-preambles.mjs --apply    (writes the cleaned drafts)

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

try {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
if (!URL || !KEY) { console.error("Missing Supabase env"); process.exit(1); }

// Mirror of lib/ai.ts isPreambleLine.
const PREAMBLE_RE = /^(here'?s?( is| are)?|sure|here you go|of course|certainly|below( is| are)?|the (thread|tweets?|posts?)|i'?ve (written|drafted)|happy to help)\b.*?(thread|tweets?|posts?|:)\s*$/i;
function isPreamble(t) {
  const s = String(t || "").trim();
  if (!s) return true;
  if (PREAMBLE_RE.test(s)) return true;
  if (s.length <= 40 && /:$/.test(s) && /\b(thread|tweets?|posts?|here)\b/i.test(s)) return true;
  return false;
}

const svc = createClient(URL, KEY, { auth: { persistSession: false } });

const { data, error } = await svc
  .from("company_data")
  .select("company_id, data")
  .eq("collection", "drafts");
if (error) { console.error("read failed:", error.message); process.exit(1); }

let companiesChanged = 0;
let draftsChanged = 0;

for (const row of data ?? []) {
  const drafts = Array.isArray(row.data) ? row.data : [];
  let changed = false;
  for (const d of drafts) {
    if (!Array.isArray(d.tweets)) continue;
    const cleaned = d.tweets.filter((t) => !isPreamble(t));
    if (cleaned.length !== d.tweets.length && cleaned.length > 0) {
      console.log(`  [${row.company_id.slice(0, 8)}] "${(d.title || d.id || "").toString().slice(0, 40)}": ${d.tweets.length} -> ${cleaned.length} tweets (removed: ${JSON.stringify(d.tweets.filter((t) => isPreamble(t)))})`);
      d.tweets = cleaned;
      changed = true;
      draftsChanged++;
    }
  }
  if (changed) {
    companiesChanged++;
    if (APPLY) {
      const { error: upErr } = await svc
        .from("company_data")
        .update({ data: drafts, updated_at: new Date().toISOString() })
        .eq("company_id", row.company_id)
        .eq("collection", "drafts");
      if (upErr) console.error(`  write failed for ${row.company_id}:`, upErr.message);
    }
  }
}

console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"}: ${draftsChanged} draft(s) across ${companiesChanged} company(ies) ${APPLY ? "cleaned" : "would be cleaned"}.`);
if (!APPLY && draftsChanged > 0) console.log("Re-run with --apply to write the changes.");
