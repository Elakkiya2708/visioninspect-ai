import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const classes = onDark
    ? "border-sidebar-border text-sidebar-fg hover:text-sidebar-fg-active hover:border-sidebar-fg/40"
    : "border-border text-fg-muted hover:text-fg hover:border-border-strong";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative w-9 h-9 flex items-center justify-center rounded-md border transition-colors ${classes}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 1.3v1.4M8 13.3v1.4M14.7 8h-1.4M2.7 8H1.3M12.7 3.3l-1 1M4.3 11.7l-1 1M12.7 12.7l-1-1M4.3 4.3l-1-1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path
            d="M13.5 9.7A6 6 0 016.3 2.5a6 6 0 106.9 7.9 6 6 0 01.3-.7z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
