"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// The landing page (/) and other public marketing routes render full-bleed with no
// app sidebar. Everything else gets the dashboard shell.
const BARE_ROUTES = ["/", "/login"];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.includes(pathname);

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
