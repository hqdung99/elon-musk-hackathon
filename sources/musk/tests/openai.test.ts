import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createOpenAI, defaultOpenAIConfig, demoAI, readLocalConfig } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";
import { unwrap } from "../src/providers/marketplace";
import { assembleProfile } from "../src/pipeline/profiles";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeAll(async () => {
  await import("@langchain/openai");
}, 60_000);

it("loads OpenAI settings from Vite environment variables and trims surrounding whitespace", async () => {
  vi.stubEnv("VITE_OPENAI_ENDPOINT", " https://api.openai.com/v1 ");
  vi.stubEnv("VITE_OPENAI_MODEL", " test-model ");
  vi.stubEnv("VITE_OPENAI_API_KEY", " fake-env-test-key ");
  const config = await readLocalConfig();
  expect(config.endpoint).toBe("https://api.openai.com/v1");
  expect(config.model).toBe("test-model");
  expect(config.apiKey === "fake-env-test-key").toBe(true);

  vi.stubEnv("VITE_OPENAI_API_KEY", "fake-updated-env-key");
  expect((await readLocalConfig()).apiKey === "fake-updated-env-key").toBe(true);
});

it("does not replace local configuration or defaults with blank Vite settings", async () => {
  const variables = ["VITE_OPENAI_ENDPOINT", "VITE_OPENAI_MODEL", "VITE_OPENAI_API_KEY"];
  for (const variable of variables) vi.stubEnv(variable, undefined);
  const baseline = { ...defaultOpenAIConfig, ...(await readLocalConfig()) };
  for (const variable of variables) vi.stubEnv(variable, "  ");
  const configured = { ...defaultOpenAIConfig, ...(await readLocalConfig()) };
  expect(
    (["endpoint", "model", "apiKey"] as const).every(
      (field) => configured[field] === baseline[field],
    ),
  ).toBe(true);
});

function toolResponse(_name: string, value: unknown) {
  return new Response(
    JSON.stringify({
      id: "mock-completion",
      object: "chat.completion",
      created: 1,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(value),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

it("uses a constrained turn decision before interpreting a new product", async () => {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(await new Request(input, init).text());

    return toolResponse("interpret_turn", {
      action: "new_product",
      question: null,
      suggested_replies: [],
    });
  });
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  const intent = await demoAI.interpretIntent([
    "Mua 1 máy iPhone 16 128GB. Tổng tối đa 19 triệu VND. Giao tại TP.HCM.",
  ]);
  expect(await ai.interpretTurn("mua nệm cao su", { intent, result: null })).toEqual({
    action: "new_product",
    question: null,
    suggested_replies: [],
  });
  const body = JSON.parse(bodies[0]);
  expect(body.response_format.json_schema.name).toBe("interpret_turn");
  expect(body.response_format.json_schema.schema.required).toContain("suggested_replies");
  expect(body.response_format.json_schema.strict).toBe(true);
  const data = JSON.parse(body.messages[1].content).data;
  expect(data.text).toBe("mua nệm cao su");
  expect(data.context.intent.product_description).toBe("iPhone 16 128GB");
  expect(data.context.has_results).toBe(false);
  expect(data.context.result).toBeUndefined();
});

it("constrains OpenAI SKU choices to variants not known to be unavailable", async () => {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(await new Request(input, init).text());

    return toolResponse("choose_variant", {
      status: "selected",
      variant_id: "unknown",
      reason: "Không có mâu thuẫn",
      ambiguous_variant_ids: [],
    });
  });
  const intent = await demoAI.interpretIntent(["Mua 2 máy iPhone 16 128GB, giao tại TP.HCM"]);
  const product = unwrap(await createFixtureMarketplace().getProductDetails(fixtureListings[0]));
  product.variants = [
    { variant_id: "sold-out", name: "Hết hàng", has_stock: false },
    { variant_id: "insufficient", name: "Chỉ còn 1", stock: 1 },
    { variant_id: "unknown", name: "Chưa xác minh", stock: null },
  ];
  product.default_variant_id = "sold-out";
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  expect((await ai.chooseVariant(intent, product)).variant_id).toBe("unknown");
  const body = JSON.parse(bodies[0]);
  const data = JSON.parse(body.messages[1].content).data;
  expect(
    data.product.variants.map((variant: { variant_id: string }) => variant.variant_id),
  ).toEqual(["unknown"]);
  expect(data.product.default_variant_id).toBeNull();
  expect(body.response_format.json_schema.schema.properties.variant_id.anyOf[0].enum).toEqual([
    "unknown",
  ]);
});

it("does not call OpenAI when every variant is known unavailable", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const intent = await demoAI.interpretIntent(["Mua 1 máy iPhone 16 128GB, giao tại TP.HCM"]);
  const product = unwrap(await createFixtureMarketplace().getProductDetails(fixtureListings[0]));
  product.variants.forEach((variant) => {
    variant.has_stock = false;
  });
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  expect(await ai.chooseVariant(intent, product)).toMatchObject({
    status: "no_match",
    variant_id: null,
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it("uses the supplied OpenAI endpoint, model, API version and structured output without a network call", async () => {
  const intent = {
    product_description: "iPhone 16 128GB",
    shopping_goal: { mode: "targeted", category: "điện thoại", requested_brand: "Apple" },
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
    suggested_replies: [],
  };
  const requests: { url: string; headers: Headers; body: string }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = await request.text();
    requests.push({ url: request.url, headers: request.headers, body });

    return toolResponse("interpret_intent", intent);
  });
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  expect(await ai.interpretIntent(["Find an iPhone"])).toEqual(intent);
  expect(requests).toHaveLength(1);
  const url = new URL(requests[0].url);
  expect(url.origin).toBe("https://api.openai.com");
  expect(url.pathname).toBe("/v1/chat/completions");
  expect(url.searchParams.has("api-version")).toBe(false);
  expect(requests[0].headers.get("authorization")).toBe("Bearer fake-unit-test-key");
  expect(requests[0].headers.has("api-key")).toBe(false);
  expect(JSON.parse(requests[0].body).model).toBe("gpt-5-mini");
  expect(JSON.parse(requests[0].body).response_format.json_schema.name).toBe("interpret_intent");
  expect(JSON.parse(requests[0].body).response_format.json_schema.strict).toBe(true);
  expect(JSON.parse(requests[0].body).response_format.json_schema.schema.required).toContain(
    "suggested_replies",
  );
});

it.each(["mall", "is_mall", "no_filters"])(
  "constrains OpenAI search plans to advertised filter names: %s",
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
    const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
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
    const schema = JSON.parse(bodies[0]).response_format.json_schema.schema.properties;
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

it("rejects invented post-search requirement IDs in the OpenAI schema", async () => {
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
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
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
    const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
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

it("does not call OpenAI when Shopee returned no reviews", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
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
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text());
    const schema = body.response_format.json_schema.schema;
    // Repeated empty preference arrays previously became $ref nodes with
    // maxItems/title siblings, rejected by the real OpenAI schema validator.
    expect(JSON.stringify(schema)).not.toContain('"$ref"');
    expect(schema.additionalProperties).toBe(false);
    const rows = schema.properties.ranked_offers;
    expect(rows.minItems).toBe(profiles.length);
    expect(rows.maxItems).toBe(profiles.length);
    for (const option of rows.items.anyOf)
      expect(option.properties.preference_reasons.maxItems).toBe(0);

    return toolResponse("rank_offers", {
      ranked_offers: ordered.map((profile) => ({
        offer_id: profile.offer_id,
        preference_reasons: [],
        trade_offs: [],
      })),
    });
  });
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  const ranking = await ai.rankOffers(intent, profiles);
  expect(ranking.ranked_offers.map((row) => row.offer_id)).toEqual(
    ordered.map((profile) => profile.offer_id),
  );
  expect(ranking.ranked_offers.map((row) => row.rank)).toEqual([1, 2]);
  expect(ranking.ranked_offers.map((row) => row.missing_fields)).toEqual(
    ordered.map((profile) => profile.missing_fields),
  );
});

it("uses low reasoning effort only for listing relevance classification", async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text());
    bodies.push(body);
    const task = body.response_format.json_schema.name;

    return toolResponse(
      task,
      task === "assess_listings"
        ? {
            assessments: [
              {
                listing_id: "1",
                seller_id: "2",
                status: "relevant",
                reason: "Tiêu đề là điện thoại.",
              },
            ],
          }
        : {
            ...intent,
            suggested_replies: [],
            shopping_goal: { mode: "targeted", category: "điện thoại", requested_brand: "Apple" },
          },
    );
  });
  const intent = await demoAI.interpretIntent([
    "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM.",
  ]);
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  await ai.assessListings(intent, [
    { listing_id: "1", seller_id: "2", url: "https://shopee.vn/product/2/1", title: "iPhone 16" },
  ]);
  await ai.interpretIntent(["Mua iPhone 16"]);
  expect(bodies[0].reasoning_effort).toBe("low");
  expect(bodies[1].reasoning_effort).toBeUndefined();
});

it("summarizes only written reviews with a short, low-effort request", async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(await new Request(input, init).text()));

    return toolResponse("summarize_reviews", {
      themes: [
        {
          subject: "product",
          sentiment: "positive",
          description: "Máy tốt.",
          review_ids: ["a"],
        },
      ],
      limitations: [],
    });
  });
  const review = (review_id: string, text: string) => ({
    review_id,
    variant_id: "789",
    rating: 5,
    text,
    posted_at: "2026-10-29T00:00:00Z",
    source_url: "https://shopee.vn/product/456/123",
  });
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  const summary = await ai.summarizeReviews(
    [review("a", `  ${"Tốt ".repeat(100)}`), review("b", "   "), review("c", "Giao nhanh")],
    "789",
  );
  expect(summary.analyzed_review_count).toBe(3);
  expect(summary.themes[0].matching_variant_review_count).toBe(1);
  expect(bodies).toHaveLength(1);
  expect(bodies[0].reasoning_effort).toBe("low");
  const data = JSON.parse((bodies[0].messages as { content: string }[])[1].content).data;
  expect(data.reviews.map((entry: { review_id: string }) => entry.review_id)).toEqual(["a", "c"]);
  expect(Object.keys(data.reviews[0]).sort()).toEqual([
    "rating",
    "review_id",
    "text",
    "variant_id",
  ]);
  expect(data.reviews[0].text).toHaveLength(280);
  expect(data.instructions).toContain("at most 4 themes");
});

it("does not call the model when reviews have ratings but no text", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const ai = await createOpenAI({ ...defaultOpenAIConfig, apiKey: "fake-unit-test-key" });
  const summary = await ai.summarizeReviews(
    [
      {
        review_id: "a",
        variant_id: null,
        rating: 5,
        text: "",
        posted_at: "2026-10-29T00:00:00Z",
        source_url: "https://shopee.vn/product/456/123",
      },
    ],
    "789",
  );
  expect(summary).toMatchObject({ analyzed_review_count: 1, themes: [] });
  expect(fetcher).not.toHaveBeenCalled();
});
