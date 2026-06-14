import type { MetadataRoute } from "next";

const BASE = "https://pubcozone.com";

// A seed set of well-known tickers so search engines discover ticker pages.
// In production this would be generated from the full ticker universe / claimed pages.
const SEED_TICKERS = [
  "LAC", "SGML", "ALB", "PLL", "MP", "UEC", "CCJ", "DNN", "NB", "ABAT",
  "PFE", "MRNA", "NVAX", "OCGN", "SAVA", "CRBP",
  "RIOT", "MARA", "HUT", "BITF", "CIFR",
  "PLUG", "FCEL", "BE", "QS", "CHPT",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/how-its-legal`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/t`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/discover`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
  ];
  const tickerPages: MetadataRoute.Sitemap = SEED_TICKERS.map((t) => ({
    url: `${BASE}/t/${t}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));
  return [...staticPages, ...tickerPages];
}
