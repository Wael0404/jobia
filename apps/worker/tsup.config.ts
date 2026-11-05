import { defineConfig } from "tsup";

/** Workspace packages ship TypeScript sources: bundle them, keep npm dependencies external. */
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: [/^@jobia\//],
});
