import { z } from "zod";
import type { OfferQuote } from "../domain/schemas";
import type { ShopeeRequest } from "./shopee-shipping";

const voucherSchema = z
  .object({
    promotionid: z.number().int().positive().safe(),
    voucher_code: z.string().min(1),
  })
  .passthrough();

// Recommendation responses contain invalid vouchers too. Never infer eligibility
// from their position in the response or their advertised discount alone.
export function bestVoucher(
  vouchers: { value: unknown; shop: boolean }[],
  shopid: number,
  subtotal: number,
  quantity: number,
  now = Date.now() / 1000,
): OfferQuote["discounts"] {
  let best: OfferQuote["discounts"][number] | undefined;
  for (const entry of vouchers) {
    const parsed = voucherSchema.safeParse(entry.value);
    if (!parsed.success) continue;
    const v = parsed.data;
    const number = (key: string) =>
      typeof v[key] === "number" && Number.isFinite(v[key]) ? (v[key] as number) : null;
    if (
      v.reward_type !== 0 ||
      v.invalid_message_code !== 0 ||
      v.is_applicable === false ||
      ["disabled", "has_expired", "fully_used", "fully_redeemed"].some((key) => v[key] === true) ||
      ["error_code", "reason_code", "external_error_code"].some(
        (key) => v[key] != null && v[key] !== 0,
      ) ||
      ["error_message", "external_error_msg"].some(
        (key) => typeof v[key] === "string" && v[key] !== "",
      ) ||
      v.is_claimed_before !== true ||
      v.shopee_wallet_only === true ||
      v.payment_rule != null ||
      (entry.shop && String(v.shop_id) !== String(shopid)) ||
      number("start_time") === null ||
      number("start_time")! > now ||
      number("end_time") === null ||
      number("end_time")! <= now ||
      number("min_spend") === null ||
      number("min_spend")! > subtotal * 100_000 ||
      (number("remaining_usage_limit") !== null && number("remaining_usage_limit")! <= 0) ||
      (number("min_item_quantity") ?? 0) > quantity ||
      (v.product_limit === true && v.is_applicable !== true)
    )
      continue;
    // used_price is the API's order-specific monetary benefit, in Shopee units.
    // This avoids treating coins, advertised percentage caps, or shipping as cash.
    let raw = number("used_price");
    if ((raw === null || raw === 0) && v.is_applicable === true) {
      const spend = number("current_spend") ?? subtotal * 100_000;
      const percent = number("discount_percentage") ?? 0;
      const cap = number("discount_cap") ?? 0;
      if (spend >= 0 && spend <= subtotal * 100_000 && percent >= 0 && percent <= 100) {
        raw =
          percent > 0
            ? Math.floor(Math.min((spend * percent) / 100, cap > 0 ? cap : Infinity) / 100_000) *
              100_000
            : number("discount_value");
      }
    }

    if (raw === null || !Number.isSafeInteger(raw) || raw <= 0 || raw % 100_000 !== 0) continue;
    const amount = Math.min(raw / 100_000, subtotal);
    if (!Number.isSafeInteger(amount) || (best?.amount?.amount_minor ?? 0) >= amount) continue;
    best = {
      discount_id: `${entry.shop ? "shop" : "platform"}:${v.promotionid}`,
      description: `Voucher ${entry.shop ? "shop" : "Shopee"} ${v.voucher_code}`,
      amount: { amount_minor: amount, currency: "VND" },
      eligible: true,
      applied: true,
    };
  }

  return best ? [best] : [];
}

export async function getBestVoucher(
  request: ShopeeRequest,
  cartItem: Record<string, unknown>,
  subtotal: number,
  signal?: AbortSignal,
): Promise<OfferQuote["discounts"]> {
  const shopid = Number(cartItem.shopid);
  const orders = JSON.stringify([
    {
      shopid,
      block_id: String(shopid),
      block_type: 0,
      iteminfos: [cartItem],
      unselected_iteminfos: [],
      has_valid_item: true,
      shop_vouchers: [],
      ads_vouchers: [],
      auto_apply: false,
    },
  ]);
  const common = {
    orders,
    check_voucher_payment_criteria: true,
    sorting_flag: 8,
    priority_promotion_ids: [],
    has_redeem_coins: false,
    caller_source: 2,
  };
  const results = await Promise.allSettled([
    request(
      "v2/voucher_wallet/get_recommend_shop_vouchers",
      "get_recommend_shop_vouchers",
      signal,
      {
        ...common,
        shopid,
        shop_ids: [shopid],
        platform_vouchers: [],
        move_up_addon_voucher: false,
        cursor: null,
      },
    ),
    request(
      "v2/voucher_wallet/get_recommend_platform_vouchers",
      "get_recommend_platform_vouchers",
      signal,
      {
        ...common,
        voucher_market_type: 1,
        need_wallet_active_info: true,
        higher_bpsf_logistics_channel: false,
      },
    ),
  ]);
  signal?.throwIfAborted();
  const candidates = results.flatMap((result, index) => {
    if (result.status === "rejected") throw result.reason;
    const key = index === 0 ? "shop_vouchers" : "vouchers";
    const data = z.record(z.string(), z.unknown()).parse(result.value.data);

    return z
      .array(z.unknown())
      .parse(data[key] === null ? [] : data[key])
      .map((value) => ({ value, shop: index === 0 }));
  });

  return bestVoucher(candidates, shopid, subtotal, Number(cartItem.quantity));
}
