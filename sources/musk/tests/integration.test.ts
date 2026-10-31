import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { listingKey } from "../src/domain/schemas";
import { approveAndRevalidate, completeSelection, runPipeline } from "../src/pipeline/orchestrator";
import { createAzureAI, defaultAzureConfig } from "../src/providers/ai";
import { createShopeeAdapter } from "../src/providers/marketplace";
import { cartItem, cartServer } from "./helpers/shopee-cart";

beforeAll(async () => {
  await import("@langchain/openai");
}, 60_000);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("integrates Azure contracts and Shopee search, relevance, explicit SKU, cart shipping, ranking and fresh revalidation", async () => {
  const intent = {
    product_description: "iPhone 16 128GB",
    quantity: 1,
    delivery_area: "TP.HCM",
    requirements: [
      {
        requirement_id: "model",
        user_text: "iPhone 16",
        field_path: "product.model",
        operator: "eq",
        value: "iPhone 16",
        unit: null,
      },
      {
        requirement_id: "storage",
        user_text: "128GB",
        field_path: "product.storage_gb",
        operator: "eq",
        value: 128,
        unit: "GB",
      },
      {
        requirement_id: "budget",
        user_text: "Tổng tối đa 25 triệu VND",
        field_path: "quote.total",
        operator: "lte",
        value: 25_000_000,
        unit: "VND",
      },
    ],
    preferences: [
      {
        preference_id: "price",
        user_text: "Ưu tiên giá rẻ",
        field_path: "quote.total",
        direction: "lower",
        preferred_value: null,
        priority: 1,
      },
    ],
    questions_for_user: [],
  };
  const original = { ...cartItem(99, 88, 3), checkout: false };
  const cart = cartServer({ existing: [original] });
  const requests: string[] = [];
  const azureTasks: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "https://musk.local");
    const path = url.pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push(path);
    let payload: unknown;
    if (path.endsWith("/chat/completions")) {
      const task = body.tools[0].function.name;
      azureTasks.push(task);
      expect(body.tools[0].function.strict).toBe(true);
      const data = JSON.parse(body.messages[1].content).data;
      const output =
        task === "interpret_intent"
          ? intent
          : task === "build_search_plan"
            ? {
                query: "iPhone 16 128GB",
                filters: [],
                sort_by: "relevancy",
                post_search_requirement_ids: ["model", "storage", "budget"],
              }
            : task === "assess_listings"
              ? {
                  assessments: data.listings.map(
                    (listing: { listing_id: string; seller_id: string }) => ({
                      ...listing,
                      status: listing.listing_id === "999" ? "irrelevant" : "relevant",
                      reason:
                        listing.listing_id === "999"
                          ? "Tiêu đề ghi ốp lưng, không phải điện thoại."
                          : "Tiêu đề ghi điện thoại iPhone 16 128GB.",
                    }),
                  ),
                }
              : task === "summarize_reviews"
                ? {
                    themes: [
                      {
                        subject: "product",
                        sentiment: "positive",
                        description: "Máy tốt.",
                        review_ids: ["1"],
                      },
                    ],
                    limitations: ["Mẫu đánh giá nhỏ."],
                  }
                : task === "rank_offers"
                  ? {
                      ranked_offers: data.profiles.map((profile: { offer_id: string }) => ({
                        offer_id: profile.offer_id,
                        preference_reasons: [],
                        trade_offs: ["Chưa rõ tổng thanh toán nên chưa xác nhận ngân sách."],
                      })),
                    }
                  : undefined;
      if (!output) throw new Error(`Unexpected Azure task: ${task}`);
      payload = {
        id: "integration",
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
                  id: `call-${azureTasks.length}`,
                  type: "function",
                  function: { name: task, arguments: JSON.stringify(output) },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };
    } else if (path.endsWith("/search_filter_config")) {
      payload = { data: { filter_configuration_v2: { filter_groups: [] } } };
    } else if (path.endsWith("/search_items")) {
      payload = {
        nomore: true,
        items: [
          {
            adsid: null,
            item_basic: { itemid: 123, shopid: 456, name: "Điện thoại Apple iPhone 16 128GB" },
          },
          { adsid: null, item_basic: { itemid: 999, shopid: 456, name: "Ốp lưng iPhone 16" } },
        ],
      };
    } else if (path.endsWith("/get_pc")) {
      expect(url.searchParams.get("item_id")).toBe("123");
      payload = {
        data: {
          item: {
            item_id: 123,
            shop_id: 456,
            title: "Điện thoại Apple iPhone 16 128GB",
            condition: 1,
            models: [
              { model_id: 789, name: "Đen", extinfo: { tier_index: [0] } },
              { model_id: 790, name: "Trắng", extinfo: { tier_index: [1] } },
            ],
          },
          product_price: { price_model: { price_single_model_id: null } },
          shop_detailed: {
            shopid: 456,
            name: "Test Mall",
            is_official_shop: true,
            rating_star: 4.9,
          },
        },
      };
    } else if (path.endsWith("/get_ratings")) {
      payload = {
        data: {
          ratings: [
            {
              cmtid: 1,
              ctime: 1_798_000_000,
              rating_star: 5,
              comment: "Máy tốt.",
              product_items: [{ modelid: 789 }],
            },
            {
              cmtid: 2,
              ctime: 1_798_000_001,
              rating_star: 4,
              comment: "Đóng gói ổn.",
              product_items: [{ modelid: 790 }],
            },
          ],
        },
      };
    } else if (path.endsWith("/select_variation_pc")) {
      expect(body.selected_tiers).toEqual({ "0": 0 });
      payload = {
        data: {
          product_price: {
            price: { single_value: 2_259_000_000_000 },
            price_model: { price_single_model_id: 789 },
          },
          stock: 5,
          max_quantity: 5,
        },
      };
    } else if (path.endsWith("/checkout/get")) {
      expect(cart.state().some((item) => item.itemid === 123 && item.modelid === 789)).toBe(true);
      expect(body.shoporders).toHaveLength(1);
      expect(body.shoporders[0].items).toHaveLength(1);
      expect(body.shoporders[0].items[0]).toMatchObject({
        itemid: 123,
        modelid: 789,
        quantity: 1,
        item_group_id: null,
      });
      payload = {
        can_checkout: true,
        checkout_price_data: {
          shipping_subtotal_before_discount: 100_000_000,
          shipping_discount_subtotal: 0,
          shipping_subtotal: 100_000_000,
        },
        shoporders: [
          {
            shop: { shopid: 456 },
            shipping_id: 1,
            items: [{ itemid: 123, modelid: 789, quantity: 1, price: 2_259_000_000_000 }],
          },
        ],
        shipping_orders: [
          {
            shipping_id: 1,
            shoporder_indexes: [0],
            selected_logistic_channelid: 5001,
            shipping_fee: 100_000_000,
            shipping_fee_discount: 0,
          },
        ],
      };
    } else if (path.includes("/v4/cart/")) {
      const endpoint = path.endsWith("/get")
        ? "cart_get"
        : path.endsWith("/add_to_cart")
          ? "add_to_cart"
          : "cart_remove";
      payload = await cart.request(path, endpoint, init?.signal ?? undefined, body);
    } else throw new Error(`Unexpected network request: ${path}`);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  vi.stubGlobal("fetch", fetcher);
  const deps = {
    ai: await createAzureAI({ ...defaultAzureConfig, apiKey: "fake-unit-test-key" }),
    marketplace: createShopeeAdapter(fetcher),
  };
  const output = await runPipeline(
    ["Mua 1 máy iPhone 16 128GB. Tổng tối đa 25 triệu VND, giao tại TP.HCM. Ưu tiên giá rẻ."],
    deps,
  );
  if (output.status !== "selection") throw new Error("Expected explicit SKU selection.");
  expect(output.candidates).toHaveLength(1);
  expect(output.search_review.entries.map((entry) => entry.status)).toEqual([
    "pending",
    "irrelevant",
  ]);
  expect(requests.some((path) => path.includes("/cart/"))).toBe(false);
  const result = await completeSelection(
    output,
    { [listingKey(output.candidates[0].listing)]: "789" },
    deps,
  );
  expect(result.mode).toBe("shopee/azure");
  expect(result.profiles).toHaveLength(1);
  const profile = result.profiles[0];
  expect(profile.quote.item_unit_price?.amount_minor).toBe(22_590_000);
  expect(profile.quote.shipping_cost?.amount_minor).toBe(1_000);
  expect(profile.quote.total).toBeNull();
  expect(profile.quote.discounts).toEqual([]);
  expect(profile.review_summary.analyzed_review_count).toBe(2);
  expect(profile.review_summary.themes[0].matching_variant_review_count).toBe(1);
  expect(result.recommendation.recommended_offer_id).toBe(profile.offer_id);
  expect(result.filters[0].status).toBe("unresolved");
  expect(result.search_review.entries.map((entry) => entry.status)).toEqual([
    "unresolved",
    "irrelevant",
  ]);
  expect(result.search_review.entries[0].selected_variant).toEqual({
    variant_id: "789",
    name: "Đen",
  });
  expect(cart.state()).toEqual([]);
  const handoff = await approveAndRevalidate(1, profile, result.intent, deps, deps.marketplace);
  expect(handoff.validation.status).toBe("ready_with_unknowns");
  expect(handoff.validation.changed_fields).toEqual([]);
  expect(handoff.navigation?.status).toBe("ready");
  if (handoff.navigation?.status !== "ready") throw new Error("Expected prepared cart handoff.");
  expect(handoff.navigation.checkout_url).toBe("https://shopee.vn/cart");
  expect(handoff.fresh.selected_variant_id).toBe("789");
  expect(cart.state()).toEqual([cartItem(123, 789, 1)]);
  expect(requests.filter((path) => path.endsWith("/add_to_cart"))).toHaveLength(3);
  expect(requests.filter((path) => path.endsWith("/cart/update"))).toHaveLength(3);
  expect(requests.filter((path) => path.endsWith("/get_pc"))).toHaveLength(2);
  expect(requests.filter((path) => path.endsWith("/checkout/get"))).toHaveLength(2);
  expect(requests.some((path) => path.includes("/get_recommend_"))).toBe(false);
  expect(azureTasks).toEqual([
    "interpret_intent",
    "build_search_plan",
    "assess_listings",
    "summarize_reviews",
    "rank_offers",
    "summarize_reviews",
  ]);
});
