import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

it("defaults to dark controls independently of the system theme", () => {
  const root = css.match(/:root\s*\{([^}]+)\}/)?.[1];
  expect(root).toMatch(/color-scheme:\s*dark/);
  expect(root).toMatch(/--white:\s*#ffffff\s*;/);
  expect(css).not.toMatch(/prefers-color-scheme/);
});

it("uses the mockup's dark palette as the root theme", () => {
  const darkTheme = css.match(/:root\s*\{([^}]+)\}/)?.[1];
  const palette = {
    green: "#1a8f73",
    dark: "#8fe3cb",
    hover: "#157a62",
    ok: "#5fd0b2",
    muted: "#9aa6a2",
    line: "#2c3532",
    pale: "#1c3a33",
    card: "#1b211f",
    ink: "#e8ecea",
    bg: "#121614",
    tint: "#18221f",
    warn: "#3a2f14",
    "warn-text": "#f0c36d",
    bad: "#3d1f1c",
    "bad-text": "#f5a39d",
    info: "#1d2a44",
    "info-text": "#a9c2f5",
  };
  expect(darkTheme).toMatch(/color-scheme:\s*dark/);
  for (const [name, value] of Object.entries(palette)) {
    expect(darkTheme).toMatch(new RegExp(`--${name}:\\s*${value}\\s*;`, "i"));
  }
});

it("keeps card surfaces theme-aware without changing white-on-green text", () => {
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

it("uses emerald user messages and matching offer, approval and status surfaces", () => {
  const normalizedCss = css.replace(/\s*([{}:;])\s*/g, "$1");
  expect(normalizedCss).toMatch(
    /\.user \.message-content\{[^}]*background:var\(--green\);color:var\(--white\)/,
  );
  expect(normalizedCss).toMatch(/\.offer-card\.selected\{border-color:var\(--green\)/);
  expect(normalizedCss).toMatch(/\.approval-card\{background:var\(--tint\)/);
  expect(normalizedCss).toMatch(/\.warning\{color:var\(--warn-text\);background:var\(--warn\)/);
  expect(normalizedCss).toMatch(/\.red\{color:var\(--bad-text\);background:var\(--bad\)/);
});
