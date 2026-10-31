// Headers captured from a logged-in Shopee browser request. The browser cannot set most of them
// itself, so it sends each as `x-musk-<name>` and the local Vite proxy rewrites them for Shopee.
export const shopeeHeaderNames = [
  "af-ac-enc-dat",
  "cookie",
  "user-agent",
  "x-csrftoken",
  "referer",
] as const;

export type ShopeeHeaderName = (typeof shopeeHeaderNames)[number];

export type ShopeeHeaders = Record<ShopeeHeaderName, string>;

export const forwardedHeader = (name: ShopeeHeaderName) => `x-musk-${name}`;

export function isShopeeHeaders(value: unknown): value is ShopeeHeaders {
  return (
    typeof value === "object" &&
    value !== null &&
    shopeeHeaderNames.every((name) => {
      const header = (value as Record<string, unknown>)[name];

      return typeof header === "string" && header.trim() !== "" && !/[\r\n\0]/.test(header);
    })
  );
}

const ansiEscapes: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  "\\": "\\",
  "'": "'",
  '"': '"',
};

// Splits a bash/zsh command line ("Copy as cURL" on macOS and Linux).
function splitPosixArguments(source: string): string[] {
  const args: string[] = [];
  let current = "";
  let started = false;
  const unterminated = () => new Error("Copied cURL has an unterminated quote.");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      const next = source[index + 1];
      if (next === "\n") index += 1;
      else if (next === "\r" && source[index + 2] === "\n") index += 2;
      else if (next !== undefined) {
        current += next;
        index += 1;
        started = true;
      }
    } else if (char === "'") {
      const end = source.indexOf("'", index + 1);
      if (end < 0) throw unterminated();
      current += source.slice(index + 1, end);
      index = end;
      started = true;
    } else if (char === "$" && source[index + 1] === "'") {
      index += 2;
      while (source[index] !== "'") {
        if (index >= source.length) throw unterminated();
        if (source[index] === "\\") {
          const next = source[index + 1];
          if (next === "x" || next === "u") {
            const length = next === "x" ? 2 : 4;
            current += String.fromCharCode(
              parseInt(source.slice(index + 2, index + 2 + length), 16),
            );
            index += 2 + length;
          } else {
            current += ansiEscapes[next] ?? next;
            index += 2;
          }
        } else {
          current += source[index];
          index += 1;
        }
      }

      started = true;
    } else if (char === '"') {
      index += 1;
      while (source[index] !== '"') {
        if (index >= source.length) throw unterminated();
        const next = source[index + 1];
        if (source[index] === "\\" && ['"', "\\", "$", "`", "\n"].includes(next)) {
          if (next !== "\n") current += next;
          index += 2;
        } else {
          current += source[index];
          index += 1;
        }
      }

      started = true;
    } else if (/\s/.test(char)) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }

  if (started) args.push(current);

  return args;
}

// Undo cmd.exe escaping (^X, ^ line continuations), then split like the MSVC runtime.
function splitCmdArguments(source: string): string[] {
  let line = "";
  let cmdQuoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "^" && !cmdQuoted) {
      const next = source[index + 1];
      if (next === "\r" || next === "\n") {
        index += next === "\r" && source[index + 2] === "\n" ? 2 : 1;
        line += " ";
      } else if (next !== undefined) {
        line += next;
        index += 1;
      }

      continue;
    }

    if (char === '"') cmdQuoted = !cmdQuoted;
    line += char === "\r" || char === "\n" ? " " : char;
  }

  if (cmdQuoted) throw new Error("Copied cURL has an unterminated quote.");

  const args: string[] = [];
  let current = "";
  let started = false;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      let count = 0;
      while (line[index + count] === "\\") count += 1;
      if (line[index + count] === '"') {
        current += "\\".repeat(Math.floor(count / 2));
        if (count % 2) current += '"';
        else quoted = !quoted;
        index += count;
      } else {
        current += "\\".repeat(count);
        index += count - 1;
      }

      started = true;
    } else if (char === '"') {
      quoted = !quoted;
      started = true;
    } else if (/\s/.test(char) && !quoted) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }

  if (quoted) throw new Error("Copied cURL has an unterminated quote.");
  if (started) args.push(current);

  return args;
}

const curlValueOptions = new Set([
  "-d",
  "--data",
  "--data-ascii",
  "--data-binary",
  "--data-raw",
  "--data-urlencode",
  "-F",
  "--form",
  "-o",
  "--output",
  "-u",
  "--user",
  "-X",
  "--request",
]);

export function parseShopeeCurl(source: string): ShopeeHeaders {
  const cmd = /\^\r?\n/.test(source) || /\^"/.test(source);
  const args = cmd ? splitCmdArguments(source) : splitPosixArguments(source.trim());
  if (args[0]?.toLowerCase() !== "curl" && args[0]?.toLowerCase() !== "curl.exe")
    throw new Error("Nội dung dán phải là lệnh cURL (Copy as cURL).");
  const urls: string[] = [];
  const headers = new Map<string, string>();
  const add = (rawName: string, value: string) => {
    const name = rawName.trim().toLowerCase();
    if (!(shopeeHeaderNames as readonly string[]).includes(name)) return;
    if (!value.trim() || /[\r\n\0]/.test(value))
      throw new Error(`Header ${name} phải là một dòng, không rỗng.`);
    if (headers.has(name)) throw new Error(`Header ${name} bị lặp.`);
    headers.set(name, value);
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const option = ["-H", "--header", "-b", "--cookie", "-A", "--user-agent", "-e", "--referer"];
    if (option.includes(arg) || arg === "--url" || curlValueOptions.has(arg)) {
      const value = args[(index += 1)];
      if (value === undefined) throw new Error(`Thiếu giá trị cho ${arg}.`);
      if (arg === "-H" || arg === "--header") {
        const separator = value.indexOf(":");
        if (separator > 0) add(value.slice(0, separator), value.slice(separator + 1).trim());
      } else if (arg === "-b" || arg === "--cookie") add("cookie", value);
      else if (arg === "-A" || arg === "--user-agent") add("user-agent", value);
      else if (arg === "-e" || arg === "--referer") add("referer", value);
      else if (arg === "--url") urls.push(value);
    } else if (!arg.startsWith("-")) urls.push(arg);
  }

  if (urls.length !== 1) throw new Error("cURL phải có đúng một URL.");
  if (!urls[0].startsWith("https://shopee.vn/api/"))
    throw new Error("URL phải thuộc https://shopee.vn/api/.");
  const missing = shopeeHeaderNames.filter((name) => !headers.has(name));
  if (missing.length) throw new Error(`cURL thiếu header: ${missing.join(", ")}.`);

  return Object.fromEntries(
    shopeeHeaderNames.map((name) => [name, headers.get(name)!]),
  ) as ShopeeHeaders;
}
