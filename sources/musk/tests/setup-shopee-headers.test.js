import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { loadEnv } from "vite";
import { setupHeaders } from "../scripts/setup-shopee-headers.js";

const directories = [];
const script = fileURLToPath(new URL("../scripts/setup-shopee-headers.js", import.meta.url));

function destination() {
  const directory = mkdtempSync(join(tmpdir(), "musk-headers-"));
  directories.push(directory);
  return { directory, path: join(directory, ".env.local") };
}

function copiedFetch(headers) {
  return `fetch("https://shopee.vn/api/v4/search/search_items", {
    headers: ${headers},
    method: "GET"
  });`;
}

const headers = `{
  // "cookie": "inactive",
  "af-ac-enc-dat": "fake-enc",
  "Cookie": "session=fake; amount=$100; expand=\${HOME}; path=\\\\test",
  "user-agent": "Test \\"Browser\\"",
  "x-csrftoken": "fake-csrf",
  "Referer": "https://shopee.vn/product/123/456",
  "accept": "application/json"
}`;

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

it("extracts active literal headers and preserves dotenv values exactly", () => {
  const target = destination();
  setupHeaders(copiedFetch(headers), target.path);
  const env = loadEnv("development", target.directory, "SHOPEE_PROXY_");
  expect(env.SHOPEE_PROXY_AF_AC_ENC_DAT).toBe("fake-enc");
  expect(env.SHOPEE_PROXY_COOKIE).toBe("session=fake; amount=$100; expand=${HOME}; path=\\test");
  expect(env.SHOPEE_PROXY_USER_AGENT).toBe('Test "Browser"');
  expect(env.SHOPEE_PROXY_CSRF_TOKEN).toBe("fake-csrf");
  expect(env.SHOPEE_PROXY_REFERER).toBe("https://shopee.vn/product/123/456");
  expect(readFileSync(target.path, "utf8")).toContain('VITE_AZURE_OPENAI_API_KEY=""\n');
});

it("extracts headers from a Chrome cURL (cmd) copy", () => {
  // Mirrors Chrome DevTools' Windows cmd escaping.
  const win = (value) =>
    `^"${value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/[^a-zA-Z0-9\s_\-:=+~'/.,?;()*`]/g, "^$&")
      .replace(/%(?=[a-zA-Z0-9_])/g, "%^")}^"`;
  const cookie = "session=fake; amount=$100; off=50%OFF&x|y<z>!";
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0) "Test"';
  const source = [
    `curl ${win("https://shopee.vn/api/v4/search/search_items?keyword=iphone&limit=60")}`,
    `-H ${win("accept: application/json")}`,
    `-H ${win("af-ac-enc-dat: fake-enc")}`,
    `-b ${win(cookie)}`,
    `-H ${win(`user-agent: ${userAgent}`)}`,
    `-H ${win("x-csrftoken: fake-csrf")}`,
    `--referer ${win("https://shopee.vn/product/123/456")}`,
  ].join(" ^\r\n  ");
  const target = destination();
  setupHeaders(source, target.path);
  const env = loadEnv("development", target.directory, "SHOPEE_PROXY_");
  expect(env.SHOPEE_PROXY_AF_AC_ENC_DAT).toBe("fake-enc");
  expect(env.SHOPEE_PROXY_COOKIE).toBe(cookie);
  expect(env.SHOPEE_PROXY_USER_AGENT).toBe(userAgent);
  expect(env.SHOPEE_PROXY_CSRF_TOKEN).toBe("fake-csrf");
  expect(env.SHOPEE_PROXY_REFERER).toBe("https://shopee.vn/product/123/456");
  expect(() => setupHeaders(source.replace(/ \^\r\n {2}-b .*?\^" /, " "), target.path)).toThrow(
    "Missing active headers: cookie",
  );
});

it("reads the browser fetch referrer option when Referer is not in headers", () => {
  const target = destination();
  const source = copiedFetch(
    headers.replace('  "Referer": "https://shopee.vn/product/123/456",', ""),
  ).replace('method: "GET"', 'method: "GET", referrer: "https://shopee.vn/product/123/456"');
  setupHeaders(source, target.path);
  const env = loadEnv("development", target.directory, "SHOPEE_PROXY_");
  expect(env.SHOPEE_PROXY_REFERER).toBe("https://shopee.vn/product/123/456");
});

it("replaces existing headers while preserving unrelated settings", () => {
  const target = destination();
  writeFileSync(
    target.path,
    '# keep this\r\nOTHER_SETTING="keep"\r\nexport SHOPEE_PROXY_COOKIE="old"\r\n',
  );
  setupHeaders(copiedFetch(headers), target.path);
  setupHeaders(copiedFetch(headers), target.path);
  const contents = readFileSync(target.path, "utf8");
  expect(contents).toContain('# keep this\r\nOTHER_SETTING="keep"\r\n');
  expect(contents.match(/^SHOPEE_PROXY_COOKIE=/gm)).toHaveLength(1);
  expect(contents).not.toContain('"old"');
});

it("adds an empty Azure key entry once when missing, preserving CRLF", () => {
  const target = destination();
  writeFileSync(target.path, 'OTHER_SETTING="keep"\r\n');
  setupHeaders(copiedFetch(headers), target.path);
  setupHeaders(copiedFetch(headers), target.path);
  const contents = readFileSync(target.path, "utf8");
  expect(contents.match(/^VITE_AZURE_OPENAI_API_KEY=""\r?$/gm)).toHaveLength(1);
  expect(contents).toContain('VITE_AZURE_OPENAI_API_KEY=""\r\n');
  expect(contents).toContain('OTHER_SETTING="keep"\r\n');
});

it.each([
  'VITE_AZURE_OPENAI_API_KEY="fake-existing-azure-key"',
  ' \texport VITE_AZURE_OPENAI_API_KEY = "fake-existing-azure-key"',
  'VITE_AZURE_OPENAI_API_KEY=""',
])("never overwrites or duplicates an existing Azure key entry: %s", (entry) => {
  const target = destination();
  writeFileSync(target.path, `${entry}\n`);
  setupHeaders(copiedFetch(headers), target.path);
  const contents = readFileSync(target.path, "utf8");
  expect(contents).toContain(`${entry}\n`);
  expect(contents.match(/VITE_AZURE_OPENAI_API_KEY/g)).toHaveLength(1);
});

it("rejects missing, dynamic, duplicate or invalid headers before modifying the file", () => {
  const target = destination();
  writeFileSync(target.path, "OTHER=keep\n");
  for (const source of [
    copiedFetch('{"cookie": "fake"}'),
    copiedFetch(headers.replace('"fake-enc"', "process.exit(1)")),
    copiedFetch(headers.replace('"fake-enc"', '"line\\nbreak"')),
    copiedFetch(headers.replace('"accept":', '"COOKIE":')),
    copiedFetch(headers.replace('"accept": "application/json"', "...unknown")),
    'fetch("https://shopee.vn/api/test", {',
  ]) {
    expect(() => setupHeaders(source, target.path)).toThrow();
    expect(readFileSync(target.path, "utf8")).toBe("OTHER=keep\n");
  }
});

it("never executes input and does not print header values on errors", () => {
  const source = `throw new Error("sensitive-input"); ${copiedFetch('{"cookie": "secret-cookie"}')}`;
  const result = spawnSync(process.execPath, [script], { input: source, encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing active headers");
  expect(result.stderr).not.toMatch(/secret-cookie|sensitive-input/);
  expect(result.stdout).toBe("");
});

it("supports reading a copied fetch file and reports invalid input", () => {
  const target = destination();
  const input = join(target.directory, "fetch.txt");
  writeFileSync(input, "not a fetch");
  expect(() => execFileSync(process.execPath, [script, input], { stdio: "pipe" })).toThrow();
});
