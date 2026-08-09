import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 60,
        lines: 60,
        functions: 60,
        branches: 55,
      },
    },
  },
});
