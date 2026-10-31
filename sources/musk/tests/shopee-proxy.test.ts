import { beforeEach, expect, it, vi } from "vitest";
import { loadEnv } from "vite";
import viteConfig from "../vite.config";

vi.mock("vite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vite")>()),
  loadEnv: vi.fn(),
}));

async function proxyConfig() {
  if (typeof viteConfig !== "function") throw new Error("Expected a Vite config function.");
  const config = await viteConfig({ mode: "development", command: "serve" });
  const proxy = config.server?.proxy?.["^/shopee-api/"];
  if (!proxy || typeof proxy === "string") throw new Error("Expected Shopee proxy options.");

  return proxy;
}

beforeEach(() => {
  vi.mocked(loadEnv).mockReturnValue({});
});

it("keeps all captured headers server-side, including CSRF and Referer", async () => {
  vi.mocked(loadEnv).mockReturnValue({
    SHOPEE_PROXY_AF_AC_ENC_DAT: "fake-enc",
    SHOPEE_PROXY_COOKIE: "session=fake",
    SHOPEE_PROXY_USER_AGENT: "Fake browser",
    SHOPEE_PROXY_CSRF_TOKEN: "fake-csrf",
    SHOPEE_PROXY_REFERER: "https://shopee.vn/product/123/456",
  });
  const proxy = await proxyConfig();
  expect(proxy.headers).toEqual({
    "af-ac-enc-dat": "fake-enc",
    cookie: "session=fake",
    "user-agent": "Fake browser",
    "x-csrftoken": "fake-csrf",
    referer: "https://shopee.vn/product/123/456",
  });
  expect(proxy.rewrite?.("/shopee-api/v4/pdp/cart_panel/select_variation_pc")).toBe(
    "/api/v4/pdp/cart_panel/select_variation_pc",
  );
});

it("allows fixture mode with no captured credentials", async () => {
  expect((await proxyConfig()).headers).toEqual({});
});

it("explicitly rejects incomplete setup that would leave POST requests unauthenticated", async () => {
  vi.mocked(loadEnv).mockReturnValue({
    SHOPEE_PROXY_AF_AC_ENC_DAT: "fake-enc",
    SHOPEE_PROXY_COOKIE: "session=fake",
    SHOPEE_PROXY_USER_AGENT: "Fake browser",
  });
  await expect(proxyConfig()).rejects.toThrow(
    "Missing: SHOPEE_PROXY_CSRF_TOKEN, SHOPEE_PROXY_REFERER",
  );
});
