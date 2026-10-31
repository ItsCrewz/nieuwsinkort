import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Zet de gebouwde CSS inline in index.html: geen render-blokkerend stylesheet-verzoek meer (LCP, #403).
// De CSS-url()'s zijn absoluut (/fonts/...), dus inline verandert niets aan de weergave; CSP staat style-src 'unsafe-inline' toe.
function cssInline(): Plugin {
  return {
    name: "css-inline",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const b = ctx.bundle;
        if (!b) return html;
        return html.replace(/<link rel="stylesheet"[^>]*href="\/([^"]+\.css)"[^>]*>/g, (m, f) => {
          const a = b[f];
          if (!a || a.type !== "asset") return m;
          delete b[f];
          return `<style>${String(a.source).replace(/<\/style/gi, "<\\/style")}</style>`;
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), cssInline()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 700 },
});
