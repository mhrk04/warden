import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs before the test suite; clears ambient secrets so tests stay hermetic.
    setupFiles: ["./vitest.setup.ts"],
  },
});
