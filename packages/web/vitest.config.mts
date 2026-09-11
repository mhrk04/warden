import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Existing API-route/lib tests run in node (they import next/headers, viem,
    // node:crypto). React component tests (*.test.tsx) need jsdom + DOM globals.
    environment: "node",
    environmentMatchGlobs: [
      ["**/*.test.tsx", "jsdom"],
      ["components/**/*.test.ts", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts", "./vitest.setup.dom.ts"],
  },
});
