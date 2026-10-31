import { describe, expect, it, vi } from "vitest";
import { bestVoucher, getBestVoucher } from "../src/providers/shopee-vouchers";
import { calculateTotal } from "../src/domain/requirements";
import { createCheckoutShippingEstimator } from "../src/providers/shopee-shipping";
import type { ShopeeRequest } from "../src/providers/shopee-shipping";

const voucher = {
  promotionid: 123,
  voucher_code: "SAVE",
  reward_type: 0,
  invalid_message_code: 0,
  is_claimed_before: true,
  start_time: 1,
  end_time: 4_000_000_000,
  min_spend: 0,
  shop_id: 456,
  used_price: 1_000_000_000,
};

describe("voucher pricing", () => {
  it("accepts null voucher lists returned by live Shopee", async () => {
    const request: ShopeeRequest = async () => ({
      data: { shop_vouchers: null, vouchers: null },
    });
    await expect(getBestVoucher(request, { shopid: 456, quantity: 1 }, 100_000)).resolves.toEqual(
      [],
    );
  });

  it("selects the greatest eligible cash benefit without stacking", () => {
    const discounts = bestVoucher(
      [
        { value: voucher, shop: true },
        { value: { ...voucher, promotionid: 124, used_price: 2_000_000_000 }, shop: false },
        { value: { ...voucher, used_price: 9_000_000_000, invalid_message_code: 7 }, shop: false },
      ],
      456,
      100_000,
      1,
    );
    expect(discounts).toHaveLength(1);
    expect(discounts[0].amount?.amount_minor).toBe(20_000);
  });

  it.each([
    { has_expired: true },
    { end_time: 2 },
    { start_time: 5_000_000_000 },
    { min_spend: 20_000_000_000 },
    { min_item_quantity: 2 },
    { shop_id: 777 },
    { is_applicable: false },
    { remaining_usage_limit: 0 },
    { reward_type: 1 },
    { reward_type: 2 },
    { disabled: true },
    { product_limit: true },
    { payment_rule: {} },
    { shopee_wallet_only: true },
    { is_claimed_before: false },
    { used_price: null },
    { used_price: 123 },
  ])("rejects ineligible or unverified vouchers: %j", (override) => {
    expect(
      bestVoucher([{ value: { ...voucher, ...override }, shop: true }], 456, 100_000, 1),
    ).toEqual([]);
  });

  it("calculates a confirmed percentage discount with its cap", () => {
    expect(
      bestVoucher(
        [
          {
            value: {
              ...voucher,
              used_price: 0,
              is_applicable: true,
              discount_percentage: 20,
              discount_cap: 1_500_000_000,
            },
            shop: false,
          },
        ],
        456,
        100_000,
        1,
      )[0].amount?.amount_minor,
    ).toBe(15_000);
  });

  it("fails explicitly when a voucher API fails", async () => {
    const request: ShopeeRequest = async () => {
      throw new Error("Voucher unavailable");
    };

    await expect(getBestVoucher(request, { shopid: 456, quantity: 1 }, 100_000)).rejects.toThrow(
      "Voucher unavailable",
    );
  });

  it("subtracts the selected voucher once after checkout reconciliation", async () => {
    const request = vi.fn<ShopeeRequest>(async (_path, endpoint, _signal, body) => {
      if (endpoint.startsWith("get_recommend_")) {
        expect(JSON.parse(String(body?.orders))[0].iteminfos[0]).toMatchObject({
          shopid: 456,
          itemid: 123,
          modelid: 789,
          quantity: 1,
        });
        expect(body?.check_voucher_payment_criteria).toBe(true);

        return { data: { shop_vouchers: [voucher], vouchers: [] } };
      }

      return {
        data: {
          checkout_price_data: {
            total_payable: 12_000_000_000,
            shipping_subtotal_before_discount: 2_000_000_000,
            shipping_discount_subtotal: 0,
            shipping_subtotal: 2_000_000_000,
          },
          shoporders: [
            {
              shop: { shopid: 456 },
              shipping_id: 1,
              items: [{ itemid: 123, modelid: 789, quantity: 1, price: 10_000_000_000 }],
            },
          ],
          shipping_orders: [
            {
              shipping_id: 1,
              shoporder_indexes: [0],
              selected_logistic_channelid: 5,
              shipping_fee: 2_000_000_000,
              shipping_fee_discount: 0,
            },
          ],
        },
      };
    });
    const result = await createCheckoutShippingEstimator(request)(
      {
        listing_id: "123",
        seller_id: "456",
        title: "Test",
        url: "https://shopee.vn/product/456/123",
      },
      "789",
      1,
      undefined,
      null,
      { price: 10_000_000_000 },
    );
    expect(
      calculateTotal({
        listing_id: "123",
        variant_id: "789",
        quantity: 1,
        delivery_area: null,
        item_unit_price: result.item_unit_price!,
        shipping_cost: result.shipping_cost,
        other_fees: result.other_fees!,
        discounts: result.discounts!,
        total: null,
        in_stock: true,
        estimated_delivery_to: null,
        observed_at: new Date().toISOString(),
        sources: [],
      }),
    ).toEqual({ amount_minor: 110_000, currency: "VND" });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
