import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/gemini-live.check.ts"],
    maxWorkers: 1,
    testTimeout: 80000,
  },
});
