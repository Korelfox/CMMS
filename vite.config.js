import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "icon-192.png", "icon-512.png", "icon-maskable.png"],
      manifest: {
        name: "CMMS Flota · Gestión de Mantenimiento",
        short_name: "CMMS Flota",
        description: "Mantenimiento naval bajo control: equipos, OTs, preventivo e inventario.",
        theme_color: "#06182E",
        background_color: "#06182E",
        display: "standalone",
        orientation: "any",
        lang: "es-CL",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cachea los archivos de la app para que cargue sin señal
        globPatterns: ["**/*.{js,css,html,png,svg,woff,woff2}"],
        // No interceptamos las llamadas a Supabase: la sincronización
        // de datos la maneja nuestra propia capa offline (outbox).
        navigateFallbackDenylist: [/^\/rest\//, /supabase/],
        runtimeCaching: [
          {
            // Fuentes de Google: cache para que la tipografía cargue offline
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true },
});
