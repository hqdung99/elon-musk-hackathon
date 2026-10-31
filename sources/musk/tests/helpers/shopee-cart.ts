import { vi } from "vitest";
import type { ShopeeRequest } from "../../src/providers/shopee-shipping";

export function cartItem(itemid = 123, modelid = 789, quantity = 1) {
  return {
    itemid,
    modelid,
    shopid: 456,
    quantity,
    item_group_id: null as string | number | null,
    checkout: true,
    price: 10_000_000_000,
    add_on_deal_id: 0,
    is_add_on_sub_item: false,
    applied_promotion_id: 0 as number | null,
  };
}

type Item = ReturnType<typeof cartItem>;

export function cartServer(
  options: {
    existing?: Item[];
    lostAdd?: boolean;
    failRemove?: boolean;
    partial?: boolean;
    afterAdd?: (item: Item, items: Item[]) => void;
  } = {},
) {
  let state = structuredClone(options.existing ?? []);
  const request = vi.fn<ShopeeRequest>(async (_path, endpoint, signal, body) => {
    signal?.throwIfAborted();
    if (endpoint === "cart_get") {
      const shops = new Map<number, Item[]>();
      for (const item of state) {
        const group = shops.get(item.shopid) ?? [];
        group.push(item);
        shops.set(item.shopid, group);
      }

      if (!shops.size) shops.set(456, []);

      return {
        data: {
          cart_state: { session_id: "test-cart" },
          cart_block_id_list: [...shops].map(([shopid, group]) => ({
            block_id: shopid,
            block_type: 0,
            last_updated_time: 1,
            item_briefs: [
              ...group.map((item) => ({ itemid: item.itemid })),
              ...(options.partial ? [{}] : []),
            ],
          })),
          cart_blocks: [...shops].map(([shopid, group]) => ({
            block_id: shopid,
            items: structuredClone(group),
          })),
        },
      };
    }

    if (endpoint === "add_to_cart") {
      const item = {
        ...cartItem(Number(body?.itemid), Number(body?.modelid), Number(body?.quantity)),
        shopid: Number(body?.shopid),
      };
      state.push(item);
      options.afterAdd?.(item, state);
      if (options.lostAdd) throw new Error("Connection lost after adding.");

      return { data: { cart_item: { ...item, item_group_id: 0 } } };
    }

    if (endpoint === "cart_remove") {
      if (options.failRemove) throw new Error("Removal rejected.");
      const orders = body?.updated_shop_order_ids;
      if (!Array.isArray(orders)) throw new Error("Missing removal lines.");
      for (const order of orders)
        for (const target of order.item_briefs)
          state = state.filter(
            (item) =>
              !(
                item.itemid === target.itemid &&
                item.modelid === target.modelid &&
                item.shopid === target.shopid &&
                item.item_group_id === target.item_group_id
              ),
          );

      return { data: {} };
    }

    throw new Error(`Unexpected operation: ${endpoint}`);
  });

  return { request, state: () => structuredClone(state) };
}
