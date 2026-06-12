// Rename brand IRForge → PubcoZone across user-facing text.
// Handles plain "IRForge" mentions. The styled split logos are handled separately.
import fs from "fs";
import path from "path";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", ".git", "data"].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(tsx?|md|sql)$/.test(e.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const f of walk("app").concat(walk("components"), walk("lib"))) {
  let s = fs.readFileSync(f, "utf-8");
  const before = s;
  s = s.replace(/IRForge/g, "PubcoZone");
  if (s !== before) { fs.writeFileSync(f, s, "utf-8"); changed++; console.log(`✓ ${f}`); }
}
console.log(`\n${changed} files renamed (IRForge → PubcoZone).`);
