import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    // Local D1/R2 writes are runtime data, never application source changes.
    watch: {
      ignored: ["**/.wrangler/**", "**/.local/**", "**/dist/**"],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        configure(proxy) {
          proxy.on("proxyReq", (request) => {
            if (process.env.DEV_API_TOKEN)
              request.setHeader(
                "Authorization",
                `Bearer ${process.env.DEV_API_TOKEN}`,
              );
          });
        },
      },
    },
  },
  build: { outDir: "dist" },
});
