import type { Feature } from "./billing";

// Which paid feature each dashboard route requires — matched by PREFIX so nested
// routes inherit their parent's gate. Lives here (not in AppFrame) so the
// whole-segment matching rule is unit-testable — the same class of bug that bit
// publicRoutes ("/t" wrongly matching "/team") applies here too.
//
// Exact-path matching (the old behavior) silently left paid SUBROUTES ungated:
// /crm/import, /social/quickpost, etc. rendered with no upgrade wall. Prefix
// matching + mapping the whole /social tree closes that.
export const ROUTE_FEATURE: Record<string, Feature> = {
  "/app": "approvals",
  "/do": "approvals",
  "/approvals": "approvals",
  "/filings": "approvals",
  "/mentions": "approvals",
  "/proof": "proof",
  "/documents": "vault",
  "/company": "threats",
  "/crm": "crm",
  "/studio": "studio",
  "/social": "studio",   // the whole social engine sits behind the studio feature
  "/calendar": "calendar",
  "/captable": "captable",
  "/analyzer": "analyzer",
};

// Longest whole-segment prefix match. "/crm" matches "/crm" and "/crm/import"
// but NOT "/crm-x". Longest wins so a more specific mapping could override a
// broader one if ever added.
export function featureForPath(pathname: string): Feature | undefined {
  let best: { prefix: string; feature: Feature } | undefined;
  for (const [prefix, feature] of Object.entries(ROUTE_FEATURE)) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && (!best || prefix.length > best.prefix.length)) {
      best = { prefix, feature };
    }
  }
  return best?.feature;
}
