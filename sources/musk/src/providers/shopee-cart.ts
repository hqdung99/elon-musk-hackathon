import { z } from "zod";
import type { Listing } from "../domain/schemas";
import type { ShippingEstimate, ShopeeRequest } from "./shopee-shipping";

const id = z.union([z.number().int().nonnegative().safe(), z.string().min(1)]);
const itemSchema = z
  .object({
    shopid: id,
    itemid: id,
    modelid: id,
    item_group_id: id.nullable(),
    quantity: z.number().int().positive(),
    checkout: z.boolean(),
    price: z.number().nullable(),
    add_on_deal_id: id,
    is_add_on_sub_item: z.boolean(),
    applied_promotion_id: id.nullable(),
  })
  .passthrough();
const cartSchema = z.object({
  cart_state: z.record(z.string(), z.unknown()),
  cart_block_id_list: z.array(
    z
      .object({
        block_id: id,
        block_type: z.number(),
        item_briefs: z.array(z.unknown()),
        last_updated_time: z.number(),
      })
      .passthrough(),
  ),
  cart_blocks: z.array(z.object({ block_id: id, items: z.array(itemSchema) })),
});
type Cart = z.infer<typeof cartSchema>;
type Item = z.infer<typeof itemSchema>;
type GroupId = Item["item_group_id"];
type Quote = (
  listing: Listing,
  variantId: string,
  quantity: number,
  signal?: AbortSignal,
  groupId?: GroupId,
  cartItem?: Record<string, unknown>,
) => Promise<ShippingEstimate>;

const versions = [3787143115, 1023];
const items = (cart: Cart) => cart.cart_blocks.flatMap((block) => block.items);
const key = (item: Pick<Item, "shopid" | "itemid" | "modelid">) =>
  `${item.shopid}:${item.itemid}:${item.modelid}`;
const text = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class CartCleanupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartCleanupError";
  }
}

export function createShopeeCart(request: ShopeeRequest, quote: Quote) {
  let queue: Promise<void> = Promise.resolve();
  let cleanupFailure: CartCleanupError | undefined;

  async function getCart(signal?: AbortSignal): Promise<Cart> {
    const response = await request("v4/cart/get", "cart_get", signal, {
      pre_selected_item_list: [],
      updated_time_filter: { start_time: 0 },
      cart_state: {
        similar_cheaper_cart_items: null,
        is_subsequent_load: false,
        session_id: crypto.randomUUID(),
        shipping_orders: [],
        shipment_group_infos: [],
        order_id: null,
        initial_session_timestamp: Math.floor(Date.now() / 1000),
        block_ids_with_threshold_hit: null,
        teleconsult_order_id: null,
        bds_with_smart_bundle: [],
      },
      version_list: versions,
    });
    const cart = cartSchema.parse(response.data);
    const blockIds = new Set<string>();
    for (const info of cart.cart_block_id_list) {
      const blocks = cart.cart_blocks.filter(
        (block) => String(block.block_id) === String(info.block_id),
      );
      if (
        blockIds.has(String(info.block_id)) ||
        blocks.length !== 1 ||
        blocks[0].items.length !== info.item_briefs.length
      )
        throw new Error("Shopee cart is only partially loaded; refusing to change it.");
      blockIds.add(String(info.block_id));
    }

    if (cart.cart_blocks.length !== blockIds.size)
      throw new Error("Shopee cart has unexpected blocks; refusing to change it.");

    return cart;
  }

  async function clearCart(cart: Cart, signal?: AbortSignal): Promise<void> {
    if (!items(cart).length) return;
    const orders = new Map<
      string,
      { shopid: Item["shopid"]; item_briefs: Record<string, unknown>[] }
    >();
    for (const item of items(cart)) {
      const shopKey = String(item.shopid);
      let order = orders.get(shopKey);
      if (!order) {
        order = { shopid: item.shopid, item_briefs: [] };
        orders.set(shopKey, order);
      }

      order.item_briefs.push({
        ...item,
        old_modelid: null,
        old_quantity: item.quantity,
        checkout: true,
      });
    }

    await request("v4/cart/update", "cart_remove", signal, {
      action_type: 2,
      promotion_data: {
        use_coins: false,
        platform_vouchers: [],
        free_shipping_voucher_info: null,
        auto_apply_platform_voucher: false,
        add_on_deal_data_list: [],
      },
      updated_shop_order_ids: [...orders.values()],
      selected_shop_order_ids: [],
      cart_state: cart.cart_state,
      shop_order_id_list: cart.cart_block_id_list,
      version_list: versions,
    });
    if (items(await getCart(signal)).length)
      throw new Error(
        "Shopee cart is not empty after clearing; refusing to process another option.",
      );
  }

  async function withCartItem<T>(
    listing: Listing,
    variantId: string,
    quantity: number,
    signal: AbortSignal | undefined,
    operation: (group: GroupId, item: Item) => Promise<T>,
    retain = false,
    reuse?: () => T,
  ): Promise<T> {
    if (cleanupFailure) throw cleanupFailure;
    signal?.throwIfAborted();
    const [shopid, itemid, modelid] = [listing.seller_id, listing.listing_id, variantId].map(
      Number,
    );
    if (
      [shopid, itemid, modelid, quantity].some(
        (value) => !Number.isSafeInteger(value) || value <= 0,
      )
    )
      throw new Error("Shopee cart requires positive numeric IDs and quantity.");
    const targetKey = `${listing.seller_id}:${listing.listing_id}:${variantId}`;
    const before = await getCart(signal);
    signal?.throwIfAborted();
    const previous = items(before);
    if (
      retain &&
      reuse &&
      previous.length === 1 &&
      key(previous[0]) === targetKey &&
      previous[0].quantity === quantity
    )
      return reuse();

    let originalFailure: unknown;
    let failed = false;
    let committed = false;
    let mutationAttempted = false;
    try {
      if (previous.length) {
        mutationAttempted = true;
        await clearCart(before, signal);
      }

      signal?.throwIfAborted();
      // A lost add response can still mean the cart changed; always run cleanup.
      mutationAttempted = true;
      const added = await request("v4/cart/add_to_cart", "add_to_cart", signal, {
        quantity,
        checkout: true,
        update_checkout_only: false,
        donot_add_quantity: false,
        source: JSON.stringify({ refer_urls: [] }),
        client_source: 1,
        shopid,
        itemid,
        modelid,
        cart_client_id: 1,
      });
      const acknowledgement = z
        .object({
          data: z.object({ cart_item: z.object({ itemid: id, modelid: id }) }),
        })
        .parse(added).data.cart_item;
      if (
        String(acknowledgement.itemid) !== listing.listing_id ||
        String(acknowledgement.modelid) !== variantId
      )
        throw new Error("Shopee added a different cart item than requested.");
      const cart = await getCart(signal);
      const targets = items(cart).filter((item) => key(item) === targetKey);
      const target = targets[0];
      if (items(cart).length !== 1 || targets.length !== 1 || target.quantity !== quantity)
        throw new Error("Shopee workspace must contain only the requested SKU and quantity.");

      const result = await operation(target.item_group_id, target);
      signal?.throwIfAborted();
      committed = retain;

      return result;
    } catch (error) {
      failed = true;
      originalFailure = error;
      throw error;
    } finally {
      if (mutationAttempted && !committed) await clearWorkspace();
    }

    async function clearWorkspace() {
      const cleanupSignal = AbortSignal.timeout(30_000);
      try {
        const current = await getCart(cleanupSignal);
        await clearCart(current, cleanupSignal);
      } catch (error) {
        cleanupFailure = new CartCleanupError(
          "Shopee cart cleanup failed; processing stopped. Empty the cart and reload Musk before retrying. Previous contents are not restored. " +
            text(error) +
            (failed ? ` Original request failed: ${text(originalFailure)}` : ""),
        );
        throw cleanupFailure;
      }
    }
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = queue.then(operation);
    queue = pending.then(
      () => undefined,
      () => undefined,
    );

    return pending;
  }

  return {
    estimateShipping(
      listing: Listing,
      variantId: string,
      quantity: number,
      signal?: AbortSignal,
    ): Promise<ShippingEstimate> {
      return serialize(() =>
        withCartItem<ShippingEstimate>(listing, variantId, quantity, signal, (group, item) =>
          quote(listing, variantId, quantity, signal, group, item),
        ),
      );
    },
    prepareCheckout(
      listing: Listing,
      variantId: string,
      quantity: number,
      signal?: AbortSignal,
    ): Promise<{ added: boolean }> {
      return serialize(() =>
        withCartItem<{ added: boolean }>(
          listing,
          variantId,
          quantity,
          signal,
          async () => ({ added: true }),
          true,
          () => ({ added: false }),
        ),
      );
    },
  };
}

export function createCartCheckoutEstimator(request: ShopeeRequest, quote: Quote): Quote {
  return createShopeeCart(request, quote).estimateShipping;
}
