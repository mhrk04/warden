import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        secondary: "#0EA5E9",
        accent: "#A855F7",
        success: "#10B981",
        danger: "#EF4444",
        warn: "#F59E0B"
      }
    }
  },
  plugins: []
};
export default config;
