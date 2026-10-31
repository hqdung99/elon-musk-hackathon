import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { createServer } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import configure from "../vite.config";

afterEach(() => vi.unstubAllEnvs());

it("proxies Shopee paths, queries and configured headers with the upstream host", async () => {
  vi.stubEnv("SHOPEE_PROXY_AF_AC_ENC_DAT", "test-enc-dat");
  vi.stubEnv("SHOPEE_PROXY_COOKIE", "session=fake-test-session");
  vi.stubEnv("SHOPEE_PROXY_USER_AGENT", "Musk-Proxy-Test");
  const config = await configure({ command: "serve", mode: "test" });
  const proxy = config.server?.proxy?.["^/shopee-api/"];
  if (!proxy || typeof proxy === "string") throw new Error("Missing Shopee proxy configuration.");
  expect(proxy.target).toBe("https://shopee.vn");
  const upstream = createHttpServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        url: request.url,
        host: request.headers.host,
        encDat: request.headers["af-ac-enc-dat"],
        cookie: request.headers.cookie,
        userAgent: request.headers["user-agent"],
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Missing upstream port.");
  const upstreamHost = `127.0.0.1:${address.port}`;
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      configFile: false,
      logLevel: "silent",
      server: {
        ...config.server,
        port: 0,
        open: false,
        proxy: { "^/shopee-api/": { ...proxy, target: `http://${upstreamHost}` } },
      },
    });
    await vite.listen();
    const url = vite.resolvedUrls?.local[0];
    if (!url) throw new Error("Missing Vite URL.");
    const path = "v4/search/search_items?keyword=iphone%2017&limit=10";
    const response = await fetch(new URL(`shopee-api/${path}`, url), {
      headers: {
        "af-ac-enc-dat": "client-enc-dat",
        cookie: "local-cookie=must-not-override",
        "user-agent": "Client-Test",
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: `/api/${path}`,
      host: upstreamHost,
      encDat: "test-enc-dat",
      cookie: "session=fake-test-session",
      userAgent: "Musk-Proxy-Test",
    });
  } finally {
    await vite?.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

it("rejects partially configured headers without printing their values", () => {
  vi.stubEnv("SHOPEE_PROXY_AF_AC_ENC_DAT", "secret-test-value");
  vi.stubEnv("SHOPEE_PROXY_COOKIE", "");
  vi.stubEnv("SHOPEE_PROXY_USER_AGENT", "");
  expect(() => configure({ command: "serve", mode: "test" })).toThrow(
    "Incomplete Shopee proxy configuration. Missing: SHOPEE_PROXY_COOKIE, SHOPEE_PROXY_USER_AGENT",
  );
});
