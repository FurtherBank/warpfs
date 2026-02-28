import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@warpfs/utils": path.resolve(__dirname, "packages/utils/src/index.ts"),
      "@warpfs/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@warpfs/notion": path.resolve(__dirname, "packages/notion/src/index.ts"),
    },
  },
  test: {
    globals: true,
    testTimeout: 15000,
    include: ["packages/*/src/**/*.test.ts"],
  },
});
