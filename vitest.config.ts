import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["services/**/*.test.ts", "apps/**/*.test.ts", "packages/**/*.test.ts"], environment: "node" } });
