import { z } from "zod";
import type { Listing, Money, OfferQuote } from "../domain/schemas";
import { getBestVoucher } from "./shopee-vouchers";

export type ShopeeRequest = (
  path: string,
  endpoint: string,
  signal?: AbortSignal,
  body?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const id = z.union([z.number().int().nonnegative().safe(), z.string().min(1)]);
const rawFee = z
  .number()
  .int()
  .nonnegative()
  .safe()
  .refine((value) => value % 100_000 === 0, "Shipping fee must be whole VND.");
const checkoutSchema = z.object({
  can_checkout: z.boolean().optional(),
  checkout_price_data: z.object({
    total_payable: rawFee.optional(),
    shipping_subtotal_before_discount: rawFee,
    shipping_discount_subtotal: rawFee,
    shipping_subtotal: rawFee,
  }),
  shoporders: z.array(
    z.object({
      shop: z.object({ shopid: id }),
      shipping_id: id.nullable().optional(),
      items: z.array(
        z.object({
          itemid: id,
          modelid: id,
          quantity: z.number().int().positive(),
          price: rawFee.optional(),
        }),
      ),
    }),
  ),
  shipping_orders: z.array(
    z.object({
      shipping_id: id,
      shoporder_indexes: z.array(z.number().int().nonnegative()),
      selected_logistic_channelid: id.nullable().optional(),
      shipping_fee: rawFee,
      shipping_fee_discount: rawFee,
    }),
  ),
});

export interface ShippingEstimate {
  shipping_cost: Money | null;
  limitations: string[];
  item_unit_price?: Money;
  other_fees?: Money | null;
  total_estimated?: boolean;
  discounts?: OfferQuote["discounts"];
}

export function createCheckoutShippingEstimator(request: ShopeeRequest) {
  return async (
    listing: Listing,
    variantId: string,
    quantity: number,
    signal?: AbortSignal,
    groupId: string | number | null = null,
    cartItem?: Record<string, unknown>,
  ): Promise<ShippingEstimate> => {
    signal?.throwIfAborted();
    const [shopid, itemid, modelid] = [listing.seller_id, listing.listing_id, variantId].map(
      Number,
    );
    if (
      [shopid, itemid, modelid, quantity].some(
        (value) => !Number.isSafeInteger(value) || value <= 0,
      )
    )
      throw new Error("Shopee shipping requires positive numeric IDs and quantity.");
    const response = await request("v4/checkout/get", "checkout_get", signal, {
      checkout_session_id: crypto.randomUUID(),
      shoporders: [
        {
          shop: { shopid },
          items: [
            {
              itemid,
              modelid,
              quantity,
              add_on_deal_id: 0,
              is_add_on_sub_item: false,
              item_group_id: groupId,
              insurances: [],
              insurance_vas_display: { need_regenerate_display: true },
            },
          ],
        },
      ],
      selected_payment_channel_data: {},
      promotion_data: {
        use_coins: false,
        free_shipping_voucher_info: { free_shipping_voucher_id: 0 },
        platform_vouchers: [],
        shop_vouchers: [],
        ads_vouchers: [],
        check_shop_voucher_entrances: false,
        auto_apply_platform_voucher: false,
        auto_apply_shop_voucher: false,
        shop_voucher_selection_type: 0,
        platform_voucher_selection_type: 0,
        fsv_selection_type: 0,
        should_auto_update_platform_vouchers: false,
        should_auto_update_shop_vouchers: false,
      },
      device_info: {
        device_id: "",
        device_fingerprint: "",
        tongdun_blackbox: "",
        buyer_payment_info: {},
        timezone_offset_in_minutes: -new Date().getTimezoneOffset(),
      },
      tax_info: { tax_id: "" },
    });
    signal?.throwIfAborted();
    const data = checkoutSchema.parse(response.data === undefined ? response : response.data);
    const shop = data.shoporders[0];
    const item = shop?.items[0];
    if (
      data.shoporders.length !== 1 ||
      String(shop.shop.shopid) !== listing.seller_id ||
      shop.items.length !== 1 ||
      String(item.itemid) !== listing.listing_id ||
      String(item.modelid) !== variantId ||
      item.quantity !== quantity
    )
      throw new Error("Shopee shipping quote includes other items or a different quantity.");
    const limitations = [
      "Phí ship là ước tính cho địa chỉ lưu trên tài khoản Shopee, không phải khu vực đã nhập.",
      "Tổng ước tính trừ một voucher tiền mặt đủ điều kiện có mức giảm lớn nhất; không cộng dồn voucher. Kiểm tra và chọn mã trên Shopee khi thanh toán.",
      ...(cartItem ? [] : ["Chưa xác nhận phí khác; tổng thanh toán vẫn chưa rõ."]),
      ...(data.can_checkout === false
        ? [
            "Shopee chưa cho phép thanh toán phiên báo giá này; phí ship không xác nhận khả năng đặt hàng.",
          ]
        : []),
    ];
    if (data.shipping_orders.length === 0)
      return finish({
        shipping_cost: null,
        limitations: [
          ...limitations,
          "Shopee chưa trả đơn giao hàng cho sản phẩm; phí ship chưa rõ, không coi giá trị 0 là miễn phí.",
        ],
      });
    const shipping = data.shipping_orders[0];
    if (
      data.shipping_orders.length !== 1 ||
      String(shipping.shipping_id) !== String(shop.shipping_id) ||
      shipping.shoporder_indexes.length !== 1 ||
      shipping.shoporder_indexes[0] !== 0
    )
      throw new Error("Shopee shipping order does not match the requested shop order.");
    if (
      shipping.selected_logistic_channelid == null ||
      Number(shipping.selected_logistic_channelid) <= 0 ||
      !Number.isSafeInteger(Number(shipping.selected_logistic_channelid))
    )
      return finish({
        shipping_cost: null,
        limitations: [
          ...limitations,
          "Shopee chưa xác nhận phương thức giao hàng; phí ship chưa rõ.",
        ],
      });
    const price = data.checkout_price_data;
    if (
      price.shipping_subtotal_before_discount !== shipping.shipping_fee ||
      price.shipping_discount_subtotal !== shipping.shipping_fee_discount ||
      price.shipping_subtotal !== shipping.shipping_fee - shipping.shipping_fee_discount
    )
      throw new Error("Shopee checkout shipping totals do not match the shipping order.");

    return finish({
      shipping_cost: { amount_minor: price.shipping_subtotal / 100_000, currency: "VND" },
      limitations,
    });

    async function finish(estimate: ShippingEstimate): Promise<ShippingEstimate> {
      if (!cartItem) return estimate;
      const unitPrice = item.price ?? rawFee.parse(cartItem.price);
      const itemSubtotal = (unitPrice / 100_000) * quantity;
      if (!Number.isSafeInteger(itemSubtotal))
        throw new Error("Shopee item subtotal exceeds safe money precision.");
      const shippingMinor = estimate.shipping_cost?.amount_minor ?? null;
      const total = data.checkout_price_data.total_payable;
      const fees =
        total === undefined || shippingMinor === null
          ? null
          : total / 100_000 - itemSubtotal - shippingMinor;
      if (fees !== null && (!Number.isSafeInteger(fees) || fees < 0))
        throw new Error(
          "Shopee checkout total cannot be reconciled with item and shipping prices.",
        );

      // Reconcile the checkout with vouchers explicitly disabled first. Subtract
      // the selected order-specific benefit once through calculateTotal.
      const discounts =
        fees === null
          ? []
          : await getBestVoucher(
              request,
              { ...cartItem, shopid, itemid, modelid, quantity, price: unitPrice },
              itemSubtotal,
              signal,
            );

      return {
        ...estimate,
        item_unit_price: { amount_minor: unitPrice / 100_000, currency: "VND" },
        other_fees: fees === null ? null : { amount_minor: fees, currency: "VND" },
        total_estimated: true,
        discounts,
        limitations: [
          ...estimate.limitations,
          ...(fees === null
            ? ["Shopee chưa trả đủ dữ liệu để đối chiếu phí khác; chưa tính được tổng."]
            : []),
        ],
      };
    }
  };
}
