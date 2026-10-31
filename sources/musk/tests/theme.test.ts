import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

it("defaults to light controls independently of the system theme", () => {
  const root = css.match(/:root\s*\{([^}]+)\}/)?.[1];
  expect(root).toMatch(/color-scheme:\s*light/);
  expect(root).toMatch(/--white:\s*#ffffff\s*;/);
  expect(css).not.toMatch(/prefers-color-scheme/);
});

it("uses the redesign's warm canvas, neutral actions and teal accents", () => {
  const theme = css.match(/:root\s*\{([^}]+)\}/)?.[1];
  const palette = {
    green: "#17181c",
    dark: "#253c31",
    hover: "#34383b",
    ok: "#22664f",
    muted: "#495852",
    line: "#7c8c83",
    pale: "#daf0e7",
    card: "#ffffff",
    ink: "#17181c",
    bg: "#f4f5ef",
    tint: "#e4f2ea",
    warn: "#fff0d4",
    "warn-text": "#734600",
    bad: "#ffe6df",
    "bad-text": "#923526",
    info: "#e4edf7",
    "info-text": "#334f70",
    "brand-orange": "#f4512a",
    "brand-tint": "#fff0e7",
    "selected-border": "#27735b",
  };
  expect(theme).toMatch(/color-scheme:\s*light/);
  for (const [name, value] of Object.entries(palette)) {
    expect(theme).toMatch(new RegExp(`--${name}:\\s*${value}\\s*;`, "i"));
  }
});

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

it("maintains readable text and distinct controls across semantic surfaces", () => {
  const tokens = Object.fromEntries(
    [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]),
  );
  const contrast = (foreground: string, background: string) => {
    const values = [tokens[foreground], tokens[background]].map(luminance);

    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  };

  for (const background of ["card", "bg", "tint", "pale"]) {
    for (const foreground of ["ink", "muted", "dark", "ok"]) {
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }

  for (const [foreground, background] of [
    ["warn-text", "warn"],
    ["bad-text", "bad"],
    ["info-text", "info"],
    ["user-text", "user-bg"],
    ["white", "green"],
  ]) {
    expect(
      contrast(foreground, background),
      `${foreground} on ${background}`,
    ).toBeGreaterThanOrEqual(4.5);
  }

  for (const foreground of ["line", "selected-border", "ok"]) {
    for (const background of ["card", "bg", "tint"]) {
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(3);
    }
  }

  expect(css).not.toMatch(/\.superseded\s*\{[^}]*opacity/);
  expect(css).not.toMatch(/button:disabled\s*\{[^}]*opacity/);
});

it("keeps card surfaces theme-aware and primary actions high-contrast", () => {
  expect(css).not.toMatch(/background:\s*(?:white|var\(--white\))/);
  for (const selector of [
    ".app-header",
    ".sidebar",
    ".composer",
    ".offer-card",
    ".settings-modal",
  ]) {
    const escaped = selector.replaceAll(".", "\\.");
    expect(css).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*background:\\s*var\\(--card\\)`));
  }

  expect(css).toMatch(/\.primary:hover:not\(:disabled\)\s*\{\s*background:\s*var\(--hover\)/);
});

it("uses neutral user messages while keeping selection, approval and warning states distinct", () => {
  const normalizedCss = css.replace(/\s*([{}:;])\s*/g, "$1");
  expect(normalizedCss).toMatch(
    /\.user \.message-content\{[^}]*background:var\(--user-bg\);color:var\(--user-text\)/,
  );
  expect(normalizedCss).toMatch(/\.offer-card\.selected\{border-color:var\(--selected-border\)/);
  expect(normalizedCss).toMatch(/\.approval-card\{background:var\(--tint\)/);
  expect(normalizedCss).toMatch(/\.warning\{color:var\(--warn-text\);background:var\(--warn\)/);
  expect(normalizedCss).toMatch(/\.red\{color:var\(--bad-text\);background:var\(--bad\)/);
});

it("keeps product images contained and supports keyboard focus and reduced motion", () => {
  expect(css).toMatch(/\.product-image img\s*\{[^}]*object-fit:\s*contain/);
  expect(css).toMatch(/button:focus-visible/);
  expect(css).toMatch(/summary:focus-visible/);
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  expect(css).toMatch(/\.brand-logo\s*\{[^}]*object-fit:\s*contain/);
});
