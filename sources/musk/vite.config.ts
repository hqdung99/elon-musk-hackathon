import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { forwardedHeader, shopeeHeaderNames } from "./src/providers/shopee-headers";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "^/shopee-api/": {
        target: "https://shopee.vn",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shopee-api\//, "/api/"),
        // Shopee session headers come from Cấu hình as x-musk-* and replace the browser's own.
        configure: (proxy) =>
          proxy.on("proxyReq", (proxyReq, request) => {
            for (const name of shopeeHeaderNames) {
              const value = request.headers[forwardedHeader(name)];
              proxyReq.removeHeader(forwardedHeader(name));
              if (typeof value === "string" && value) proxyReq.setHeader(name, value);
              else if (name === "cookie") proxyReq.removeHeader(name);
            }
          }),
      },
    },
  },
});
