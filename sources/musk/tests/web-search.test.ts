import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ShoppingIntent } from "../src/domain/schemas";
import { createOpenAI, defaultOpenAIConfig } from "../src/providers/ai";
import { searchBrandEvidence } from "../src/providers/web-search";

beforeAll(async () => {
  await import("@langchain/openai");
}, 60_000);
afterEach(() => {
  vi.unstubAllGlobals();
});
const config = { ...defaultOpenAIConfig, apiKey: "fake-web-search-test-key" };
const intent: ShoppingIntent = {
  product_description: "dầu gội trị gàu",
  shopping_goal: { mode: "discover_brands", category: "dầu gội", requested_brand: null },
  quantity: 1,
  delivery_area: "private-buyer-address",
  requirements: [],
  preferences: [],
  questions_for_user: [],
};
function research() {
  return {
    status: "completed",
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: {
          sources: [{ url: "https://manufacturer.example/shampoo", title: "Manufacturer" }],
        },
      },
      {
        type: "message",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "Clear offers an anti-dandruff product line. Limited evidence, not a clinical or market ranking.",
            annotations: [
              {
                type: "url_citation",
                url: "https://manufacturer.example/shampoo",
                title: "Manufacturer",
              },
            ],
          },
        ],
      },
    ],
  };
}

function chat(value: unknown) {
  return new Response(
    JSON.stringify({
      id: "mock",
      object: "chat.completion",
      created: 1,
      model: config.model,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: JSON.stringify(value) },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

it("performs actual hosted research before constrained extraction and excludes buyer context", async () => {
  const requests: Request[] = [];
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    bodies.push(JSON.parse(await request.text()));
    if (request.url.endsWith("/responses"))
      return new Response(JSON.stringify(research()), {
        headers: { "content-type": "application/json" },
      });

    return chat({
      brands: [
        {
          name: "Clear",
          aliases: [],
          reason: "Manufacturer names the product line.",
          source_urls: ["https://manufacturer.example/shampoo"],
        },
      ],
      limitations: ["Only one supported brand; not a market ranking."],
    });
  });
  const ai = await createOpenAI(config);
  const result = await ai.discoverBrands(intent);
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    "/v1/responses",
    "/v1/chat/completions",
  ]);
  expect(bodies[0]).toMatchObject({
    model: config.model,
    store: false,
    tool_choice: "required",
    tools: [{ type: "web_search", user_location: { type: "approximate", country: "VN" } }],
    include: ["web_search_call.action.sources"],
  });
  expect(JSON.stringify(bodies)).not.toContain("private-buyer-address");
  expect(result.brands[0].name).toBe("Clear");
  expect(result.sources).toEqual([
    { url: "https://manufacturer.example/shampoo", title: "Manufacturer" },
  ]);
  expect(new Date(result.researched_at).getTime()).not.toBeNaN();
});

it("rejects extracted source URLs that the hosted search never returned", async () => {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.endsWith("/responses")) return new Response(JSON.stringify(research()));

    return chat({
      brands: [
        {
          name: "Clear",
          aliases: [],
          reason: "Unsupported",
          source_urls: ["https://invented.example"],
        },
      ],
      limitations: ["Limited"],
    });
  });
  const ai = await createOpenAI(config);
  await expect(ai.discoverBrands(intent)).rejects.toThrow();
});

it.each(["incomplete", "failed", "cancelled"])(
  "rejects %s research without extraction",
  async (status) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...research(), status })));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchBrandEvidence(config, intent)).rejects.toThrow("chưa hoàn tất");
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it("rejects model-memory output without an actual completed web search", async () => {
  const result = research();
  result.output = result.output.filter((item) => item.type !== "web_search_call");
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(result)));
  await expect(searchBrandEvidence(config, intent)).rejects.toThrow("trí nhớ");
});

it("rejects uncited text, refusals and unsuccessful HTTP responses explicitly", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [
            { type: "web_search_call", status: "completed" },
            {
              type: "message",
              status: "completed",
              content: [{ type: "output_text", text: "Uncited claims" }],
            },
          ],
        }),
      ),
  );
  await expect(searchBrandEvidence(config, intent)).rejects.toThrow("không trả nội dung có nguồn");
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          ...research(),
          output: [
            research().output[0],
            {
              type: "message",
              status: "completed",
              content: [{ type: "refusal", refusal: "Refused" }],
            },
          ],
        }),
      ),
  );
  await expect(searchBrandEvidence(config, intent)).rejects.toThrow("không trả nội dung có nguồn");
  vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
  await expect(searchBrandEvidence(config, intent)).rejects.toThrow("HTTP 403");
});

it("honors cancellation before issuing a research request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  controller.abort();
  await expect(searchBrandEvidence(config, intent, controller.signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
