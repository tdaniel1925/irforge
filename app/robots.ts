import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/t", "/how-its-legal"],
        // Keep the logged-in app and APIs out of the index.
        disallow: ["/app", "/admin", "/api/", "/billing", "/settings", "/crm", "/captable", "/analyzer", "/documents", "/studio", "/calendar", "/proof", "/company", "/do", "/onboarding"],
      },
    ],
    sitemap: "https://pubcozone.com/sitemap.xml",
  };
}
