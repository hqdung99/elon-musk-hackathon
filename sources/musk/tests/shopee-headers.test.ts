import { expect, it } from "vitest";
import { isShopeeHeaders, parseShopeeCurl } from "../src/providers/shopee-headers";

const expected = {
  "af-ac-enc-dat": "fake-enc",
  cookie: "session=fake; amount=$100; expand=${HOME}; path=\\test",
  "user-agent": "Mozilla/5.0 (Macintosh) Firefox/159.0",
  "x-csrftoken": "fake-csrf",
  referer: "https://shopee.vn/search?keyword=iphone%2018",
};

const bash = `curl 'https://shopee.vn/api/v4/search/search_items?by=relevancy&keyword=iphone%2018' \\
  --compressed \\
  -H 'User-Agent: Mozilla/5.0 (Macintosh) Firefox/159.0' \\
  -H 'Accept: application/json' \\
  -H 'Referer: https://shopee.vn/search?keyword=iphone%2018' \\
  -H 'X-CSRFToken: fake-csrf' \\
  -H 'af-ac-enc-dat: fake-enc' \\
  -H 'Cookie: session=fake; amount=$100; expand=\${HOME}; path=\\test'`;

it("extracts the five session headers from a bash cURL copy (Firefox/Chrome on macOS)", () => {
  expect(parseShopeeCurl(bash)).toEqual(expected);
  expect(isShopeeHeaders(parseShopeeCurl(bash))).toBe(true);
});

it("reads Chrome's -b cookie flag, $'...' quoting and double quotes", () => {
  const source = [
    `curl $'https://shopee.vn/api/v4/pdp/get_pc?item_id=1'`,
    `-H "af-ac-enc-dat: fake-enc"`,
    `-b $'session=fake; amount=$100; expand=\${HOME}; path=\\\\test'`,
    `-H 'user-agent: Mozilla/5.0 (Macintosh) Firefox/159.0'`,
    `-H $'x-csrftoken: fake-csrf'`,
    `-e 'https://shopee.vn/search?keyword=iphone%2018'`,
  ].join(" \\\n  ");
  expect(parseShopeeCurl(source)).toEqual(expected);
});

it("extracts headers from a Chrome cURL (cmd) copy", () => {
  // Mirrors Chrome DevTools' Windows cmd escaping.
  const win = (value: string) =>
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
  expect(parseShopeeCurl(source)).toEqual({
    "af-ac-enc-dat": "fake-enc",
    cookie,
    "user-agent": userAgent,
    "x-csrftoken": "fake-csrf",
    referer: "https://shopee.vn/product/123/456",
  });
});

it.each([
  ["not a cURL command", "fetch('https://shopee.vn/api/v4')", "lệnh cURL"],
  ["missing cookie", bash.replace(/ \\\n {2}-H 'Cookie: .*$/, ""), "thiếu header: cookie"],
  ["duplicate header", `${bash} -H 'cookie: other'`, "cookie bị lặp"],
  [
    "non-Shopee URL",
    bash.replace("https://shopee.vn/api/", "https://example.com/api/"),
    "shopee.vn/api",
  ],
  ["unterminated quote", "curl 'https://shopee.vn/api/v4", "unterminated"],
])("rejects %s", (_, source, message) => {
  expect(() => parseShopeeCurl(source)).toThrow(message);
});

it("validates stored header objects", () => {
  expect(isShopeeHeaders(expected)).toBe(true);
  expect(isShopeeHeaders({ ...expected, cookie: "" })).toBe(false);
  expect(isShopeeHeaders({ ...expected, cookie: "a\nb" })).toBe(false);
  expect(isShopeeHeaders(null)).toBe(false);
});
