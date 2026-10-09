import { build } from "esbuild";

await build({
  entryPoints: ["server/start.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/server.mjs",
});
