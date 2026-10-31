import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      { find: "cloudflare:workers", replacement: fileURLToPath(new URL("./tests/worker-mock.ts", import.meta.url)) },
      { find: /^(.*\/functions\/data\.json)$/, replacement: "$1.ts" },
    ],
  },
  test: {
    include: ["tests/*.test.ts"],
    setupFiles: ["./tests/vitest-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "worker/src/**/*.ts", "functions/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
