import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptPath = fileURLToPath(import.meta.url);
const envPath = resolve(dirname(scriptPath), "..", ".env.local");
const variables = {
  "af-ac-enc-dat": "SHOPEE_PROXY_AF_AC_ENC_DAT",
  cookie: "SHOPEE_PROXY_COOKIE",
  "user-agent": "SHOPEE_PROXY_USER_AGENT",
  "x-csrftoken": "SHOPEE_PROXY_CSRF_TOKEN",
  referer: "SHOPEE_PROXY_REFERER",
};

function literal(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function propertyName(node) {
  return ts.isIdentifier(node) ? node.text : literal(node);
}

function collectHeaders(url, pairs) {
  if (!url || !url.startsWith("https://shopee.vn/api/"))
    throw new Error("Expected a URL under https://shopee.vn/api/.");
  const headers = new Map();
  for (const [rawName, value] of pairs) {
    const name = rawName.trim().toLowerCase();
    if (!Object.hasOwn(variables, name)) continue;
    if (typeof value !== "string" || !value.trim() || /[\r\n\0]/.test(value))
      throw new Error(`Header ${name} must be a nonempty, single-line string literal.`);
    if (headers.has(name)) throw new Error(`Duplicate header: ${name}.`);
    headers.set(name, value);
  }
  const missing = Object.keys(variables).filter((name) => !headers.has(name));
  if (missing.length) throw new Error(`Missing active headers: ${missing.join(", ")}.`);
  return headers;
}

// Undo cmd.exe escaping (^X, ^ line continuations), then split like the MSVC runtime.
function splitCmdArguments(source) {
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

  const args = [];
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
  "-A",
  "--user-agent",
  "-d",
  "--data",
  "--data-ascii",
  "--data-binary",
  "--data-raw",
  "--data-urlencode",
  "-e",
  "--referer",
  "-F",
  "--form",
  "-o",
  "--output",
  "-u",
  "--user",
  "-X",
  "--request",
]);

function extractCurlHeaders(source) {
  const args = splitCmdArguments(source);
  if (args[0]?.toLowerCase() !== "curl" && args[0]?.toLowerCase() !== "curl.exe")
    throw new Error("Copied cURL must start with curl.");
  const urls = [];
  const pairs = [];
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const takesValue = ["-H", "--header", "-b", "--cookie", "--url"].includes(arg);
    if (takesValue || curlValueOptions.has(arg)) {
      const value = args[(index += 1)];
      if (value === undefined) throw new Error(`Missing value for ${arg}.`);
      if (arg === "-H" || arg === "--header") {
        const separator = value.indexOf(":");
        if (separator > 0)
          pairs.push([value.slice(0, separator), value.slice(separator + 1).trim()]);
      } else if (arg === "-b" || arg === "--cookie") pairs.push(["cookie", value]);
      else if (arg === "-A" || arg === "--user-agent") pairs.push(["user-agent", value]);
      else if (arg === "-e" || arg === "--referer") pairs.push(["referer", value]);
      else if (arg === "--url") urls.push(value);
    } else if (!arg.startsWith("-")) urls.push(arg);
  }
  if (urls.length !== 1) throw new Error("Provide exactly one copied cURL URL.");
  return collectHeaders(urls[0], pairs);
}

function extractHeaders(source) {
  if (/^\s*curl(?:\.exe)?\s/i.test(source)) return extractCurlHeaders(source);
  const file = ts.createSourceFile(
    "fetch.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (file.parseDiagnostics.length) throw new Error("Copied fetch has invalid JavaScript syntax.");
  const calls = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch"
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (calls.length !== 1) throw new Error("Provide exactly one copied fetch(...) command.");
  const [urlNode, options] = calls[0].arguments;
  const url = literal(urlNode);
  if (!options || !ts.isObjectLiteralExpression(options))
    throw new Error("Fetch options must be an object literal.");
  if (options.properties.some((property) => !ts.isPropertyAssignment(property)))
    throw new Error("Fetch options cannot contain spreads, methods, or shorthand properties.");
  const headerProperties = options.properties.filter(
    (property) => propertyName(property.name) === "headers",
  );
  if (
    headerProperties.length !== 1 ||
    !ts.isObjectLiteralExpression(headerProperties[0].initializer)
  )
    throw new Error("Expected one literal headers object.");
  const pairs = [];
  for (const property of headerProperties[0].initializer.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) === undefined)
      throw new Error("Headers cannot contain spreads, computed keys, methods, or shorthand.");
    pairs.push([propertyName(property.name), literal(property.initializer)]);
  }
  const referrers = options.properties.filter(
    (property) => propertyName(property.name) === "referrer",
  );
  for (const property of referrers) pairs.push(["referer", literal(property.initializer)]);
  return collectHeaders(url, pairs);
}

function quoteEnv(value) {
  const quote = ["'", "`", '"'].find(
    (candidate) => !value.includes(candidate) && (candidate !== '"' || !/\\[nr]/.test(value)),
  );
  if (!quote) throw new Error("Header value cannot be safely quoted in .env.local.");
  return `${quote}${value.replace(/\$/g, "\\$")}${quote}`;
}

export function setupHeaders(source, destination = envPath) {
  const headers = extractHeaders(source);
  const lines = [...headers].map(([header, value]) => [variables[header], quoteEnv(value)]);
  let contents = existsSync(destination) ? readFileSync(destination, "utf8") : "";
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  if (!/^[ \t]*(?:export[ \t]+)?VITE_AZURE_OPENAI_API_KEY[ \t]*=/m.test(contents))
    lines.push(["VITE_AZURE_OPENAI_API_KEY", '""']);
  for (const [name, value] of lines) {
    const pattern = new RegExp(`^(?:export[ \\t]+)?${name}[ \\t]*=.*$`, "gm");
    const existing = [...contents.matchAll(pattern)];
    for (const match of existing) {
      const previous = match[0].slice(match[0].indexOf("=") + 1).trim();
      if (/^['"`]/.test(previous) && !previous.endsWith(previous[0]))
        throw new Error(`Normalize ${name} to a single line before running setup.`);
    }
    if (existing.length) contents = contents.replace(pattern, () => `${name}=${value}`);
    else
      contents += `${contents && !contents.endsWith("\n") ? newline : ""}${name}=${value}${newline}`;
  }
  writeFileSync(destination, contents, { mode: 0o600 });
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    if (process.argv.length > 3 || (!process.argv[2] && process.stdin.isTTY))
      throw new Error(
        "Usage: node scripts/setup-shopee-headers.js [copied-curl-or-fetch-file] (or pipe stdin).",
      );
    const source = readFileSync(process.argv[2] ?? 0, "utf8");
    setupHeaders(source);
    console.log(
      "Updated the Shopee headers in .env.local. Added an empty VITE_AZURE_OPENAI_API_KEY entry if missing; fill it once to use Azure. Restart Vite.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Shopee header setup failed.");
    process.exitCode = 1;
  }
}
