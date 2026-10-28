import { build } from "esbuild";
await build({
  entryPoints: ["desktop/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "desktop-dist/main.cjs",
  external: ["electron"],
  sourcemap: false,
});
await build({
  entryPoints: ["desktop/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "desktop-dist/preload.cjs",
  external: ["electron"],
});
