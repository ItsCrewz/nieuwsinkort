import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Zet de gebouwde CSS inline in index.html: geen render-blokkerend stylesheet-verzoek meer (LCP, #403).
// Het .css-bestand blijft naast de inline CSS in dist/assets staan: lazy chunks (videofeed) hebben het als preload-dependency en zonder bestand faalt de import (#419).
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
          // Bestand blijft in de output: Vite's __vitePreload van lazy chunks noemt het nog (#419).
          return `<style>${String(a.source).replace(/<\/style/gi, "<\\/style")}</style>`;
        });
      },
    },
  };
}

// Witruimte tussen tags weg uit de productie-HTML (#305); na cssInline, het inline script blijft intact voor de CSP-hash.
function htmlCompact(): Plugin {
  return {
    name: "html-compact",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => html.replace(/>\s+</g, "><").trim() },
  };
}

export default defineConfig({
  plugins: [react(), cssInline(), htmlCompact()],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // CSS krijgt een eigen naampatroon: de edge cachete de oude URL als HTML (immutable), een nieuwe URL omzeilt dat (#419).
      output: { assetFileNames: (a) => (a.names?.some((n) => n.endsWith(".css")) ? "assets/[name]-[hash]-s419.css" : "assets/[name]-[hash][extname]") },
    },
  },
});
