import { afterEach, expect, it, vi } from "vitest";
import { defaultAzureConfig } from "../src/providers/ai";
import { loadStoredSettings, saveSettings } from "../src/settings-storage";

const shopee = {
  "af-ac-enc-dat": "fake-enc",
  cookie: "session=fake",
  "user-agent": "Test",
  "x-csrftoken": "fake-csrf",
  referer: "https://shopee.vn/",
};

function memoryStorage() {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  });

  return items;
}

afterEach(() => vi.unstubAllGlobals());

it("round-trips UI-entered keys but never stores Azure settings or the scenario", () => {
  const items = memoryStorage();
  saveSettings({
    aiMode: "openai",
    dataMode: "shopee",
    scenario: "out_of_stock",
    openai: { apiKey: "fake-openai-key", model: "gpt-5-mini" },
    azure: { ...defaultAzureConfig, apiKey: "fake-azure-env-key" },
    shopee,
  });
  expect([...items.values()].join()).not.toContain("fake-azure-env-key");
  expect(loadStoredSettings()).toEqual({
    aiMode: "openai",
    dataMode: "shopee",
    openai: { apiKey: "fake-openai-key", model: "gpt-5-mini" },
    shopee,
  });
});

it("ignores corrupt or invalid stored values", () => {
  const items = memoryStorage();
  items.set("musk.settings.v1", "{not json");
  expect(loadStoredSettings()).toEqual({});
  items.set(
    "musk.settings.v1",
    JSON.stringify({
      aiMode: "gpt",
      dataMode: "shopee",
      openai: { apiKey: 1 },
      shopee: { cookie: "x" },
    }),
  );
  expect(loadStoredSettings()).toEqual({ dataMode: "shopee" });
});

it("keeps working when browser storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(loadStoredSettings()).toEqual({});
  expect(() =>
    saveSettings({
      aiMode: "demo",
      dataMode: "fixture",
      scenario: "unchanged",
      openai: { apiKey: "", model: "gpt-5-mini" },
      azure: defaultAzureConfig,
      shopee: null,
    }),
  ).not.toThrow();
});
