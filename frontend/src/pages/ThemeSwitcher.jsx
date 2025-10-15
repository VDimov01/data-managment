import { useEffect, useState } from "react";

const THEME_KEY = "theme"; // 'light' | 'dark' | 'auto'

function applyTheme(mode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const forceDark = mode === "dark" || (mode === "auto" && prefersDark);
  root.setAttribute("data-theme", forceDark ? "dark" : "light");
  localStorage.setItem(THEME_KEY, mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState(() => localStorage.getItem(THEME_KEY) || "auto");

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== "auto") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [mode]);

  return (
    <div className="btn-row" aria-label="Theme selector">
      <button className={"btn" + (mode==="light"?" btn-active":"")} onClick={() => setMode("light")}>Light</button>
      <button className={"btn" + (mode==="dark" ?" btn-active":"")} onClick={() => setMode("dark")}>Dark</button>
      <button className={"btn" + (mode==="auto" ?" btn-active":"")} onClick={() => setMode("auto")}>Auto</button>
    </div>
  );
}
