// One-off security triage: classify every app/api route by middleware exposure and
// in-route auth markers. Read-only; prints a report.
import fs from "fs";
import path from "path";

const routes = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/^route\.(ts|tsx)$/.test(e.name)) routes.push(p);
  }
})("app/api");

const PUB = ["/", "/login", "/auth", "/privacy", "/terms", "/how-its-legal", "/t", "/discover", "/sample-brief", "/snapshot", "/for-investors", "/for-companies", "/accept-invite", "/embed", "/welcome", "/api/health", "/api/board", "/api/claim", "/api/questions", "/api/ticker-audit", "/api/sec-feed", "/api/chart", "/api/trending", "/api/movers", "/api/buzz", "/api/risk", "/api/og", "/api/badge", "/api/promo", "/api/watch", "/api/billing/webhook", "/api/member-billing/webhook", "/api/email/webhook", "/api/cron", "/_next", "/img", "/favicon"];
const isPublic = (p) => p === "/" || PUB.some((x) => x !== "/" && (p === x || p.startsWith(x + "/")));

const MARKERS = {
  company: "getMyCompany",
  role: "getMyRole",
  superadmin: "isSuperAdmin",
  member: "getMyMember",
  cron: "cronAuthorized",
  stripeSig: "constructEvent",
  svix: "verifySvix",
  authedGuard: "!authed",
  rate: "rateAllow",
};

const rows = [];
for (const f of routes) {
  const src = fs.readFileSync(f, "utf8");
  const url = "/" + path.dirname(f).split(path.sep).join("/").replace(/^app\//, "").replace(/\[([^\]]+)\]/g, "X");
  const methods = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)/g)].map((m) => m[1]);
  const marks = Object.entries(MARKERS).filter(([, v]) => src.includes(v)).map(([k]) => k);
  const mutates = methods.some((m) => m !== "GET");
  rows.push({ url, methods: methods.join(",") || "-", pub: isPublic(url), marks: marks.join(",") || "NONE", mutates });
}
rows.sort((a, b) => (b.pub ? 1 : 0) - (a.pub ? 1 : 0) || a.url.localeCompare(b.url));

console.log("total routes:", rows.length);
console.log("\n--- PUBLIC-BY-MIDDLEWARE (must have in-route auth or be safe anonymous) ---");
for (const r of rows.filter((r) => r.pub)) {
  console.log((r.marks === "NONE" ? "!! " : "   ") + r.url.padEnd(46) + r.methods.padEnd(20) + r.marks);
}
console.log("\n--- PROTECTED but NO in-route auth markers (defense-in-depth gaps) ---");
for (const r of rows.filter((r) => !r.pub && r.marks === "NONE")) {
  console.log(((r.mutates ? "!m " : "   ")) + r.url.padEnd(46) + r.methods.padEnd(20));
}
console.log("\nprotected routes WITH markers:", rows.filter((r) => !r.pub && r.marks !== "NONE").length);
