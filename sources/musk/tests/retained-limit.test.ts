import { describe, expect, it, vi } from "vitest";
import { listingKey } from "../src/domain/schemas";
import type { Listing } from "../src/domain/schemas";
import { completeSelection, runPipeline } from "../src/pipeline/orchestrator";
import { prepareSearch } from "../src/pipeline/profiles";
import { searchProducts } from "../src/pipeline/search-products";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";

const request =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM. Bảo hành tối thiểu 12 tháng. Ưu tiên giá rẻ.";

function copies(listing: Listing, count: number): Listing[] {
  return Array.from({ length: count }, (_, index) => ({
    ...listing,
    seller_id: `${listing.seller_id}-${index}`,
    url: `${listing.url}/${index}`,
  }));
}

function setup(pages: Listing[][]) {
  const marketplace = createFixtureMarketplace();
  const search = vi.spyOn(marketplace, "searchProducts");
  pages.forEach((items, index) =>
    search.mockResolvedValueOnce({
      status: "ok",
      data: {
        items,
        has_more: index < pages.length - 1,
        next_page: index < pages.length - 1 ? index + 2 : null,
      },
    }),
  );
  const quote = vi.spyOn(marketplace, "getOfferQuote");
  const reviews = vi.spyOn(marketplace, "getReviews");
  const assessListings = vi.fn(demoAI.assessListings);
  const rankOffers = vi.fn(demoAI.rankOffers);

  return {
    dependencies: { ai: { ...demoAI, assessListings, rankOffers }, marketplace },
    search,
    quote,
    reviews,
    assessListings,
    rankOffers,
  };
}

describe("3-result search limit", () => {
  it("analyzes only the first 3 listings; relevance, quotes and reviews never see the rest", async () => {
    const listings = copies(fixtureListings[0], 14);
    const { dependencies, quote, reviews, assessListings, search } = setup([listings]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    const { result } = output;
    expect(search).toHaveBeenCalledOnce();
    expect(assessListings.mock.calls.map((call) => call[1])).toEqual([listings.slice(0, 3)]);
    expect(result.profiles).toHaveLength(3);
    expect(result.ranking.ranked_offers).toHaveLength(3);
    expect(quote.mock.calls.map((call) => call[0])).toEqual(listings.slice(0, 3));
    expect(reviews).toHaveBeenCalledTimes(3);
    expect(result.search_review.listing_limit).toBe(3);
    expect(result.search_review.truncated).toBe(true);
    expect(result.search_review.entries.map((entry) => entry.status)).toEqual(
      Array<string>(3).fill("eligible"),
    );
    expect(result.recommendation.limitations).toContain(
      "Chỉ phân tích 3 kết quả tìm kiếm đầu tiên; chưa bao phủ mọi kết quả.",
    );
  });

  it("reads another page only to make up for fewer than 3 organic results", async () => {
    const listings = copies(fixtureListings[0], 12);
    const { dependencies, search } = setup([listings.slice(0, 1), listings.slice(1), []]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    expect(search.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(output.result.search_review.pages_fetched).toBe(2);
    expect(output.result.search_review.entries.map((entry) => entry.listing)).toEqual(
      listings.slice(0, 3),
    );
    expect(output.result.search_review.truncated).toBe(true);
  });

  it("does not search further when the 3 listings fail requirements", async () => {
    const { dependencies, search, quote, rankOffers } = setup([
      copies(fixtureListings[2], 3),
      copies(fixtureListings[0], 5),
    ]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    const { result } = output;
    expect(search).toHaveBeenCalledOnce();
    expect(quote).toHaveBeenCalledTimes(3);
    expect(result.filters.every((filter) => filter.status === "excluded")).toBe(true);
    expect(result.ranking.ranked_offers).toEqual([]);
    expect(rankOffers).not.toHaveBeenCalled();
    expect(result.search_review.entries.every((entry) => entry.status === "excluded")).toBe(true);
  });

  it("does not quote SKUs the user skipped when resuming selection", async () => {
    const listings = copies(fixtureListings[0], 10);
    const { dependencies, quote } = setup([listings]);
    const intent = await demoAI.interpretIntent([request]);
    const plan = await demoAI.buildSearchPlan(intent, { filters: [], sort_options: [] });
    const prepared = await prepareSearch(
      await searchProducts(plan, dependencies),
      intent,
      dependencies,
    );
    const choices = Object.fromEntries(
      prepared.candidates.map(({ listing, product }, index) => [
        listingKey(listing),
        index < 1 ? null : product.default_variant_id,
      ]),
    );
    const result = await completeSelection(prepared, choices, dependencies);
    expect(result.ranking.ranked_offers).toHaveLength(2);
    expect(quote.mock.calls.map((call) => call[0])).toEqual(listings.slice(1, 3));
    expect(result.search_review.entries.filter((entry) => entry.status === "skipped")).toHaveLength(
      1,
    );
    expect(prepared.search_review.entries.every((entry) => entry.status === "pending")).toBe(true);
  });

  it("still stops at three pages when pages keep coming back short", async () => {
    const listings = copies(fixtureListings[2], 8);
    const { dependencies, search } = setup([
      listings.slice(0, 1),
      [],
      listings.slice(1, 2),
      listings.slice(2),
    ]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    expect(search).toHaveBeenCalledTimes(3);
    expect(output.result.search_review.pages_fetched).toBe(3);
    expect(output.result.search_review.entries).toHaveLength(2);
    expect(output.result.search_review.truncated).toBe(true);
  });
});
