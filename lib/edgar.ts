import type { Filing } from "./types";

// Live EDGAR sync — keyless SEC API, requires a descriptive User-Agent.
// Fails gracefully: callers fall back to existing/demo data when offline.

const FORMS = new Set(["8-K", "10-Q", "10-K", "S-1", "6-K", "20-F", "424B4"]);

export async function fetchEdgarFilings(cik: string): Promise<Filing[] | { error: string }> {
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, {
      headers: { "User-Agent": "PubcoZone Demo contact@irforge.app" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { error: `EDGAR returned ${res.status} — check the CIK in Settings.` };
    const data = await res.json();
    const recent = data?.filings?.recent;
    if (!recent?.accessionNumber) return { error: "Unexpected EDGAR response shape." };

    const out: Filing[] = [];
    for (let i = 0; i < recent.accessionNumber.length && out.length < 10; i++) {
      const form = recent.form[i];
      if (!FORMS.has(form)) continue;
      const accession = String(recent.accessionNumber[i]).replace(/-/g, "");
      out.push({
        id: `edg_${recent.accessionNumber[i]}`,
        form,
        title: recent.primaryDocDescription?.[i] || `${form} — ${data.name}`,
        filedAt: new Date(recent.filingDate[i]).toISOString(),
        url: `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accession}/${recent.primaryDocument[i]}`,
        summary: `${form} filed ${recent.filingDate[i]} by ${data.name}. Open the filing for full contents; AI drafting will summarize from the public document.`,
        source: "edgar",
      });
    }
    return out;
  } catch {
    return { error: "Could not reach EDGAR (offline or blocked). Demo filings remain available." };
  }
}
