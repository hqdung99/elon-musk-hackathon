import { describe, expect, it, vi } from "vitest";
import { createCartCheckoutEstimator, createShopeeCart } from "../src/providers/shopee-cart";
import { cartItem, cartServer } from "./helpers/shopee-cart";

const listing = {
  listing_id: "123",
  seller_id: "456",
  title: "Test",
  url: "https://shopee.vn/product/456/123",
};
const shipping = { shipping_cost: { amount_minor: 25_000, currency: "VND" }, limitations: [] };

describe("temporary cart checkout quoting", () => {
  it("clears every shop and group, quotes only the requested SKU, and verifies an empty cart", async () => {
    const original = [
      { ...cartItem(100, 200, 3), checkout: false, applied_promotion_id: null },
      { ...cartItem(101, 201), shopid: 999, item_group_id: "promotion" },
      cartItem(123, 789, 4),
      { ...cartItem(), item_group_id: "duplicate" },
    ];
    const cart = cartServer({ existing: original });
    const quote = vi.fn(async () => {
      expect(cart.state()).toEqual([cartItem(123, 789, 2)]);

      return shipping;
    });
    const result = await createCartCheckoutEstimator(cart.request, quote)(listing, "789", 2);
    expect(result).toEqual(shipping);
    expect(quote).toHaveBeenCalledExactlyOnceWith(
      listing,
      "789",
      2,
      undefined,
      null,
      expect.objectContaining({ itemid: 123, quantity: 2 }),
    );
    expect(cart.state()).toEqual([]);
    expect(cart.request.mock.calls.map((call) => call[1])).toEqual([
      "cart_get",
      "cart_remove",
      "cart_get",
      "add_to_cart",
      "cart_get",
      "cart_get",
      "cart_remove",
      "cart_get",
    ]);
    expect(cart.request.mock.calls.find((call) => call[1] === "cart_remove")?.[3]).toMatchObject({
      action_type: 2,
      selected_shop_order_ids: [],
      updated_shop_order_ids: [
        {
          shopid: 456,
          item_briefs: [
            {
              itemid: 100,
              old_quantity: 3,
              checkout: true,
              item_group_id: null,
              applied_promotion_id: null,
            },
            { itemid: 123, old_quantity: 4, item_group_id: null },
            { itemid: 123, old_quantity: 1, item_group_id: "duplicate" },
          ],
        },
        {
          shopid: 999,
          item_briefs: [{ itemid: 101, old_quantity: 1, item_group_id: "promotion" }],
        },
      ],
    });
    expect(
      cart.request.mock.calls.filter((call) => call[1] === "cart_remove").at(-1)?.[3],
    ).toMatchObject({
      updated_shop_order_ids: [
        { shopid: 456, item_briefs: [{ itemid: 123, quantity: 2, item_group_id: null }] },
      ],
    });
  });

  it("preserves null promotion metadata while quoting and removing a candidate", async () => {
    const server = cartServer({
      afterAdd: (item) => {
        item.applied_promotion_id = null;
      },
    });
    const quote = vi.fn(async () => shipping);
    await expect(
      createCartCheckoutEstimator(server.request, quote)(listing, "789", 1),
    ).resolves.toEqual(shipping);
    expect(quote).toHaveBeenCalledExactlyOnceWith(
      listing,
      "789",
      1,
      undefined,
      null,
      expect.objectContaining({ applied_promotion_id: null }),
    );
    expect(server.state()).toEqual([]);
    expect(server.request.mock.calls.find((call) => call[1] === "cart_remove")?.[3]).toMatchObject({
      updated_shop_order_ids: [{ item_briefs: [{ itemid: 123, applied_promotion_id: null }] }],
    });
  });

  describe("approved cart handoff", () => {
    it("retains only the exact approved SKU and quantity, and is safe to retry", async () => {
      const original = { ...cartItem(100, 200, 3), checkout: false };
      const server = cartServer({ existing: [original] });
      const quote = vi.fn(async () => shipping);
      const cart = createShopeeCart(server.request, quote);
      expect(await cart.prepareCheckout(listing, "789", 2)).toEqual({ added: true });
      expect(server.state()).toEqual([cartItem(123, 789, 2)]);
      expect(server.request.mock.calls.map((call) => call[1])).toEqual([
        "cart_get",
        "cart_remove",
        "cart_get",
        "add_to_cart",
        "cart_get",
      ]);
      expect(await cart.prepareCheckout(listing, "789", 2)).toEqual({ added: false });
      expect(server.state()).toEqual([cartItem(123, 789, 2)]);
      expect(quote).not.toHaveBeenCalled();
      expect(server.request.mock.calls.filter((call) => call[1] === "add_to_cart")).toHaveLength(1);
    });

    it("reuses the cart only when it already contains just the approved SKU and quantity", async () => {
      const original = { ...cartItem(123, 789, 2), checkout: false };
      const server = cartServer({ existing: [original] });
      const cart = createShopeeCart(server.request, async () => shipping);
      expect(await cart.prepareCheckout(listing, "789", 2)).toEqual({ added: false });
      expect(server.state()).toEqual([original]);
      expect(server.request).toHaveBeenCalledOnce();
    });

    it.each(["quantity", "duplicates", "other_items"])(
      "clears and replaces conflicting cart contents before handoff: %s",
      async (conflict) => {
        const original = cartItem();
        const existing =
          conflict === "duplicates"
            ? [original, { ...original, item_group_id: "other" }]
            : conflict === "other_items"
              ? [cartItem(123, 789, 2), cartItem(100, 200)]
              : [original];
        const server = cartServer({ existing });
        const cart = createShopeeCart(server.request, async () => shipping);
        await expect(cart.prepareCheckout(listing, "789", 2)).resolves.toEqual({ added: true });
        expect(server.state()).toEqual([cartItem(123, 789, 2)]);
      },
    );

    it.each(["lost_add", "cancellation", "cancel_after_verification"])(
      "leaves an empty cart without restoring old contents when handoff fails: %s",
      async (failure) => {
        const original = cartItem(100, 200, 3);
        const controller = new AbortController();
        const server = cartServer({
          existing: [original],
          lostAdd: failure === "lost_add",
          afterAdd: failure === "cancellation" ? () => controller.abort() : undefined,
        });
        let reads = 0;
        const cart = createShopeeCart(
          async (...args) => {
            const response = await server.request(...args);
            if (args[1] === "cart_get" && ++reads === 3 && failure === "cancel_after_verification")
              controller.abort();

            return response;
          },
          async () => shipping,
        );
        await expect(cart.prepareCheckout(listing, "789", 1, controller.signal)).rejects.toThrow();
        expect(server.state()).toEqual([]);
        expect(server.request.mock.calls.some((call) => call[1] === "cart_remove")).toBe(true);
      },
    );

    it("refuses handoff if an unrelated item appears and clears the workspace", async () => {
      const server = cartServer({
        existing: [cartItem(100, 200, 3)],
        afterAdd: (_item, items) => {
          items.push(cartItem(101, 201));
        },
      });
      const cart = createShopeeCart(server.request, async () => shipping);
      await expect(cart.prepareCheckout(listing, "789", 1)).rejects.toThrow(
        "only the requested SKU",
      );
      expect(server.state()).toEqual([]);
    });

    it("serializes handoff after quote cleanup and shares cleanup-failure protection", async () => {
      const server = cartServer();
      const cart = createShopeeCart(server.request, async () => shipping);
      await Promise.all([
        cart.estimateShipping(listing, "789", 1),
        cart.prepareCheckout(listing, "789", 2),
      ]);
      expect(server.state()).toEqual([cartItem(123, 789, 2)]);
      const operations = server.request.mock.calls.map((call) => call[1]);
      expect(operations.lastIndexOf("add_to_cart")).toBeGreaterThan(
        operations.indexOf("cart_remove"),
      );

      const broken = cartServer({ failRemove: true });
      const blocked = createShopeeCart(broken.request, async () => shipping);
      await expect(blocked.estimateShipping(listing, "789", 1)).rejects.toThrow("cleanup failed");
      const calls = broken.request.mock.calls.length;
      await expect(blocked.prepareCheckout(listing, "789", 1)).rejects.toThrow("cleanup failed");
      expect(broken.request).toHaveBeenCalledTimes(calls);
    });
  });

  it("replaces a pre-existing matching SKU with a fresh line at the requested quantity", async () => {
    const original = { ...cartItem(), checkout: false, item_group_id: "existing-group" };
    const cart = cartServer({ existing: [original] });
    const quote = vi.fn(async () => shipping);
    const result = await createCartCheckoutEstimator(cart.request, quote)(listing, "789", 2);
    expect(result).toEqual(shipping);
    expect(quote).toHaveBeenCalledExactlyOnceWith(
      listing,
      "789",
      2,
      undefined,
      null,
      cartItem(123, 789, 2),
    );
    expect(cart.state()).toEqual([]);
    expect(cart.request.mock.calls.filter((call) => call[1] === "add_to_cart")).toHaveLength(1);
  });

  it("leaves the cart empty without restoring old items when a checkout quote fails", async () => {
    const original = cartItem();
    const cart = cartServer({ existing: [original] });
    const quote = vi.fn(async () => {
      throw new Error("Checkout request failed.");
    });
    await expect(
      createCartCheckoutEstimator(cart.request, quote)(listing, "789", 1),
    ).rejects.toThrow("Checkout request failed");
    expect(cart.state()).toEqual([]);
    expect(cart.request.mock.calls.filter((call) => call[1] === "cart_remove")).toHaveLength(2);
  });

  it("clears duplicate pre-existing groups before quoting one fresh candidate", async () => {
    const original = [cartItem(), { ...cartItem(), item_group_id: "other" }];
    const cart = cartServer({ existing: original });
    const quote = vi.fn(async () => shipping);
    await expect(
      createCartCheckoutEstimator(cart.request, quote)(listing, "789", 1),
    ).resolves.toEqual(shipping);
    expect(quote).toHaveBeenCalledOnce();
    expect(cart.state()).toEqual([]);
  });

  it.each(["quote", "lost_add", "cancellation"])(
    "empties the workspace after %s",
    async (failure) => {
      const controller = new AbortController();
      const cart = cartServer({
        lostAdd: failure === "lost_add",
        afterAdd: failure === "cancellation" ? () => controller.abort() : undefined,
      });
      const quote = vi.fn(async () => {
        throw new Error("Quote failed.");
      });
      await expect(
        createCartCheckoutEstimator(cart.request, quote)(listing, "789", 1, controller.signal),
      ).rejects.toThrow();
      expect(cart.state()).toEqual([]);
      const cleanup = cart.request.mock.calls.find((call) => call[1] === "cart_remove");
      expect(cleanup?.[2]).not.toBe(controller.signal);
      expect(cleanup?.[2]?.aborted).toBe(false);
    },
  );

  it("blocks subsequent mutations if cleanup fails", async () => {
    const cart = cartServer({ failRemove: true });
    const estimate = createCartCheckoutEstimator(cart.request, async () => shipping);
    await expect(estimate(listing, "789", 1)).rejects.toThrow("cleanup failed");
    const count = cart.request.mock.calls.length;
    await expect(estimate({ ...listing, listing_id: "124" }, "790", 1)).rejects.toThrow(
      "cleanup failed",
    );
    expect(cart.request).toHaveBeenCalledTimes(count);
  });

  it.each(["estimateShipping", "prepareCheckout"] as const)(
    "refuses to mutate a partially loaded cart during %s",
    async (operation) => {
      const original = [cartItem(100, 200)];
      const server = cartServer({ existing: original, partial: true });
      const cart = createShopeeCart(server.request, async () => shipping);
      await expect(cart[operation](listing, "789", 1)).rejects.toThrow("partially loaded");
      expect(server.state()).toEqual(original);
      expect(server.request).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects an incorrect candidate quantity and clears the workspace", async () => {
    const cart = cartServer({
      afterAdd: (item) => {
        item.quantity += 1;
      },
    });
    await expect(
      createCartCheckoutEstimator(cart.request, async () => shipping)(listing, "789", 1),
    ).rejects.toThrow("only the requested SKU");
    expect(cart.state()).toEqual([]);
    expect(cart.request.mock.calls.some((call) => call[1] === "cart_remove")).toBe(true);
  });

  it("serializes concurrent estimates until the previous candidate is removed", async () => {
    const cart = cartServer();
    const quote = vi.fn(async () => {
      expect(cart.state()).toHaveLength(1);

      return shipping;
    });
    const estimate = createCartCheckoutEstimator(cart.request, quote);
    await Promise.all([
      estimate(listing, "789", 1),
      estimate({ ...listing, listing_id: "124" }, "790", 1),
    ]);
    expect(quote).toHaveBeenCalledTimes(2);
    expect(cart.state()).toEqual([]);
    expect(cart.request.mock.calls.map((call) => call[1])).toEqual([
      "cart_get",
      "add_to_cart",
      "cart_get",
      "cart_get",
      "cart_remove",
      "cart_get",
      "cart_get",
      "add_to_cart",
      "cart_get",
      "cart_get",
      "cart_remove",
      "cart_get",
    ]);
  });

  it.each(["estimateShipping", "prepareCheckout"] as const)(
    "does not clear existing contents for invalid input or early cancellation during %s",
    async (operation) => {
      const original = [cartItem(100, 200)];
      const server = cartServer({ existing: original });
      const cart = createShopeeCart(server.request, async () => shipping);
      await expect(cart[operation](listing, "789", 0)).rejects.toThrow("positive numeric");
      await expect(cart[operation]({ ...listing, seller_id: "invalid" }, "789", 1)).rejects.toThrow(
        "positive numeric",
      );
      await expect(cart[operation](listing, "789", 1, AbortSignal.abort())).rejects.toThrow();
      expect(server.state()).toEqual(original);
      expect(server.request).not.toHaveBeenCalled();
    },
  );

  it("stops before adding a candidate if cancellation occurs after clearing old contents", async () => {
    const controller = new AbortController();
    const server = cartServer({ existing: [cartItem(100, 200)] });
    let reads = 0;
    const cart = createShopeeCart(
      async (...args) => {
        const response = await server.request(...args);
        if (args[1] === "cart_get" && ++reads === 2) controller.abort();

        return response;
      },
      async () => shipping,
    );
    await expect(cart.estimateShipping(listing, "789", 1, controller.signal)).rejects.toThrow();
    expect(server.state()).toEqual([]);
    expect(server.request.mock.calls.some((call) => call[1] === "add_to_cart")).toBe(false);
    expect(server.request.mock.calls.at(-1)?.[2]?.aborted).toBe(false);
  });

  it.each(["rejected", "ignored"])(
    "never adds or quotes a candidate if clearing existing contents is %s",
    async (failure) => {
      const original = [cartItem(100, 200)];
      const server = cartServer({ existing: original, failRemove: failure === "rejected" });
      const quote = vi.fn(async () => shipping);
      const cart = createShopeeCart(async (...args) => {
        if (args[1] === "cart_remove" && failure === "ignored") return { data: {} };

        return server.request(...args);
      }, quote);
      await expect(cart.estimateShipping(listing, "789", 1)).rejects.toThrow("cleanup failed");
      const calls = server.request.mock.calls.length;
      await expect(cart.prepareCheckout(listing, "789", 1)).rejects.toThrow("cleanup failed");
      expect(server.request).toHaveBeenCalledTimes(calls);
      expect(server.state()).toEqual(original);
      expect(server.request.mock.calls.some((call) => call[1] === "add_to_cart")).toBe(false);
      expect(quote).not.toHaveBeenCalled();
    },
  );

  it("clears a previously approved SKU when a new comparison begins", async () => {
    const server = cartServer();
    const cart = createShopeeCart(server.request, async () => shipping);
    await cart.prepareCheckout(listing, "789", 1);
    expect(server.state()).toEqual([cartItem()]);
    const next = { ...listing, seller_id: "999", listing_id: "124" };
    await cart.estimateShipping(next, "790", 2);
    expect(server.state()).toEqual([]);
    await cart.prepareCheckout(next, "790", 2);
    expect(server.state()).toEqual([{ ...cartItem(124, 790, 2), shopid: 999 }]);
  });
});
