import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // The Progress fill width is computed at runtime (`w-[NN%]`), so the exact
  // arbitrary-value utilities can't be discovered by Tailwind's source scan.
  // Safelist every whole-percent width so the generated bar is real CSS (no
  // inline styles — failure mode 11).
  safelist: [
    { pattern: /^w-\[(100|[0-9]{1,2})%\]$/ },
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        secondary: "#0EA5E9",
        accent: "#A855F7",
        success: "#10B981",
        danger: "#EF4444",
        warn: "#F59E0B",
        // Dark-first neutral scale (design spec).
        bg: "#0B0F19",
        surface: "#111827",
        elevated: "#1F2937",
        border: "#374151",
        muted: "#9CA3AF",
        fg: "#E5E7EB",
        "fg-strong": "#F9FAFB"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        // Design scale 12/14/16/20/24/32/48px.
        xs: "12px",
        sm: "14px",
        base: "16px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "32px",
        "5xl": "48px"
      }
    }
  },
  plugins: []
};
export default config;
