import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VariantSelection } from "../src/components/offers/VariantSelection";
import { createApproval } from "../src/domain/checkout";
import { listingKey } from "../src/domain/schemas";
import type { Listing } from "../src/domain/schemas";
import { completeSelection, runPipeline } from "../src/pipeline/orchestrator";
import { prepareSearch } from "../src/pipeline/profiles";
import type { CandidateResults } from "../src/pipeline/search-products";
import { revalidateOffer } from "../src/pipeline/revalidate-offer";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";
import { unwrap } from "../src/providers/marketplace";
import { initialState, reducer } from "../src/state";

const request =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM. Ưu tiên giá rẻ.";

function found(listings: Listing[], truncated = false): CandidateResults {
  return {
    listings,
    truncated,
    search_review: {
      plan: {
        query: "iPhone 16 128GB",
        filters: [],
        sort_by: null,
        post_search_requirement_ids: [],
      },
      pages_fetched: 1,
      listing_limit: 12,
      page_limit: 3,
      truncated,
      entries: listings.map((listing) => ({ listing, status: "pending", reasons: [] })),
    },
  };
}

async function selectionSetup() {
  const listing = fixtureListings[0];
  const marketplace = createFixtureMarketplace();
  const product = unwrap(await marketplace.getProductDetails(listing));
  vi.spyOn(marketplace, "getProductDetails").mockResolvedValue({
    status: "ok",
    data: {
      ...product,
      default_variant_id: null,
      variants: [
        { variant_id: "128", name: "Đen 128GB", storage_gb: 128 },
        { variant_id: "256", name: "Đen 256GB", storage_gb: 256 },
      ],
    },
  });
  vi.spyOn(marketplace, "searchProducts").mockResolvedValue({
    status: "ok",
    data: { items: [listing], has_more: false, next_page: null },
  });
  const dependencies = {
    ai: {
      ...demoAI,
      chooseVariant: async () => ({
        status: "uncertain" as const,
        variant_id: null,
        reason: "Cần xác nhận SKU trong bài kiểm tra chọn thủ công.",
        ambiguous_variant_ids: ["128", "256"],
      }),
    },
    marketplace,
  };
  const quote = vi.spyOn(marketplace, "getOfferQuote");
  const output = await runPipeline([request], dependencies);
  if (output.status !== "selection") throw new Error("Expected explicit variant selection.");

  return { listing, prepared: output, dependencies, quote };
}

describe("relevance and explicit SKU selection", () => {
  it("removes explicitly irrelevant listings but retains uncertain listings", async () => {
    const marketplace = createFixtureMarketplace();
    const getProduct = vi.spyOn(marketplace, "getProductDetails");
    const listings = fixtureListings.slice(0, 2);
    const intent = await demoAI.interpretIntent([request]);
    const prepared = await prepareSearch(found(listings, true), intent, {
      marketplace,
      ai: {
        ...demoAI,
        assessListings: async () => ({
          assessments: listings.map((listing, index) => ({
            listing_id: listing.listing_id,
            seller_id: listing.seller_id,
            status: index === 0 ? "irrelevant" : "unknown",
            reason:
              index === 0 ? "Tiêu đề ghi ốp lưng, không phải điện thoại." : "Chưa đủ dữ liệu.",
          })),
        }),
      },
    });
    expect(prepared.candidates.map((candidate) => candidate.listing)).toEqual([listings[1]]);
    expect(prepared.candidates[0].relevance).toBe("unknown");
    expect(prepared.search_review.entries[0]).toMatchObject({
      listing: listings[0],
      status: "irrelevant",
      reasons: ["Tiêu đề ghi ốp lưng, không phải điện thoại."],
    });
    expect(prepared.search_review.entries[1].status).toBe("pending");
    expect(prepared.search_review.entries[1].reasons.join(" ")).toContain("vẫn giữ");
    expect(getProduct).toHaveBeenCalledTimes(1);
    expect(prepared.truncated).toBe(true);
  });

  it.each(["missing", "duplicate", "invented"])(
    "rejects invalid relevance assessments: %s",
    async (kind) => {
      const listing = fixtureListings[0];
      const assessment = {
        listing_id: kind === "invented" ? "invented" : listing.listing_id,
        seller_id: listing.seller_id,
        status: "unknown" as const,
        reason: "Chưa rõ.",
      };
      await expect(
        prepareSearch(found([listing]), await demoAI.interpretIntent([request]), {
          marketplace: createFixtureMarketplace(),
          ai: {
            ...demoAI,
            assessListings: async () => ({
              assessments:
                kind === "missing"
                  ? []
                  : kind === "duplicate"
                    ? [assessment, assessment]
                    : [assessment],
            }),
          },
        }),
      ).rejects.toThrow();
    },
  );

  it("pauses without quoting a guessed variant and resumes using only the selected SKU", async () => {
    const { listing, prepared, dependencies, quote } = await selectionSetup();
    expect(quote).not.toHaveBeenCalled();
    const selectionHtml = renderToStaticMarkup(
      createElement(VariantSelection, { prepared, onContinue: vi.fn() }),
    );
    expect(selectionHtml).toContain("Các listing đã xem (1)");
    expect(selectionHtml).toContain('data-review-status="pending"');
    const result = await completeSelection(
      prepared,
      { [listingKey(listing)]: "128" },
      dependencies,
    );
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].selected_variant_id).toBe("128");
    expect(result.ranking.ranked_offers).toHaveLength(1);
    expect(result.recommendation.recommended_offer_id).toBe(result.profiles[0].offer_id);
    expect(result.search_review.entries[0]).toMatchObject({
      status: "eligible",
      selected_variant: { variant_id: "128", name: "Đen 128GB" },
    });
    expect(prepared.search_review.entries[0].status).toBe("pending");
    expect(result.search_review.entries[0].seller_name).toBe(result.profiles[0].seller.name);
    expect(dependencies.marketplace.getProductDetails).toHaveBeenCalledTimes(1);
    expect(quote.mock.calls[0][1]).toBe("128");

    const approval = createApproval(1, result.profiles[0]);
    const revalidation = await revalidateOffer(1, approval, prepared.intent, dependencies);
    expect(revalidation.fresh.selected_variant_id).toBe("128");
    expect(["ready", "ready_with_unknowns"]).toContain(revalidation.validation.status);
  });

  it("checks selected-variant storage rather than misleading listing-level storage", async () => {
    const { listing, prepared, dependencies } = await selectionSetup();
    const result = await completeSelection(
      prepared,
      { [listingKey(listing)]: "256" },
      dependencies,
    );
    expect(result.profiles[0].product.storage_gb).toBe(256);
    expect(result.filters[0].status).toBe("excluded");
    expect(result.ranking.ranked_offers).toEqual([]);
    expect(result.search_review.entries[0].status).toBe("excluded");
    expect(result.search_review.entries[0].reasons.join(" ")).toContain("128GB");
    expect(
      result.profiles[0].sources.some((source) => source.field_path === "product.storage_gb"),
    ).toBe(true);
  });

  it.each(["missing", "wrong_variant", "extra_listing"])(
    "rejects invalid user selections: %s",
    async (kind) => {
      const { listing, prepared, dependencies } = await selectionSetup();
      const key = listingKey(listing);
      const choices =
        kind === "missing"
          ? {}
          : kind === "wrong_variant"
            ? { [key]: "not-a-variant" }
            : kind === "extra_listing"
              ? { [key]: "128", invented: "128" }
              : { [key]: null };
      await expect(completeSelection(prepared, choices, dependencies)).rejects.toThrow();
    },
  );

  it("honors explicitly skipped listings without quoting them", async () => {
    const marketplace = createFixtureMarketplace();
    const listings = fixtureListings.slice(0, 2);
    const prepared = await prepareSearch(found(listings), await demoAI.interpretIntent([request]), {
      ai: demoAI,
      marketplace,
    });
    const quote = vi.spyOn(marketplace, "getOfferQuote");
    const result = await completeSelection(
      prepared,
      {
        [listingKey(listings[0])]: null,
        [listingKey(listings[1])]: prepared.candidates[1].product.variants[0].variant_id,
      },
      { ai: demoAI, marketplace },
    );
    expect(result.profiles).toHaveLength(1);
    expect(quote).toHaveBeenCalledTimes(1);
    expect(quote.mock.calls[0][0]).toEqual(listings[1]);
    expect(result.search_review.entries[0]).toMatchObject({
      status: "skipped",
      reasons: expect.arrayContaining(["Listing được bỏ qua ở bước chọn biến thể."]),
    });
    expect(result.search_review.entries[0].selected_variant).toBeUndefined();
    expect(result.search_review.entries[1].status).toBe("eligible");
  });

  it("invalidates pending selections on new runs and rejects stale selection results", async () => {
    const { prepared } = await selectionSetup();
    const selected = reducer(
      { ...initialState, runId: 1 },
      { type: "selection", runId: 1, prepared },
    );
    expect(selected.pendingSelection).toBe(prepared);
    const next = reducer(selected, { type: "start", runId: 2 });
    expect(next.pendingSelection).toBeNull();
    expect(reducer(next, { type: "selection", runId: 1, prepared })).toBe(next);
  });
});
