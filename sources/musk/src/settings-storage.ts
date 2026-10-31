import type { SettingsValue } from "./components/chat/Settings";
import { isShopeeHeaders } from "./providers/shopee-headers";

// Keys typed into Cấu hình live only in this browser profile. Azure settings stay in .env.local.
const storageKey = "musk.settings.v1";

type StoredSettings = Pick<SettingsValue, "aiMode" | "dataMode" | "openai" | "shopee">;

export function loadStoredSettings(): Partial<StoredSettings> {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(storageKey) ?? "null");
  } catch {
    return {};
  }

  if (typeof raw !== "object" || raw === null) return {};
  const stored = raw as Record<string, unknown>;
  const settings: Partial<StoredSettings> = {};
  if (stored.aiMode === "demo" || stored.aiMode === "openai" || stored.aiMode === "azure")
    settings.aiMode = stored.aiMode;
  if (stored.dataMode === "fixture" || stored.dataMode === "shopee")
    settings.dataMode = stored.dataMode;
  const openai = stored.openai as Record<string, unknown> | null | undefined;
  if (typeof openai?.apiKey === "string" && typeof openai.model === "string")
    settings.openai = { apiKey: openai.apiKey, model: openai.model };
  if (isShopeeHeaders(stored.shopee)) settings.shopee = stored.shopee;

  return settings;
}

export function saveSettings({ aiMode, dataMode, openai, shopee }: SettingsValue): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ aiMode, dataMode, openai, shopee }));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); settings still apply in memory.
  }
}
