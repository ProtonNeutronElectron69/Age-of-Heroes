import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works under any GitHub Pages sub-path.
  base: "./",
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
