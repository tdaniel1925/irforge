import type { CapTableEntry, ConvertibleNote } from "./types";

// Shares a convertible note would convert into. Fixed: principal/conversionPrice.
// Variable: principal / (marketPrice * (1 - discount)) — the "toxic"/death-spiral case,
// where a falling price means MORE shares (the danger we surface).
export function noteShares(n: ConvertibleNote, marketPrice: number): number {
  if (n.status !== "outstanding") return 0;
  if (n.conversionType === "fixed" && n.conversionPrice && n.conversionPrice > 0) {
    return Math.round(n.principal / n.conversionPrice);
  }
  if (n.conversionType === "variable" && marketPrice > 0) {
    const eff = marketPrice * (1 - (n.discountPct ?? 0) / 100);
    if (eff > 0) return Math.round(n.principal / eff);
  }
  return 0;
}

export interface DilutionSummary {
  common: number;
  preferred: number;
  insider: number;
  options: number;
  warrants: number;
  noteShares: number;
  basic: number; // common + preferred + insider
  fullyDiluted: number; // + options + warrants + note conversions
  overhangPct: number; // (fullyDiluted - basic) / basic
  hasVariableNote: boolean;
}

export function computeDilution(cap: CapTableEntry[], notes: ConvertibleNote[], marketPrice: number): DilutionSummary {
  const sum = (cls: string) => cap.filter((e) => e.class === cls).reduce((a, e) => a + e.shares, 0);
  const common = sum("common");
  const preferred = sum("preferred");
  const insider = sum("insider");
  const options = sum("options");
  const warrants = sum("warrants");
  const ns = notes.reduce((a, n) => a + noteShares(n, marketPrice), 0);
  const basic = common + preferred + insider;
  const fullyDiluted = basic + options + warrants + ns;
  return {
    common, preferred, insider, options, warrants,
    noteShares: ns,
    basic,
    fullyDiluted,
    overhangPct: basic > 0 ? ((fullyDiluted - basic) / basic) * 100 : 0,
    hasVariableNote: notes.some((n) => n.status === "outstanding" && n.conversionType === "variable"),
  };
}
