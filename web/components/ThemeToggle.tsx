"use client";
import { useTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="th-toggle" role="radiogroup" aria-label="Vzhľad webu">
      <button type="button" role="radio" aria-checked={theme === "dark"} aria-label="Tmavý vzhľad" title="Tmavý" className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.500A8.500 8.500 0 0 1 9.500 4a8.500 8.500 0 1 0 10.500 10.500Z" />
        </svg>
      </button>
      <button type="button" role="radio" aria-checked={theme === "soft"} aria-label="Svetlejší vzhľad" title="Svetlejší" className={theme === "soft" ? "on" : ""} onClick={() => setTheme("soft")}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M18.400 5.600 17 7M7 17l-1.400 1.400" />
        </svg>
      </button>
    </div>
  );
}
