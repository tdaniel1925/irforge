// One-time codemod: migrate API routes from the local JSON store (getDb/saveDb)
// to the dual-mode getStore() seam. Idempotent — safe to re-run.
import fs from "fs";

const FILES = [
  "app/api/calendar/route.ts",
  "app/api/claim/route.ts",
  "app/api/disclosure/route.ts",
  "app/api/drafts/route.ts",
  "app/api/filings/add/route.ts",
  "app/api/filings/sync/route.ts",
  "app/api/filings/[id]/generate/route.ts",
  "app/api/investors/[id]/route.ts",
  "app/api/mentions/[id]/reply/route.ts",
  "app/api/press/route.ts",
  "app/api/questions/route.ts",
  "app/api/questions/[id]/draft/route.ts",
  "app/api/score/route.ts",
  "app/api/threats/rebut/route.ts",
  "app/api/threats/route.ts",
];

let changed = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log(`skip (missing): ${f}`); continue; }
  let s = fs.readFileSync(f, "utf-8");
  const before = s;

  // 1. Imports: ensure getStore is imported, drop getDb/saveDb from the @/lib/db import.
  s = s.replace(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/db";/g, (_m, inner) => {
    const names = inner.split(",").map((x) => x.trim()).filter(Boolean);
    const kept = names.filter((n) => n !== "getDb" && n !== "saveDb");
    if (!kept.includes("getStore")) kept.unshift("getStore");
    return `import { ${kept.join(", ")} } from "@/lib/db";`;
  });

  // 2. const db = getDb();  ->  const { db, save } = await getStore();
  s = s.replace(/const\s+db\s*=\s*getDb\(\);/g, "const { db, save } = await getStore();");

  // 3. saveDb(db);  ->  await save();
  s = s.replace(/saveDb\(db\);/g, "await save();");

  if (s !== before) { fs.writeFileSync(f, s, "utf-8"); console.log(`✓ ${f}`); changed++; }
  else console.log(`· no change: ${f}`);
}
console.log(`\n${changed} files migrated.`);
