/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--c-surface-2) / <alpha-value>)",
        border: {
          DEFAULT: "rgb(var(--c-border) / <alpha-value>)",
          strong: "rgb(var(--c-border-strong) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "rgb(var(--c-fg) / <alpha-value>)",
          muted: "rgb(var(--c-fg-muted) / <alpha-value>)",
          subtle: "rgb(var(--c-fg-subtle) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          fg: "rgb(var(--c-accent-fg) / <alpha-value>)",
          muted: "rgb(var(--c-accent-muted) / <alpha-value>)",
        },
        success: "rgb(var(--c-success) / <alpha-value>)",
        critical: "rgb(var(--c-critical) / <alpha-value>)",
        warning: "rgb(var(--c-warning) / <alpha-value>)",
        info: "rgb(var(--c-info) / <alpha-value>)",
        sidebar: {
          DEFAULT: "rgb(var(--c-sidebar-bg) / <alpha-value>)",
          active: "rgb(var(--c-sidebar-bg-active) / <alpha-value>)",
          border: "rgb(var(--c-sidebar-border) / <alpha-value>)",
          fg: "rgb(var(--c-sidebar-fg) / <alpha-value>)",
          "fg-active": "rgb(var(--c-sidebar-fg-active) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, rgb(var(--c-border)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--c-border)) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)",
        elevated: "0 8px 24px -8px rgb(0 0 0 / 0.18), 0 2px 8px -2px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
};
