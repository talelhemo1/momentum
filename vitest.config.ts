import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// R25 — minimal Vitest setup. The only alias the lib tests need is the
// project's `@/…` → repo root mapping (matches tsconfig paths).
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
