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
