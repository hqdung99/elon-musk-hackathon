import { describe, expect, it, vi } from "vitest";
import { createShopeeAdapter } from "../src/providers/marketplace";
import { cartItem, cartServer } from "./helpers/shopee-cart";

const listing = {
  listing_id: "123",
  seller_id: "456",
  url: "https://shopee.vn/product/456/123",
  title: "Shopee item 123",
};

it.each([null, undefined, []])(
  "handles unavailable review rows as no retrieved evidence: %j",
  async (ratings) => {
    const adapter = createShopeeAdapter(
      async () => new Response(JSON.stringify({ error: 0, data: { ratings } }), { status: 200 }),
    );
    await expect(adapter.getReviews(listing)).resolves.toEqual({ status: "ok", data: [] });
  },
);

it("still rejects malformed review rows and Shopee API errors", async () => {
  const malformed = createShopeeAdapter(
    async () => new Response(JSON.stringify({ error: 0, data: { ratings: {} } }), { status: 200 }),
  );
  await expect(malformed.getReviews(listing)).rejects.toThrow("get_ratings.data.ratings");
  const failed = createShopeeAdapter(
    async () =>
      new Response(JSON.stringify({ error: 403, data: { ratings: null } }), { status: 200 }),
  );
  await expect(failed.getReviews(listing)).rejects.toThrow("returned error 403");
});

const productResponse = {
  error: 0,
  data: {
    item: {
      item_id: 123,
      shop_id: 456,
      title: "Apple iPhone 17 Pro Max 256GB",
      condition: 1,
      brand: "Apple",
      models: [
        {
          model_id: 789,
          name: "Titan tự nhiên",
          price: 3_569_000_000_000,
          stock: 5,
          has_stock: true,
          extinfo: { tier_index: [0] },
        },
      ],
      stock: 5,
    },
    product_price: {
      price: { single_value: 3_569_000_000_000 },
      price_model: { price_single_model_id: 789 },
    },
    shop_detailed: {
      shopid: 456,
      name: "Shopee Shop",
      is_official_shop: true,
      rating_star: 4.9,
      sold_total: null,
    },
    free_return: null,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Shopee marketplace adapter", () => {
  it("maps API-provided filters and searches organic results with pagination", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://musk.local");
      if (url.pathname.endsWith("/search_filter_config"))
        return jsonResponse({
          error: 0,
          data: {
            filter_configuration_v2: {
              filter_groups: [
                {
                  name: "SHOP_TYPE",
                  filters: [{ value: "OFFICIAL_MALL" }],
                },
                {
                  name: "CONDITION",
                  filters: [{ value: "NEW_ITEM" }, { value: "USED_ITEM" }],
                },
              ],
            },
          },
        });
      if (url.pathname.endsWith("/search_items"))
        return jsonResponse({
          error: 0,
          nomore: false,
          items: [
            { adsid: null, item_data: { itemid: 123, shopid: 456 } },
            { adsid: 1, item_data: { itemid: 999, shopid: 888 } },
          ],
        });

      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    const adapter = createShopeeAdapter(fetcher);
    const capabilities = await adapter.getSearchCapabilities("iPhone 17");

    expect(capabilities).toEqual({
      status: "ok",
      data: {
        filters: [
          { name: "mall", field_path: "seller.is_mall", values: [true] },
          { name: "condition", field_path: "product.condition", values: ["new", "used"] },
        ],
        sort_options: ["relevancy", "price_asc", "price_desc"],
      },
    });
    const results = await adapter.searchProducts(
      {
        query: "iPhone 17",
        filters: [{ name: "mall", value: true, requirement_ids: ["mall"] }],
        sort_by: "price_asc",
        post_search_requirement_ids: [],
      },
      2,
    );

    expect(results).toEqual({
      status: "ok",
      data: {
        items: [
          {
            listing_id: "123",
            seller_id: "456",
            url: "https://shopee.vn/product/456/123",
            title: "Shopee item 123",
          },
        ],
        next_page: 3,
        has_more: true,
      },
    });
    const searchUrl = new URL(String(fetcher.mock.calls[1][0]), "https://musk.local");
    expect(JSON.parse(searchUrl.searchParams.get("fe_filter_options") ?? "[]")).toEqual([
      { group_name: "SHOP_TYPE", values: ["OFFICIAL_MALL"] },
    ]);
    expect(searchUrl.searchParams.get("newest")).toBe("60");
  });

  it("shares product data across product, seller, quote, and policy methods", async () => {
    const cart = cartServer({ existing: [cartItem()] });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://musk.local");
      if (init?.body) expect(init.method).toBe("POST");
      if (url.pathname.endsWith("/get_pc")) return jsonResponse(productResponse);
      if (url.pathname.endsWith("/cart/get"))
        return jsonResponse(await cart.request(url.pathname, "cart_get"));
      if (url.pathname.endsWith("/add_to_cart") || url.pathname.endsWith("/cart/update"))
        return jsonResponse(
          await cart.request(
            url.pathname,
            url.pathname.endsWith("/add_to_cart") ? "add_to_cart" : "cart_remove",
            undefined,
            JSON.parse(String(init?.body)),
          ),
        );
      if (url.pathname.endsWith("/select_variation_pc"))
        return jsonResponse({
          error: 0,
          data: {
            product_price: productResponse.data.product_price,
            stock: 5,
            max_quantity: 5,
          },
        });
      if (url.pathname.includes("/get_recommend_"))
        return jsonResponse({ error: 0, data: { shop_vouchers: [], vouchers: [] } });
      if (url.pathname.endsWith("/checkout/get"))
        return jsonResponse({
          error: 0,
          error_message: "success",
          data: {
            checkout_price_data: {
              total_payable: 3_571_500_000_000,
              shipping_subtotal_before_discount: 2_500_000_000,
              shipping_discount_subtotal: 0,
              shipping_subtotal: 2_500_000_000,
            },
            shoporders: [
              {
                shop: { shopid: 456 },
                shipping_id: 1,
                items: [{ itemid: 123, modelid: 789, quantity: 1, price: 3_569_000_000_000 }],
              },
            ],
            shipping_orders: [
              {
                shipping_id: 1,
                shoporder_indexes: [0],
                selected_logistic_channelid: 5001,
                shipping_fee: 2_500_000_000,
                shipping_fee_discount: 0,
              },
            ],
          },
        });
      if (url.pathname.endsWith("/get_ratings"))
        return jsonResponse({
          error: 0,
          data: {
            ratings: [
              {
                cmtid: 1001,
                ctime: 1_798_000_000,
                rating_star: 5,
                comment: "Máy tốt.",
                product_items: [{ modelid: 789 }],
              },
            ],
          },
        });
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    const adapter = createShopeeAdapter(fetcher);
    const [product, seller, reviews, quote, policies] = await Promise.all([
      adapter.getProductDetails(listing),
      adapter.getSellerDetails(listing),
      adapter.getReviews(listing),
      adapter.getOfferQuote(listing, "789", { quantity: 1, delivery_area: "tp.hcm" }),
      adapter.getPurchasePolicies(listing, "789"),
    ]);

    expect(product).toMatchObject({
      status: "ok",
      data: {
        title: "Apple iPhone 17 Pro Max 256GB",
        model: "iPhone 17 Pro Max",
        storage_gb: 256,
        condition: "new",
        default_variant_id: "789",
      },
    });
    expect(seller).toMatchObject({
      status: "ok",
      data: { seller_id: "456", name: "Shopee Shop", is_mall: true, rating: 4.9 },
    });
    expect(reviews).toMatchObject({
      status: "ok",
      data: [{ review_id: "1001", variant_id: "789", rating: 5, text: "Máy tốt." }],
    });
    expect(quote).toMatchObject({
      status: "ok",
      data: {
        item_unit_price: { amount_minor: 35_690_000, currency: "VND" },
        shipping_cost: { amount_minor: 25_000, currency: "VND" },
        other_fees: { amount_minor: 0, currency: "VND" },
        total: { amount_minor: 35_715_000, currency: "VND" },
        total_estimated: true,
        discounts: [],
        in_stock: true,
        delivery_area: "tp.hcm",
      },
    });
    expect(policies).toMatchObject({
      status: "ok",
      data: {
        returns_accepted: null,
        return_window_days: null,
        warranty_months: null,
        conditions: null,
      },
    });
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/get_pc"))).toHaveLength(
      1,
    );
    expect(
      fetcher.mock.calls.filter(([input]) => String(input).includes("/add_to_cart")),
    ).toHaveLength(1);
    expect(cart.state()).toEqual([]);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("/get_recommend_"))).toBe(
      true,
    );
    const selectionCall = fetcher.mock.calls.find(([input]) =>
      String(input).includes("/select_variation_pc"),
    );
    expect(JSON.parse(String(selectionCall?.[1]?.body))).toMatchObject({
      item_id: 123,
      shop_id: 456,
      quantity: 1,
      selected_tiers: { "0": 0 },
    });
    await adapter.getPurchasePolicies(listing, "789");
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/get_pc"))).toHaveLength(
      1,
    );
    await adapter.getProductDetails(listing);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/get_pc"))).toHaveLength(
      2,
    );
  });

  it("surfaces API failures rather than returning success-shaped empty data", async () => {
    const adapter = createShopeeAdapter(async () => jsonResponse({ error: 17 }, 200));

    await expect(adapter.getProductDetails(listing)).rejects.toThrow("returned error 17");
  });
});
