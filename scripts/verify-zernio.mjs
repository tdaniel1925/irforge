// Verify the Zernio API shapes our client assumes are correct, against the live
// API. Read-mostly: creates one throwaway profile, inspects responses, cleans up.
//   node scripts/verify-zernio.mjs

import fs from "fs";
const env = {};
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (!m) continue;
  let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const KEY = env.ZERNIO_API_KEY;
const BASE = "https://zernio.com/api/v1";
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const j = (o) => JSON.stringify(o).slice(0, 400);

(async () => {
  console.log("\n=== Zernio API verification ===\n");
  console.log("key present:", Boolean(KEY), KEY ? `(${KEY.slice(0, 8)}…)` : "");

  // 1) Auth probe — list profiles (or users) to confirm the key works + base path.
  for (const path of ["/profiles", "/users"]) {
    try {
      const r = await fetch(BASE + path, { headers: H });
      const d = await r.json().catch(() => ({}));
      console.log(`GET ${path} -> HTTP ${r.status} | keys: ${Object.keys(d).join(", ") || "(array?)"} | ${j(d)}`);
    } catch (e) { console.log(`GET ${path} -> ${String(e).slice(0, 80)}`); }
  }

  // 2) Create a profile — confirm the id field name.
  let profId = null;
  try {
    const r = await fetch(BASE + "/profiles", { method: "POST", headers: H, body: JSON.stringify({ name: "ZZ verify · delete me", description: "verify" }) });
    const d = await r.json().catch(() => ({}));
    profId = d?.profile?._id ?? d?.profile?.id ?? d?._id ?? d?.id ?? d?.profileId;
    console.log(`\nPOST /profiles -> HTTP ${r.status} | resolved id: ${profId} | ${j(d)}`);
  } catch (e) { console.log("create profile failed:", String(e).slice(0, 100)); }

  if (profId) {
    // 3) Accounts list shape.
    for (const path of [`/profiles/${profId}/accounts`, `/profiles/${profId}`]) {
      try {
        const r = await fetch(BASE + path, { headers: H });
        const d = await r.json().catch(() => ({}));
        console.log(`GET ${path} -> HTTP ${r.status} | ${j(d)}`);
      } catch (e) { console.log(`GET ${path} -> ${String(e).slice(0, 80)}`); }
    }
    // 4) Connect-link endpoint shape.
    try {
      const r = await fetch(BASE + `/profiles/${profId}/connect-link`, { method: "POST", headers: H, body: "{}" });
      const d = await r.json().catch(() => ({}));
      console.log(`POST /profiles/{id}/connect-link -> HTTP ${r.status} | ${j(d)}`);
    } catch (e) { console.log("connect-link ->", String(e).slice(0, 80)); }
    // also try the documented connect entry
    try {
      const r = await fetch(BASE + `/connect/twitter?profileId=${profId}`, { headers: H, redirect: "manual" });
      console.log(`GET /connect/twitter?profileId= -> HTTP ${r.status} | location: ${r.headers.get("location") || "(none)"}`);
    } catch (e) { console.log("connect/twitter ->", String(e).slice(0, 80)); }

    // 5) Cleanup.
    try {
      const r = await fetch(BASE + `/profiles/${profId}`, { method: "DELETE", headers: H });
      console.log(`\nDELETE /profiles/{id} -> HTTP ${r.status} (cleanup)`);
    } catch (e) { console.log("cleanup ->", String(e).slice(0, 80)); }
  }
  console.log("\n=== done ===\n");
})();
