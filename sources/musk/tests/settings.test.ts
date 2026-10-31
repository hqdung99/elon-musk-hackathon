import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Settings } from "../src/components/chat/Settings";
import { defaultAzureConfig, defaultOpenAIConfig } from "../src/providers/ai";

it.each(["", "fake-settings-secret"])(
  "shows read-only Azure configuration and key availability without an override: %s",
  (apiKey) => {
    const html = renderToStaticMarkup(
      createElement(Settings, {
        value: {
          aiMode: "azure",
          dataMode: "fixture",
          scenario: "unchanged",
          openai: defaultOpenAIConfig,
          shopee: null,
          azure: { ...defaultAzureConfig, apiKey },
        },
        onSave: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain(defaultAzureConfig.endpoint);
    expect(html).toContain(defaultAzureConfig.deployment);
    expect(html).toContain(defaultAzureConfig.apiVersion);
    expect(html).toContain("VITE_AZURE_OPENAI_API_KEY");
    expect(html).toContain(apiKey ? "Đã nạp API key từ cấu hình local." : "Chưa có API key Azure.");
    expect(html).not.toContain("fake-settings-secret");
    expect(html).not.toMatch(/<input\b/);
    expect(html).toContain("Áp dụng cấu hình");
  },
);

it("keeps Azure details hidden in demo mode", () => {
  const html = renderToStaticMarkup(
    createElement(Settings, {
      value: {
        aiMode: "demo",
        dataMode: "fixture",
        scenario: "unchanged",
        openai: defaultOpenAIConfig,
        shopee: null,
        azure: { ...defaultAzureConfig, apiKey: "fake-settings-secret" },
      },
      onSave: vi.fn(),
      onClose: vi.fn(),
    }),
  );
  expect(html).not.toContain("<fieldset");
  expect(html).not.toContain("fake-settings-secret");
  expect(html).not.toMatch(/<input\b/);
});

it("discloses permanent cart clearing and the one-SKU workflow in Shopee mode", () => {
  const html = renderToStaticMarkup(
    createElement(Settings, {
      value: {
        aiMode: "demo",
        dataMode: "shopee",
        scenario: "unchanged",
        openai: defaultOpenAIConfig,
        shopee: null,
        azure: defaultAzureConfig,
      },
      onSave: vi.fn(),
      onClose: vi.fn(),
    }),
  ).replace(/\s+/g, " ");
  expect(html).toContain("xóa toàn bộ giỏ Shopee");
  expect(html).toContain("không được khôi phục");
  expect(html).toContain("kiểm tra giỏ trống");
  expect(html).toContain("giỏ chỉ giữ SKU với số lượng đã duyệt");
});

it("lets the user type an OpenAI key and model in OpenAI mode", () => {
  const html = renderToStaticMarkup(
    createElement(Settings, {
      value: {
        aiMode: "openai",
        dataMode: "fixture",
        scenario: "unchanged",
        openai: { apiKey: "", model: "gpt-5-mini" },
        azure: defaultAzureConfig,
        shopee: null,
      },
      onSave: vi.fn(),
      onClose: vi.fn(),
    }),
  );
  expect(html).toMatch(/<input type="password" autoComplete="off"[^>]*placeholder="sk-\.\.\."/);
  expect(html).toContain('value="gpt-5-mini"');
  expect(html).toContain("api.openai.com");
  expect(html).not.toContain(defaultAzureConfig.endpoint);
});

it.each([null, "configured"] as const)(
  "offers a cURL paste box for the Shopee session without echoing stored headers: %s",
  (session) => {
    const html = renderToStaticMarkup(
      createElement(Settings, {
        value: {
          aiMode: "demo",
          dataMode: "shopee",
          scenario: "unchanged",
          openai: defaultOpenAIConfig,
          azure: defaultAzureConfig,
          shopee: session && {
            "af-ac-enc-dat": "fake-enc",
            cookie: "session=fake-secret-cookie",
            "user-agent": "Test",
            "x-csrftoken": "fake-csrf",
            referer: "https://shopee.vn/",
          },
        },
        onSave: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("Copy as cURL");
    expect(html).toContain(session ? "Đã có header phiên Shopee" : "Chưa có header phiên Shopee");
    expect(html.includes("Xóa header Shopee")).toBe(session !== null);
    expect(html).not.toContain("fake-secret-cookie");
  },
);
