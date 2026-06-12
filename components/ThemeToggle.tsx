"use client";

import { useEffect, useState } from "react";

// Light is the default; choice persists in localStorage and is applied via a
// `dark` class on <html> (Tailwind darkMode: "class").
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("irforge-theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("irforge-theme", next ? "dark" : "light");
  };

  if (!mounted) return <div className="h-9 w-9" />;

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-app text-base text-muted transition hover:bg-app-hover"
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
