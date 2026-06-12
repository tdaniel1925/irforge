import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppFrame from "@/components/AppFrame";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PubcoZone — Talk back to your investors. Legally.",
  description:
    "AI-powered investor relations for public companies. Turn SEC filings into compliant updates, answer shareholders from the public record, and defend your name — all approved by you with one tap.",
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
      </body>
    </html>
  );
}
