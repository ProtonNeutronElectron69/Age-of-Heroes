import { defineConfig } from "vite";

// Bundle the server and the workspace packages it uses into one file, so the
// deployed image needs nothing but Node.
export default defineConfig({
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    target: "node22",
    rollupOptions: {
      // Optional native speed-ups for ws; it works without them.
      external: ["bufferutil", "utf-8-validate"],
      output: { entryFileNames: "index.js" },
    },
  },
  ssr: {
    noExternal: true,
  },
});
