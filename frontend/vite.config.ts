import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "animejs/lib/anime.es.js": path.resolve(
        __dirname,
        "node_modules/animejs/lib/anime.es.js"
      ),
    },
  },
});
