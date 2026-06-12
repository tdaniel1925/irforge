// Applies supabase/schema.sql to the project via the Postgres REST RPC.
// Run: node scripts/apply-schema.mjs   (needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL)
import fs from "fs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sql = fs.readFileSync("supabase/schema.sql", "utf-8");

// Supabase has no public "run arbitrary SQL" REST endpoint by default. We use the
// Postgres connection via the SQL-over-HTTP "pg-meta" query endpoint that the dashboard uses.
const res = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

if (res.ok) {
  console.log("✓ schema applied via exec_sql RPC");
} else {
  const t = await res.text();
  console.error(`exec_sql not available (${res.status}). ${t.slice(0, 200)}`);
  console.error("\n→ Run supabase/schema.sql manually: Supabase dashboard → SQL Editor → paste → Run.");
  process.exit(2);
}
