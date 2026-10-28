import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
    watch: {
      ignored: [
        "**/release/**",
        "**/dist/**",
        "**/desktop-dist/**",
        "**/test-results/**",
      ],
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
