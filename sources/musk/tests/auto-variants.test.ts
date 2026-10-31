import { expect, it, vi } from "vitest";
import { selectVariants } from "../src/pipeline/select-variants";
import { completeSelection } from "../src/pipeline/orchestrator";
import type { PreparedSearch } from "../src/pipeline/types";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";
import { unwrap } from "../src/providers/marketplace";
import { listingKey } from "../src/domain/schemas";

async function setup() {
  const marketplace = createFixtureMarketplace();
  const listing = fixtureListings[0];
  const intent = await demoAI.interpretIntent([
    "Mua 1 máy iPhone 16 128GB. Tổng tối đa 25 triệu VND. Giao tại TP.HCM.",
  ]);
  const product = unwrap(await marketplace.getProductDetails(listing));
  product.variants = [
    { variant_id: "256", name: "Đen 256GB", storage_gb: 256 },
    { variant_id: "128", name: "Đen 128GB", storage_gb: 128 },
  ];
  product.default_variant_id = "256";
  const prepared: PreparedSearch = {
    intent,
    candidates: [{ listing, product, relevance: "relevant" }],
    truncated: false,
    search_review: {
      plan: { query: "iPhone", filters: [], sort_by: null, post_search_requirement_ids: [] },
      pages_fetched: 1,
      page_limit: 3,
      listing_limit: 12,
      truncated: false,
      entries: [{ listing, status: "pending", reasons: [] }],
    },
  };

  return { prepared, marketplace, listing, product };
}

it("automatically chooses the matching storage instead of a conflicting default", async () => {
  const { prepared, marketplace, listing } = await setup();
  const choices = await selectVariants(prepared, { ai: demoAI, marketplace });
  expect(choices).toEqual({ [listingKey(listing)]: "128" });
  const result = await completeSelection(prepared, choices!, { ai: demoAI, marketplace });
  expect(result.profiles[0].selected_variant_id).toBe("128");
  expect(result.search_review.entries[0].reasons.join(" ")).toContain("Chọn SKU:");
});

it("chooses the default or first variant without requiring user input when unconstrained", async () => {
  const { prepared, marketplace, listing, product } = await setup();
  prepared.intent.requirements = [];
  expect(await selectVariants(prepared, { ai: demoAI, marketplace })).toEqual({
    [listingKey(listing)]: "256",
  });
  product.default_variant_id = null;
  expect(await selectVariants(prepared, { ai: demoAI, marketplace })).toEqual({
    [listingKey(listing)]: "256",
  });
});

it.each([{ has_stock: false }, { is_clickable: false }, { is_grayout: true }, { stock: 0 }])(
  "does not send an unavailable default SKU to AI: %j",
  async (availability) => {
    const { prepared, marketplace, listing, product } = await setup();
    prepared.intent.requirements = [];
    Object.assign(product.variants[0], availability);
    const chooseVariant = vi.fn(demoAI.chooseVariant);
    expect(
      await selectVariants(prepared, {
        marketplace,
        ai: { ...demoAI, chooseVariant },
      }),
    ).toEqual({ [listingKey(listing)]: "128" });
    expect(chooseVariant.mock.calls[0][1].variants.map((variant) => variant.variant_id)).toEqual([
      "128",
    ]);
    expect(chooseVariant.mock.calls[0][1].default_variant_id).toBeNull();
    expect(product.variants).toHaveLength(2);
  },
);

it("uses stock quantity boundaries without assuming missing stock is unavailable", async () => {
  const { prepared, marketplace, listing, product } = await setup();
  prepared.intent.requirements = [];
  prepared.intent.quantity = 2;
  product.variants[0].stock = 1;
  product.variants[1].stock = 2;
  expect(await selectVariants(prepared, { marketplace, ai: demoAI })).toEqual({
    [listingKey(listing)]: "128",
  });
  product.variants[1].stock = null;
  product.variants[1].has_stock = null;
  expect(await selectVariants(prepared, { marketplace, ai: demoAI })).toEqual({
    [listingKey(listing)]: "128",
  });
});

it("skips sold-out listings without asking AI, quoting, or losing the reason", async () => {
  const { prepared, marketplace, listing, product } = await setup();
  product.variants.forEach((variant) => {
    variant.has_stock = false;
  });
  const chooseVariant = vi.fn(demoAI.chooseVariant);
  const quote = vi.spyOn(marketplace, "getOfferQuote");
  const choices = await selectVariants(prepared, { marketplace, ai: { ...demoAI, chooseVariant } });
  expect(choices).toEqual({ [listingKey(listing)]: null });
  const result = await completeSelection(prepared, choices!, { marketplace, ai: demoAI });
  expect(chooseVariant).not.toHaveBeenCalled();
  expect(quote).not.toHaveBeenCalled();
  expect(result.profiles).toEqual([]);
  expect(result.search_review.entries[0].status).toBe("skipped");
  expect(result.search_review.entries[0].reasons.join(" ")).toContain("Không có SKU khả dụng");
});

it("fallback selection cannot choose a sold-out variant", async () => {
  const { prepared, marketplace, listing, product } = await setup();
  prepared.intent.requirements = [];
  product.variants[0].has_stock = false;
  expect(
    await selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "uncertain",
          variant_id: null,
          reason: "Thiếu thông tin.",
        }),
      },
    }),
  ).toEqual({ [listingKey(listing)]: "128" });
});

it("rejects an AI decision selecting a known-unavailable SKU", async () => {
  const { prepared, marketplace, product } = await setup();
  product.variants[0].has_stock = false;
  await expect(
    selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "selected",
          variant_id: "256",
          reason: "Default",
        }),
      },
    }),
  ).rejects.toThrow("không khả dụng");
});

it("rejects AI ambiguity involving a known-unavailable SKU", async () => {
  const { prepared, marketplace, product } = await setup();
  product.variants[0].has_stock = false;
  await expect(
    selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "uncertain",
          variant_id: null,
          reason: "Chọn một SKU",
          ambiguous_variant_ids: ["128", "256"],
        }),
      },
    }),
  ).rejects.toThrow("không khả dụng");
});

it("skips a listing with no matching SKU without quoting it", async () => {
  const { prepared, marketplace, product } = await setup();
  product.variants = [product.variants[0]];
  const quote = vi.spyOn(marketplace, "getOfferQuote");
  const choices = await selectVariants(prepared, { ai: demoAI, marketplace });
  const result = await completeSelection(prepared, choices!, { ai: demoAI, marketplace });
  expect(result.profiles).toEqual([]);
  expect(quote).not.toHaveBeenCalled();
  expect(result.recommendation.recommended_offer_id).toBeNull();
});

it("rejects invented SKU identities", async () => {
  const { prepared, marketplace } = await setup();
  await expect(
    selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "selected",
          variant_id: "invented",
          reason: "Match",
        }),
      },
    }),
  ).rejects.toThrow("SKU không tồn tại");
});

it("does not pause for missing evidence and avoids a conflicting default SKU", async () => {
  const { prepared, marketplace, listing } = await setup();
  expect(
    await selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "uncertain",
          variant_id: null,
          reason: "SKU không ghi kích thước 1m6 x 2m.",
        }),
      },
    }),
  ).toEqual({ [listingKey(listing)]: "128" });
  expect(prepared.search_review.entries[0].reasons.join(" ")).toContain("1m6 x 2m");
  expect(prepared.search_review.entries[0].reasons.join(" ")).toContain("chưa xác minh");
});

it("pauses for a genuine choice between named existing variants", async () => {
  const { prepared, marketplace } = await setup();
  expect(
    await selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "uncertain",
          variant_id: null,
          reason: "Cần chọn giữa hai SKU theo yêu cầu chưa rõ.",
          ambiguous_variant_ids: ["128", "256"],
        }),
      },
    }),
  ).toBeNull();
});

it("rejects invented variant identities in ambiguity evidence", async () => {
  const { prepared, marketplace } = await setup();
  await expect(
    selectVariants(prepared, {
      marketplace,
      ai: {
        ...demoAI,
        chooseVariant: async () => ({
          status: "uncertain",
          variant_id: null,
          reason: "Ambiguous",
          ambiguous_variant_ids: ["128", "invented"],
        }),
      },
    }),
  ).rejects.toThrow("SKU không tồn tại");
});
