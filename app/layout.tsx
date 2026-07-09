import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppFrame from "@/components/AppFrame";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PubcoZone — Research any stock. The real story, not the hype.",
  description:
    "Free, filing-based research on any public company — price, cash, insiders, short interest — plus a board where hype and FUD get AI-flagged and the company answers on the record. For investors who want signal over noise, and companies that want a voice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apply saved theme before paint to avoid a flash. Light is default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('irforge-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.className} bg-app text-app`}>
        <AppFrame>{children}</AppFrame>
        {/* Privacy-friendly site-wide visitor analytics (enable in Vercel dashboard). */}
        <Analytics />
      </body>
    </html>
  );
}
