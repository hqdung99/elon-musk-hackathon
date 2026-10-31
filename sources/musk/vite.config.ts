import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "SHOPEE_PROXY_");
  const variables = {
    "af-ac-enc-dat": "SHOPEE_PROXY_AF_AC_ENC_DAT",
    cookie: "SHOPEE_PROXY_COOKIE",
    "user-agent": "SHOPEE_PROXY_USER_AGENT",
    "x-csrftoken": "SHOPEE_PROXY_CSRF_TOKEN",
    referer: "SHOPEE_PROXY_REFERER",
  };
  const missing = Object.values(variables).filter((name) => !env[name]?.trim());
  if (missing.length > 0 && missing.length < Object.keys(variables).length)
    throw new Error(`Incomplete Shopee proxy configuration. Missing: ${missing.join(", ")}`);
  const headers = missing.length
    ? {}
    : Object.fromEntries(Object.entries(variables).map(([header, name]) => [header, env[name]]));

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      proxy: {
        "^/shopee-api/": {
          target: "https://shopee.vn",
          changeOrigin: true,
          headers,
          rewrite: (path) => path.replace(/^\/shopee-api\//, "/api/"),
        },
      },
    },
  };
});
