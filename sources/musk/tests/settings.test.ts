import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Settings } from "../src/components/chat/Settings";
import { defaultAzureConfig } from "../src/providers/ai";

it.each(["", "fake-settings-secret"])(
  "shows read-only Azure configuration and key availability without an override: %s",
  (apiKey) => {
    const html = renderToStaticMarkup(
      createElement(Settings, {
        value: {
          aiMode: "azure",
          dataMode: "fixture",
          scenario: "unchanged",
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
