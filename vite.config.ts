import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), {
    name: "html-compact",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => html.replace(/>\s+</g, "><").trim() },
  }],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 700 },
});
