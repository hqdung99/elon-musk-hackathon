import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAzureAI, defaultAzureConfig, demoAI, readLocalConfig } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";
import { assembleProfile } from "../src/pipeline/profiles";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeAll(async () => {
  await import("@langchain/openai");
}, 60_000);

it("loads Azure settings from Vite environment variables and trims surrounding whitespace", async () => {
  vi.stubEnv("VITE_AZURE_OPENAI_ENDPOINT", " https://test-resource.openai.azure.com/ ");
  vi.stubEnv("VITE_AZURE_OPENAI_DEPLOYMENT", " test-deployment ");
  vi.stubEnv("VITE_AZURE_OPENAI_API_VERSION", " 2024-10-21 ");
  vi.stubEnv("VITE_AZURE_OPENAI_API_KEY", " fake-env-test-key ");
  const config = await readLocalConfig();
  expect(config.endpoint).toBe("https://test-resource.openai.azure.com/");
  expect(config.deployment).toBe("test-deployment");
  expect(config.apiVersion).toBe("2024-10-21");
  expect(config.apiKey === "fake-env-test-key").toBe(true);

  vi.stubEnv("VITE_AZURE_OPENAI_API_KEY", "fake-updated-env-key");
  expect((await readLocalConfig()).apiKey === "fake-updated-env-key").toBe(true);
});

it("does not replace local configuration or defaults with blank Vite settings", async () => {
  const variables = [
    "VITE_AZURE_OPENAI_ENDPOINT",
    "VITE_AZURE_OPENAI_DEPLOYMENT",
    "VITE_AZURE_OPENAI_API_VERSION",
    "VITE_AZURE_OPENAI_API_KEY",
  ];
  for (const variable of variables) vi.stubEnv(variable, undefined);
  const baseline = { ...defaultAzureConfig, ...(await readLocalConfig()) };
  for (const variable of variables) vi.stubEnv(variable, "  ");
  const configured = { ...defaultAzureConfig, ...(await readLocalConfig()) };
  expect(
    (["endpoint", "deployment", "apiVersion", "apiKey"] as const).every(
      (field) => configured[field] === baseline[field],
    ),
  ).toBe(true);
});

function toolResponse(name: string, value: unknown) {
  return new Response(
    JSON.stringify({
      id: "mock-completion",
      object: "chat.completion",
      created: 1,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name, arguments: JSON.stringify(value) },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

it("uses the supplied Azure endpoint, deployment, API version and structured output without a network call", async () => {
  const intent = {
    product_description: "iPhone 16 128GB",
    quantity: 1,
    delivery_area: "TP.HCM",
    requirements: [
      {
        requirement_id: "mall",
        user_text: "Chỉ mua Mall",
        field_path: "seller.is_mall",
        operator: "eq",
        value: true,
        unit: null,
      },
    ],
    preferences: [],
    questions_for_user: [],
  };
  const requests: { url: string; headers: Headers; body: string }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = await request.text();
    requests.push({ url: request.url, headers: request.headers, body });

    return toolResponse("interpret_intent", intent);
  });
  const ai = await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" });
  expect(await ai.interpretIntent(["Find an iPhone"])).toEqual(intent);
  expect(requests).toHaveLength(1);
  const url = new URL(requests[0].url);
  expect(url.origin).toBe("https://baophanai.openai.azure.com");
  expect(url.pathname).toBe("/openai/deployments/gpt-5-mini/chat/completions");
  expect(url.searchParams.get("api-version")).toBe("2024-05-01-preview");
  expect(requests[0].headers.get("api-key")).toBe("fake-unit-test-key");
  expect(JSON.parse(requests[0].body).tools[0].function.name).toBe("interpret_intent");
  expect(JSON.parse(requests[0].body).tools[0].function.strict).toBe(true);
});

it.each(["mall", "is_mall", "no_filters"])(
  "constrains Azure search plans to advertised filter names: %s",
  async (name) => {
    const bodies: string[] = [];
    const plan = {
      query: "iPhone 16",
      filters: name === "no_filters" ? [] : [{ name, value: true, requirement_ids: ["mall"] }],
      sort_by: null,
      post_search_requirement_ids: [],
    };
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      bodies.push(await new Request(input, init).text());

      return toolResponse("build_search_plan", plan);
    });
    const ai = await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" });
    const result = ai.buildSearchPlan(
      {
        product_description: "iPhone 16",
        quantity: 1,
        delivery_area: "TP.HCM",
        requirements: [
          {
            requirement_id: "mall",
            user_text: "Chỉ mua Mall",
            field_path: "seller.is_mall",
            operator: "eq",
            value: true,
            unit: null,
          },
        ],
        preferences: [],
        questions_for_user: [],
      },
      {
        filters:
          name === "no_filters"
            ? []
            : [{ name: "mall", field_path: "seller.is_mall", values: [true] }],
        sort_options: ["relevancy"],
      },
    );

    if (name === "is_mall") await expect(result).rejects.toThrow();
    else expect(await result).toEqual(plan);
    const schema = JSON.parse(bodies[0]).tools[0].function.parameters.properties;
    if (name === "no_filters") expect(schema.filters.maxItems).toBe(0);
    else {
      const option = schema.filters.items.anyOf?.[0] ?? schema.filters.items;
      expect(option.properties.name.const).toBe("mall");
      expect(option.properties.value.const).toBe(true);
    }

    expect(schema.sort_by.anyOf[0].enum).toEqual(["relevancy"]);
    expect(schema.post_search_requirement_ids.items.enum).toEqual(["mall"]);
  },
);

it("rejects invented post-search requirement IDs in the Azure schema", async () => {
  const intent = await demoAI.interpretIntent([
    "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM.",
  ]);
  vi.stubGlobal("fetch", async () =>
    toolResponse("build_search_plan", {
      query: "iPhone 16 128GB",
      filters: [],
      sort_by: null,
      post_search_requirement_ids: ["invented"],
    }),
  );
  const ai = await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" });
  await expect(ai.buildSearchPlan(intent, { filters: [], sort_options: [] })).rejects.toThrow();
});

it.each(["unique", "duplicate", "invented"])(
  "derives review counts from valid citation identities: %s",
  async (kind) => {
    vi.stubGlobal("fetch", async () =>
      toolResponse("summarize_reviews", {
        themes: [
          {
            subject: "product",
            sentiment: "positive",
            description: "Máy tốt.",
            review_ids:
              kind === "duplicate"
                ? ["a", "b", "a"]
                : kind === "invented"
                  ? ["invented"]
                  : ["a", "b"],
          },
        ],
        limitations: [],
      }),
    );
    const ai = await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" });
    const result = ai.summarizeReviews(
      [
        {
          review_id: "a",
          variant_id: "789",
          rating: 5,
          text: "Tốt",
          posted_at: "2026-10-29T00:00:00Z",
          source_url: "https://shopee.vn/product/456/123",
        },
        {
          review_id: "b",
          variant_id: null,
          rating: 5,
          text: "Tốt",
          posted_at: "2026-10-29T00:00:00Z",
          source_url: "https://shopee.vn/product/456/123",
        },
        {
          review_id: "c",
          variant_id: "789",
          rating: 1,
          text: "Kém",
          posted_at: "2026-10-29T00:00:00Z",
          source_url: "https://shopee.vn/product/456/123",
        },
      ],
      "789",
    );
    if (kind === "invented") {
      await expect(result).rejects.toThrow();

      return;
    }

    const summary = await result;
    expect(summary.analyzed_review_count).toBe(3);
    expect(summary.themes[0].review_ids).toEqual(["a", "b"]);
    expect(summary.themes[0].matching_variant_review_count).toBe(1);
    if (kind === "duplicate")
      expect(summary.limitations.join(" ")).toContain("Đã gộp mã đánh giá bị lặp");
  },
);

it("does not call Azure when Shopee returned no reviews", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const ai = await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" });
  expect(await ai.summarizeReviews([], "789")).toMatchObject({
    analyzed_review_count: 0,
    themes: [],
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it("preserves exact missing fields and derives ranks without altering AI ordering", async () => {
  const intent = await demoAI.interpretIntent([
    "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM.",
  ]);
  const marketplace = createFixtureMarketplace();
  const profiles = await Promise.all(
    fixtureListings
      .slice(0, 2)
      .map((listing) => assembleProfile(listing, intent, marketplace, demoAI)),
  );
  const ordered = [...profiles].reverse();
  vi.stubGlobal("fetch", async () =>
    toolResponse("rank_offers", {
      ranked_offers: ordered.map((profile) => ({
        offer_id: profile.offer_id,
        preference_reasons: [],
        trade_offs: [],
      })),
    }),
  );
  const ai = await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" });
  const ranking = await ai.rankOffers(intent, profiles);
  expect(ranking.ranked_offers.map((row) => row.offer_id)).toEqual(
    ordered.map((profile) => profile.offer_id),
  );
  expect(ranking.ranked_offers.map((row) => row.rank)).toEqual([1, 2]);
  expect(ranking.ranked_offers.map((row) => row.missing_fields)).toEqual(
    ordered.map((profile) => profile.missing_fields),
  );
});
