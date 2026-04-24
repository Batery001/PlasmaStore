import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Producción en la raíz (/). En local se mantiene el proxy /api.
  base: "/",
  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://127.0.0.1:3847", changeOrigin: true },
      "/store-media": { target: "http://127.0.0.1:3847", changeOrigin: true },
    },
  },
  preview: {
    port: 4174,
    proxy: {
      "/api": { target: "http://127.0.0.1:3847", changeOrigin: true },
      "/store-media": { target: "http://127.0.0.1:3847", changeOrigin: true },
    },
  },
});
