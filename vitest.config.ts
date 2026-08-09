import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 85,
        lines: 85,
        functions: 90,
        branches: 70,
      },
    },
  },
});
