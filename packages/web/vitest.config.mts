import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const alias = {
  "@": fileURLToPath(new URL(".", import.meta.url)),
};

// Vitest 4 removed `environmentMatchGlobs`; per-file environments are now
// expressed with `test.projects`. We keep the original split: API-route/lib
// tests run in node (they import next/headers, viem, node:crypto), while React
// component tests (*.test.tsx and component *.test.ts) run in jsdom with DOM
// globals + jest-dom matchers.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          setupFiles: ["./vitest.setup.ts"],
          include: ["**/*.test.ts"],
          exclude: ["components/**/*.test.ts", "**/node_modules/**"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts", "./vitest.setup.dom.ts"],
          include: ["**/*.test.tsx", "components/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
