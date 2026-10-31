import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { createServer } from "vite";
import { expect, it } from "vitest";
import config from "../vite.config";
import { forwardedHeader, shopeeHeaderNames } from "../src/providers/shopee-headers";

async function withProxy(run: (url: string) => Promise<void>) {
  const proxy = config.server?.proxy?.["^/shopee-api/"];
  if (!proxy || typeof proxy === "string") throw new Error("Missing Shopee proxy configuration.");
  expect(proxy.target).toBe("https://shopee.vn");
  const upstream = createHttpServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ url: request.url, host: request.headers.host, headers: request.headers }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Missing upstream port.");
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      configFile: false,
      logLevel: "silent",
      server: {
        ...config.server,
        port: 0,
        open: false,
        proxy: { "^/shopee-api/": { ...proxy, target: `http://127.0.0.1:${address.port}` } },
      },
    });
    await vite.listen();
    const url = vite.resolvedUrls?.local[0];
    if (!url) throw new Error("Missing Vite URL.");
    await run(url);
  } finally {
    await vite?.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

it("rewrites x-musk-* session headers from Cấu hình into the real Shopee headers", async () => {
  await withProxy(async (url) => {
    const path = "v4/search/search_items?keyword=iphone%2017&limit=10";
    const session = {
      "af-ac-enc-dat": "test-enc-dat",
      cookie: "session=fake-test-session",
      "user-agent": "Musk-Proxy-Test",
      "x-csrftoken": "fake-csrf",
      referer: "https://shopee.vn/product/123/456",
    };
    const response = await fetch(new URL(`shopee-api/${path}`, url), {
      headers: {
        cookie: "local-cookie=must-not-leak",
        "user-agent": "Client-Test",
        ...Object.fromEntries(
          shopeeHeaderNames.map((name) => [forwardedHeader(name), session[name]]),
        ),
      },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe(`/api/${path}`);
    expect(body.host).toMatch(/^127\.0\.0\.1:\d+$/);
    for (const name of shopeeHeaderNames) {
      expect(body.headers[name]).toBe(session[name]);
      expect(body.headers[forwardedHeader(name)]).toBeUndefined();
    }
  });
});

it("never forwards local browser cookies when no Shopee session is configured", async () => {
  await withProxy(async (url) => {
    const response = await fetch(new URL("shopee-api/v4/pdp/get_pc", url), {
      headers: { cookie: "local-cookie=must-not-leak" },
    });
    expect((await response.json()).headers.cookie).toBeUndefined();
  });
});
