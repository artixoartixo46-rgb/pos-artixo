import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // "prompt" (not "autoUpdate") is required here - main.tsx's onNeedRefresh shows a toast
      // and waits for the cashier to click "Refresh now" instead of reloading automatically.
      // With "autoUpdate", vite-plugin-pwa's own registration reloads the page as soon as a new
      // deploy is detected (checked every 60s in main.tsx) - onNeedRefresh never even fires. That
      // silently drops whatever's in the cart if it fires mid-sale, which is exactly what the
      // comment in main.tsx says this app is trying to avoid.
      registerType: "prompt",
      // POS Terminal billing must keep working with no network - precache the app shell
      // so the page itself loads offline, and cache navigations to the SPA entry point.
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        // Default is 2 MiB - the jsPDF/html2canvas chunk (used for PDF report export) is
        // bigger than that on its own, so the Workbox build step needs a higher ceiling or
        // it hard-fails instead of just skipping the file.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/rest/v1/") || url.hostname.endsWith(".supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
      manifest: {
        name: "Artixo Wholesale POS",
        short_name: "Artixo POS",
        description: "Wholesale grocery point of sale",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/pos",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
