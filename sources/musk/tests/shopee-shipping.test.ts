import { describe, expect, it, vi } from "vitest";
import { createCheckoutShippingEstimator } from "../src/providers/shopee-shipping";
import { createShopeeAdapter, unwrap } from "../src/providers/marketplace";
import { cartServer } from "./helpers/shopee-cart";
import { calculateTotal } from "../src/domain/requirements";
import type { OfferQuote } from "../src/domain/schemas";

const listing = {
  listing_id: "123",
  seller_id: "456",
  url: "https://shopee.vn/product/456/123",
  title: "Test product",
};

function checkoutResponse(shippingFee = 2_500_000_000, discount = 0) {
  return {
    can_checkout: true,
    checkout_price_data: {
      shipping_subtotal_before_discount: shippingFee,
      shipping_discount_subtotal: discount,
      shipping_subtotal: shippingFee - discount,
    },
    shoporders: [
      {
        shop: { shopid: 456 },
        shipping_id: 1,
        items: [{ itemid: 123, modelid: 789, quantity: 2, item_group_id: null }],
      },
    ],
    shipping_orders: [
      {
        shipping_id: 1,
        shoporder_indexes: [0],
        selected_logistic_channelid: 5001,
        shipping_fee: shippingFee,
        shipping_fee_discount: discount,
      },
    ],
  };
}

describe("checkout shipping estimates", () => {
  it.each([false, true])(
    "quotes only the requested item without touching the cart (enveloped: %s)",
    async (enveloped) => {
      const data = checkoutResponse();
      const request = vi.fn(async () => (enveloped ? { data } : data));
      const signal = new AbortController().signal;
      const result = await createCheckoutShippingEstimator(request)(listing, "789", 2, signal);

      expect(result.shipping_cost).toEqual({ amount_minor: 25_000, currency: "VND" });
      expect(result.limitations.join(" ")).toContain("địa chỉ lưu");
      expect(request).toHaveBeenCalledExactlyOnceWith(
        "v4/checkout/get",
        "checkout_get",
        signal,
        expect.objectContaining({
          checkout_session_id: expect.any(String),
          shoporders: [
            {
              shop: { shopid: 456 },
              items: [
                {
                  itemid: 123,
                  modelid: 789,
                  quantity: 2,
                  item_group_id: null,
                  add_on_deal_id: 0,
                  is_add_on_sub_item: false,
                  insurances: [],
                  insurance_vas_display: { need_regenerate_display: true },
                },
              ],
            },
          ],
          selected_payment_channel_data: {},
          promotion_data: expect.objectContaining({
            use_coins: false,
            free_shipping_voucher_info: { free_shipping_voucher_id: 0 },
            platform_vouchers: [],
            shop_vouchers: [],
            auto_apply_platform_voucher: false,
            auto_apply_shop_voucher: false,
            should_auto_update_platform_vouchers: false,
            should_auto_update_shop_vouchers: false,
          }),
        }),
      );
    },
  );

  it.each([
    { shippingFee: 0, discount: 0, expected: 0 },
    { shippingFee: 2_500_000_000, discount: 500_000_000, expected: 20_000 },
  ])("accepts verified zero fees and shipping discounts: $expected", async (test) => {
    const request = vi.fn(async () => checkoutResponse(test.shippingFee, test.discount));
    const result = await createCheckoutShippingEstimator(request)(listing, "789", 2);
    expect(result.shipping_cost?.amount_minor).toBe(test.expected);
  });

  it("does not mistake an empty shipping order and zero subtotal for free shipping", async () => {
    const data = checkoutResponse(0);
    data.shipping_orders = [];
    const request = vi.fn(async () => data);
    const result = await createCheckoutShippingEstimator(request)(listing, "789", 2);
    expect(result.shipping_cost).toBeNull();
    expect(result.limitations.join(" ")).toContain("phí ship chưa rõ");
  });

  it("keeps shipping unknown without a selected delivery channel", async () => {
    const data = checkoutResponse(0);
    data.shipping_orders[0].selected_logistic_channelid = 0;
    const result = await createCheckoutShippingEstimator(async () => data)(listing, "789", 2);
    expect(result.shipping_cost).toBeNull();
    expect(result.limitations.join(" ")).toContain("phương thức giao hàng");
  });

  it("warns when a shipping estimate does not mean checkout is allowed", async () => {
    const data = checkoutResponse();
    data.can_checkout = false;
    const result = await createCheckoutShippingEstimator(async () => data)(listing, "789", 2);
    expect(result.shipping_cost?.amount_minor).toBe(25_000);
    expect(result.limitations.join(" ")).toContain("chưa cho phép thanh toán");
  });

  it.each([
    {
      name: "different shop",
      change: (data: ReturnType<typeof checkoutResponse>) => (data.shoporders[0].shop.shopid = 457),
    },
    {
      name: "different model",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        (data.shoporders[0].items[0].modelid = 790),
    },
    {
      name: "different quantity",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        (data.shoporders[0].items[0].quantity = 3),
    },
    {
      name: "extra item",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        data.shoporders[0].items.push({ ...data.shoporders[0].items[0], itemid: 124 }),
    },
    {
      name: "extra shop",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        data.shoporders.push(data.shoporders[0]),
    },
    {
      name: "different shipping identity",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        (data.shipping_orders[0].shipping_id = 2),
    },
    {
      name: "different shop order index",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        (data.shipping_orders[0].shoporder_indexes = [1]),
    },
    {
      name: "extra shipping order",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        data.shipping_orders.push(data.shipping_orders[0]),
    },
    {
      name: "inconsistent totals",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        (data.checkout_price_data.shipping_subtotal = 0),
    },
    {
      name: "fractional VND",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        (data.checkout_price_data.shipping_subtotal = 1),
    },
    {
      name: "missing pricing",
      change: (data: ReturnType<typeof checkoutResponse>) =>
        Reflect.deleteProperty(data, "checkout_price_data"),
    },
  ])("rejects an untrustworthy quote: $name", async ({ change }) => {
    const data = checkoutResponse();
    change(data);
    await expect(
      createCheckoutShippingEstimator(async () => data)(listing, "789", 2),
    ).rejects.toThrow();
  });

  it("propagates request failure without trying cart APIs", async () => {
    const request = vi.fn(async () => {
      throw new Error("Checkout rejected.");
    });
    await expect(createCheckoutShippingEstimator(request)(listing, "789", 2)).rejects.toThrow(
      "Checkout rejected.",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2, 3])(
    "reconciles net prices before fetching vouchers (quantity: %s)",
    async (quantity) => {
      const data = checkoutResponse(2_500_000_000, 500_000_000);
      const expectedTotal = 80_000 * quantity + 20_000 + 2_000;
      const request = vi.fn(async (_path: string, endpoint: string) => {
        if (endpoint.startsWith("get_recommend_"))
          return { data: { shop_vouchers: [], vouchers: [] } };
        if (endpoint !== "checkout_get") throw new Error(`Unexpected request: ${endpoint}`);

        return {
          ...data,
          checkout_price_data: {
            ...data.checkout_price_data,
            total_payable: expectedTotal * 100_000,
          },
          shoporders: [
            {
              ...data.shoporders[0],
              items: [{ ...data.shoporders[0].items[0], quantity, price: 8_000_000_000 }],
            },
          ],
        };
      });
      const result = await createCheckoutShippingEstimator(request)(
        listing,
        "789",
        quantity,
        undefined,
        null,
        { price: 10_000_000_000 },
      );
      expect(request).toHaveBeenCalledTimes(3);
      expect(result.item_unit_price).toEqual({ amount_minor: 80_000, currency: "VND" });
      expect(result.shipping_cost).toEqual({ amount_minor: 20_000, currency: "VND" });
      expect(result.other_fees).toEqual({ amount_minor: 2_000, currency: "VND" });
      expect(result.total_estimated).toBe(true);
      expect(result.limitations.join(" ")).toContain("không cộng dồn voucher");
      const quote: OfferQuote = {
        listing_id: "123",
        variant_id: "789",
        quantity,
        delivery_area: "TP.HCM",
        item_unit_price: result.item_unit_price!,
        shipping_cost: result.shipping_cost,
        other_fees: result.other_fees!,
        discounts: [],
        total: null,
        in_stock: true,
        estimated_delivery_to: null,
        observed_at: new Date().toISOString(),
        sources: [],
      };
      expect(calculateTotal(quote)).toEqual({ amount_minor: expectedTotal, currency: "VND" });
    },
  );

  it("keeps other fees unknown without checkout payable instead of assuming zero", async () => {
    const request = vi.fn(async () => checkoutResponse());
    const result = await createCheckoutShippingEstimator(request)(
      listing,
      "789",
      2,
      undefined,
      null,
      { price: 10_000_000_000 },
    );
    expect(result.other_fees).toBeNull();
    expect(result.limitations.join(" ")).toContain("chưa tính được tổng");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a payable total that cannot be reconciled with net item and shipping prices", async () => {
    const data = checkoutResponse();
    const request = vi.fn(async () => ({
      ...data,
      checkout_price_data: { ...data.checkout_price_data, total_payable: 10_000_000_000 },
    }));
    await expect(
      createCheckoutShippingEstimator(request)(listing, "789", 2, undefined, null, {
        price: 10_000_000_000,
      }),
    ).rejects.toThrow("cannot be reconciled");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not fetch vouchers when shipping is unknown", async () => {
    const data = checkoutResponse();
    data.shipping_orders = [];
    const request = vi.fn(async () => data);
    const result = await createCheckoutShippingEstimator(request)(
      listing,
      "789",
      2,
      undefined,
      null,
      { price: 10_000_000_000 },
    );
    expect(result.shipping_cost).toBeNull();
    expect(result.other_fees).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not send a request after cancellation or with invalid IDs or quantity", async () => {
    const request = vi.fn(async () => checkoutResponse());
    const estimate = createCheckoutShippingEstimator(request);
    await expect(estimate(listing, "789", 2, AbortSignal.abort())).rejects.toThrow();
    await expect(estimate(listing, "invalid", 2)).rejects.toThrow("positive numeric");
    await expect(estimate(listing, "789", 0)).rejects.toThrow("positive numeric");
    expect(request).not.toHaveBeenCalled();
  });

  it("wires model validation and checkout shipping with verified temporary cart cleanup", async () => {
    const paths: string[] = [];
    const cart = cartServer();
    const fetcher: typeof fetch = async (input, init) => {
      const path = new URL(String(input), "https://musk.local").pathname;
      paths.push(path);
      let payload: Record<string, unknown>;
      if (path.endsWith("/get_pc"))
        payload = {
          data: {
            item: {
              item_id: 123,
              shop_id: 456,
              models: [{ model_id: 789, extinfo: { tier_index: [1] } }],
            },
          },
        };
      else if (path.endsWith("/select_variation_pc"))
        payload = {
          data: {
            product_price: {
              price: { single_value: 10_000_000_000 },
              price_model: { price_single_model_id: 789 },
            },
            stock: 5,
            selected_variation: { max_quantity: 5 },
          },
        };
      else if (path.endsWith("/checkout/get")) {
        expect(init?.headers).toEqual({ "content-type": "application/json" });
        expect(JSON.parse(String(init?.body)).shoporders[0].items[0].quantity).toBe(2);
        payload = checkoutResponse();
      } else if (path.includes("/v4/cart/")) {
        const body = JSON.parse(String(init?.body));
        const endpoint = path.endsWith("/get")
          ? "cart_get"
          : path.endsWith("/add_to_cart")
            ? "add_to_cart"
            : "cart_remove";
        payload = await cart.request(path, endpoint, init?.signal ?? undefined, body);
      } else throw new Error(`Unexpected request: ${path}`);

      return new Response(JSON.stringify(payload), { status: 200 });
    };

    const quote = unwrap(
      await createShopeeAdapter(fetcher).getOfferQuote(listing, "789", {
        quantity: 2,
        delivery_area: "TP.HCM",
      }),
    );
    expect(quote.item_unit_price).toEqual({ amount_minor: 100_000, currency: "VND" });
    expect(quote.shipping_cost).toEqual({ amount_minor: 25_000, currency: "VND" });
    expect(quote.shipping_estimated).toBe(true);
    expect(quote.total).toBeNull();
    expect(quote.discounts).toEqual([]);
    expect(quote.sources.map((entry) => entry.field_path)).toContain("quote.shipping_cost");
    expect(paths).toEqual([
      "/shopee-api/v4/pdp/get_pc",
      "/shopee-api/v4/pdp/cart_panel/select_variation_pc",
      "/shopee-api/v4/cart/get",
      "/shopee-api/v4/cart/add_to_cart",
      "/shopee-api/v4/cart/get",
      "/shopee-api/v4/checkout/get",
      "/shopee-api/v4/cart/get",
      "/shopee-api/v4/cart/update",
      "/shopee-api/v4/cart/get",
    ]);
    expect(cart.state()).toEqual([]);
  });
});
