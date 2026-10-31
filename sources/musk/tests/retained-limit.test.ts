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

describe("retained-offer limit", () => {
  it("retains exactly 12 and avoids quoting or reviewing overflow SKUs", async () => {
    const listings = copies(fixtureListings[0], 14);
    const { dependencies, quote, reviews } = setup([listings]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    const { result } = output;
    expect(result.profiles).toHaveLength(12);
    expect(result.ranking.ranked_offers).toHaveLength(12);
    expect(quote).toHaveBeenCalledTimes(12);
    expect(reviews).toHaveBeenCalledTimes(12);
    expect(quote.mock.calls.map((call) => call[0])).toEqual(listings.slice(0, 12));
    expect(result.search_review.truncated).toBe(true);
    expect(result.search_review.entries.map((entry) => entry.status)).toEqual([
      ...Array<string>(12).fill("eligible"),
      "not_evaluated",
      "not_evaluated",
    ]);
    expect(result.search_review.entries[12].reasons.join(" ")).toContain("đã đủ 12 offer giữ lại");
    expect(result.search_review.entries[12].selected_variant).toBeUndefined();
  });

  it("continues past 13 confirmed failures across pages, counting unresolved offers in the 12", async () => {
    const excluded = copies(fixtureListings[2], 13);
    const retained = [fixtureListings[3], ...copies(fixtureListings[0], 12)];
    const { dependencies, search, quote, assessListings, rankOffers } = setup([
      excluded,
      [excluded[0], ...retained.slice(0, 8)],
      retained.slice(8),
    ]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    const { result } = output;
    expect(search.mock.calls.map((call) => call[1])).toEqual([1, 2, 3]);
    expect(assessListings.mock.calls.map((call) => call[1].length)).toEqual([12, 12, 2]);
    expect(result.search_review.entries).toHaveLength(26);
    expect(
      result.search_review.entries.filter((entry) => entry.status === "excluded"),
    ).toHaveLength(13);
    expect(
      result.search_review.entries.filter((entry) => entry.status === "unresolved"),
    ).toHaveLength(1);
    expect(
      result.search_review.entries.filter((entry) => entry.status === "eligible"),
    ).toHaveLength(11);
    expect(result.search_review.entries[25].status).toBe("not_evaluated");
    expect(result.profiles).toHaveLength(25);
    expect(quote).toHaveBeenCalledTimes(25);
    expect(result.ranking.ranked_offers).toHaveLength(12);
    expect(rankOffers.mock.calls[0][1]).toHaveLength(12);
    expect(
      rankOffers.mock.calls[0][1].some(
        (profile) => profile.seller.seller_id === retained[0].seller_id,
      ),
    ).toBe(true);
  });

  it("exhausts results with fewer than 12 retained instead of filling slots with rejected offers", async () => {
    const { dependencies, quote, rankOffers } = setup([copies(fixtureListings[2], 15)]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    const { result } = output;
    expect(result.profiles).toHaveLength(15);
    expect(result.filters.every((filter) => filter.status === "excluded")).toBe(true);
    expect(result.ranking.ranked_offers).toEqual([]);
    expect(rankOffers).not.toHaveBeenCalled();
    expect(quote).toHaveBeenCalledTimes(15);
    expect(result.search_review.truncated).toBe(false);
    expect(result.search_review.entries.every((entry) => entry.status === "excluded")).toBe(true);
  });

  it("does not count user skips or quote skipped SKUs when resuming selection", async () => {
    const listings = copies(fixtureListings[0], 26);
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
        index < 13 ? null : product.default_variant_id,
      ]),
    );
    const result = await completeSelection(prepared, choices, dependencies);
    expect(result.ranking.ranked_offers).toHaveLength(12);
    expect(quote.mock.calls.map((call) => call[0])).toEqual(listings.slice(13, 25));
    expect(result.search_review.entries.filter((entry) => entry.status === "skipped")).toHaveLength(
      13,
    );
    expect(result.search_review.entries[25].status).toBe("not_evaluated");
    expect(prepared.search_review.entries.every((entry) => entry.status === "pending")).toBe(true);
  });

  it("still stops at three pages even when every listing is rejected", async () => {
    const listings = copies(fixtureListings[2], 16);
    const { dependencies, search } = setup([
      listings.slice(0, 5),
      listings.slice(5, 10),
      listings.slice(10, 15),
      listings.slice(15),
    ]);
    const output = await runPipeline([request], dependencies);
    if (output.status !== "complete") throw new Error("Expected completed comparison.");
    expect(search).toHaveBeenCalledTimes(3);
    expect(output.result.search_review.pages_fetched).toBe(3);
    expect(output.result.search_review.entries).toHaveLength(15);
    expect(output.result.search_review.truncated).toBe(true);
    expect(output.result.ranking.ranked_offers).toEqual([]);
  });
});
