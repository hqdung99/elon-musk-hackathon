import { describe, expect, it, vi } from "vitest";
import { createApproval } from "../src/domain/checkout";
import type { SearchPlan, Stage } from "../src/domain/schemas";
import { filterOffers } from "../src/pipeline/filter-offers";
import { interpretIntent } from "../src/pipeline/interpret-intent";
import { openCheckout } from "../src/pipeline/open-checkout";
import { runPipeline } from "../src/pipeline/orchestrator";
import { planSearch } from "../src/pipeline/plan-search";
import { buildOfferProfiles } from "../src/pipeline/profiles";
import { rankOffers } from "../src/pipeline/rank-offers";
import { recommendOffers } from "../src/pipeline/recommend-offers";
import { revalidateOffer } from "../src/pipeline/revalidate-offer";
import { searchProducts } from "../src/pipeline/search-products";
import { demoAI } from "../src/providers/ai";
import { fixtureCheckout } from "../src/providers/checkout";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";
import type { MarketplaceAdapter } from "../src/providers/marketplace";

const request =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 19 triệu VND, giao tại TP.HCM. Bảo hành tối thiểu 12 tháng. Ưu tiên giá rẻ.";
const plan: SearchPlan = {
  query: "iPhone 16 128GB",
  filters: [],
  sort_by: null,
  post_search_requirement_ids: [],
};
const dependencies = () => ({ ai: demoAI, marketplace: createFixtureMarketplace() });

describe("separate pipeline stages", () => {
  it("searches with clear unsupported mattress requirements and preserves unknown checks", async () => {
    const deps = dependencies();
    // Reuse fixture profiles while allowing this orchestration test's category.
    const fixtureSearch = deps.marketplace.searchProducts.bind(deps.marketplace);
    const search = vi
      .spyOn(deps.marketplace, "searchProducts")
      .mockImplementation((plan, page, signal) =>
        fixtureSearch({ ...plan, query: "iPhone 16 128GB" }, page, signal),
      );
    const intent = {
      product_description: "Nệm cao su 1m6 x 2m",
      quantity: 1,
      delivery_area: "TP.HCM",
      requirements: [
        {
          requirement_id: "size",
          user_text: "Nệm cao su 1m6 x 2m",
          field_path: null,
          operator: null,
          value: "1m6 x 2m",
          unit: null,
        },
      ],
      preferences: [],
      questions_for_user: ["Có yêu cầu chưa thể kiểm tra; vui lòng làm rõ hoặc sửa yêu cầu đó."],
    };
    const ai = { ...demoAI, interpretIntent: async () => intent };
    const output = await runPipeline(["Mua 1 nệm cao su 1m6 x 2m, giao tại TP.HCM"], {
      ...deps,
      ai,
    });
    expect(output.status).toBe("complete");
    expect(search.mock.calls[0][0].query).toContain("Nệm cao su");
    if (output.status !== "complete") throw new Error("Unsupported attribute blocked search");
    expect(output.result.intent.requirements).toEqual(intent.requirements);
    expect(output.result.intent.questions_for_user).toEqual([]);
    expect(output.result.filters.every((row) => row.status === "unresolved")).toBe(true);
    expect(
      output.result.filters[0].checks.find((check) => check.requirement_id === "size"),
    ).toMatchObject({ result: "unknown", reason: expect.stringContaining("chưa hỗ trợ xác minh") });
    expect(output.result.recommendation.limitations.join(" ")).toContain("Nệm cao su 1m6 x 2m");
  });

  it("asks a specific question for missing values of supported requirements", async () => {
    const deps = dependencies();
    const intent = await demoAI.interpretIntent([request]);
    intent.requirements = [
      {
        requirement_id: "budget",
        user_text: "Ngân sách tối đa",
        field_path: "quote.total",
        operator: "lte",
        value: null,
        unit: "VND",
      },
    ];
    const output = await interpretIntent(["Ngân sách tối đa"], {
      ...deps,
      ai: { ...demoAI, interpretIntent: async () => intent },
    });
    expect(output.questions_for_user.join(" ")).toContain("Ngân sách tối đa");
    expect(output.questions_for_user.join(" ")).not.toContain("Có yêu cầu chưa thể kiểm tra");
  });

  it("can execute each stage directly with explicit inputs and outputs", async () => {
    const deps = dependencies();
    const intent = await interpretIntent([request], deps);
    expect(intent.questions_for_user).toEqual([]);
    const searchPlan = await planSearch(intent, deps);
    const candidates = await searchProducts(searchPlan, deps);
    expect(candidates.truncated).toBe(true);
    const profiles = await buildOfferProfiles(candidates.listings, intent, deps);
    const { filters, candidates: considered } = filterOffers(profiles, intent);
    expect(filters).toHaveLength(3);
    expect(considered).toHaveLength(2);
    const ranking = await rankOffers(intent, considered, deps);
    const recommendation = recommendOffers(
      intent,
      profiles,
      ranking,
      deps,
      candidates.truncated,
      filters,
    );
    expect(recommendation.recommended_offer_id).toBe(considered[0].offer_id);
    const approval = createApproval(1, considered[0]);
    const { fresh, validation } = await revalidateOffer(1, approval, intent, deps);
    expect(validation.status).toBe("ready");
    expect((await openCheckout(fresh, fixtureCheckout)).status).toBe("simulated");
  });

  it("preserves progress stage order in the orchestrator", async () => {
    const progress: Stage[] = [];
    await runPipeline([request], { ...dependencies(), progress: (stage) => progress.push(stage) });
    expect(progress).toEqual([
      "clarifying",
      "planning",
      "searching",
      "profiling",
      "filtering",
      "ranking",
      "recommending",
    ]);
  });

  it("stops orchestration at clarification without running search planning", async () => {
    const deps = dependencies();
    const capabilities = vi.spyOn(deps.marketplace, "getSearchCapabilities");
    const output = await runPipeline(["Tìm điện thoại"], deps);
    expect(output.status).toBe("clarification");
    expect(capabilities).not.toHaveBeenCalled();
  });

  it("returns an empty ranking without calling AI when filtering found no eligible offers", async () => {
    const deps = dependencies();
    const intent = await interpretIntent([request], deps);
    const rank = vi.spyOn(deps.ai, "rankOffers");
    try {
      expect(await rankOffers(intent, [], deps)).toEqual({ ranked_offers: [] });
      expect(rank).not.toHaveBeenCalled();
    } finally {
      rank.mockRestore();
    }
  });

  it.each(["lower", "higher"] as const)(
    "enforces a sole explicit total-price preference (%s) even when AI reverses the prices",
    async (direction) => {
      const deps = dependencies();
      const intent = await interpretIntent([request], deps);
      intent.preferences[0].direction = direction;
      const profiles = await buildOfferProfiles(fixtureListings.slice(0, 2), intent, deps);
      profiles[0].quote.total = { amount_minor: 35_691_000, currency: "VND" };
      profiles[1].quote.total = { amount_minor: 34_991_000, currency: "VND" };
      for (const profile of profiles) profile.quote.total_estimated = true;
      const wrongOrder = direction === "lower" ? profiles : [...profiles].reverse();
      const ranking = await rankOffers(intent, profiles, {
        ...deps,
        ai: {
          ...demoAI,
          rankOffers: async () => ({
            ranked_offers: wrongOrder.map((profile, index) => ({
              offer_id: profile.offer_id,
              rank: index + 1,
              preference_reasons: [
                {
                  preference_id: intent.preferences[0].preference_id,
                  profile_field_paths: ["quote.total"],
                  reason: "Incorrect AI price comparison.",
                },
              ],
              trade_offs: ["Bảo hành chưa rõ."],
              missing_fields: profile.missing_fields,
            })),
          }),
        },
      });
      const expected = [...wrongOrder].reverse();
      expect(ranking.ranked_offers.map((row) => row.offer_id)).toEqual(
        expected.map((profile) => profile.offer_id),
      );
      expect(ranking.ranked_offers.map((row) => row.rank)).toEqual([1, 2]);
      expect(ranking.ranked_offers[0].preference_reasons[0].reason).toContain(
        direction === "lower" ? "34.991.000 VND" : "35.691.000 VND",
      );
      expect(ranking.ranked_offers[0].preference_reasons[0].reason).toContain("ước tính");
      expect(JSON.stringify(ranking)).not.toContain("Incorrect AI price comparison");
      expect(ranking.ranked_offers[0].trade_offs).toEqual(["Bảo hành chưa rõ."]);
      expect(ranking.ranked_offers[0].missing_fields).toEqual(expected[0].missing_fields);
    },
  );

  it.each(["unknown", "unsourced", "currency", "multiple_preferences", "tied_totals"])(
    "does not override AI ordering without an unambiguous price comparison: %s",
    async (condition) => {
      const deps = dependencies();
      const intent = await interpretIntent([request], deps);
      const profiles = await buildOfferProfiles(fixtureListings.slice(0, 2), intent, deps);
      if (condition === "unknown") profiles[0].quote.total = null;
      if (condition === "unsourced")
        profiles[0].sources = profiles[0].sources.filter(
          (source) => source.field_path !== "quote.total",
        );
      if (condition === "currency" && profiles[0].quote.total)
        profiles[0].quote.total.currency = "USD";
      if (condition === "multiple_preferences")
        intent.preferences.push({
          preference_id: "rating",
          user_text: "Ưu tiên shop đánh giá cao",
          field_path: "seller.rating",
          direction: "higher",
          preferred_value: null,
          priority: 2,
        });
      if (condition === "tied_totals") profiles[0].quote.total = profiles[1].quote.total;
      const aiRanking = await demoAI.rankOffers(intent, profiles);
      aiRanking.ranked_offers.reverse().forEach((row, index) => {
        row.rank = index + 1;
      });
      const ranking = await rankOffers(intent, profiles, {
        ...deps,
        ai: { ...demoAI, rankOffers: async () => aiRanking },
      });
      expect(ranking.ranked_offers.map((row) => row.offer_id)).toEqual(
        aiRanking.ranked_offers.map((row) => row.offer_id),
      );
    },
  );

  it("deduplicates listing identities across search pages", async () => {
    const search = vi
      .fn<MarketplaceAdapter["searchProducts"]>()
      .mockResolvedValueOnce({
        status: "ok",
        data: { items: [fixtureListings[0]], next_page: 2, has_more: true },
      })
      .mockResolvedValueOnce({
        status: "ok",
        data: { items: [fixtureListings[0], fixtureListings[1]], next_page: null, has_more: false },
      });
    const output = await searchProducts(plan, {
      ai: demoAI,
      marketplace: { ...createFixtureMarketplace(), searchProducts: search },
    });
    expect(output).toEqual({
      listings: [fixtureListings[0], fixtureListings[1]],
      truncated: false,
      search_review: {
        plan,
        pages_fetched: 2,
        listing_limit: 3,
        page_limit: 3,
        truncated: false,
        entries: [fixtureListings[0], fixtureListings[1]].map((listing) => ({
          listing,
          status: "pending",
          reasons: [],
        })),
      },
    });
    expect(search.mock.calls.map((call) => call[1])).toEqual([1, 2]);
  });

  it("keeps only the first 3 raw search results and reports the rest as truncated", async () => {
    const listings = Array.from({ length: 13 }, (_, index) => ({
      ...fixtureListings[0],
      listing_id: `listing-${index}`,
    }));
    const search = vi.fn<MarketplaceAdapter["searchProducts"]>().mockResolvedValue({
      status: "ok",
      data: { items: listings, next_page: null, has_more: false },
    });
    const output = await searchProducts(plan, {
      ai: demoAI,
      marketplace: { ...createFixtureMarketplace(), searchProducts: search },
    });
    expect(output.listings).toEqual(listings.slice(0, 3));
    expect(output.truncated).toBe(true);
    expect(output.search_review.truncated).toBe(true);
    expect(output.search_review.entries).toHaveLength(3);
    expect(output.search_review.entries[2]).toMatchObject({
      listing: listings[2],
      status: "pending",
      reasons: [],
    });
    expect(search).toHaveBeenCalledOnce();
  });

  it("rejects repeating pagination and missing next-page information", async () => {
    for (const nextPage of [1, null]) {
      const search = vi.fn<MarketplaceAdapter["searchProducts"]>().mockResolvedValue({
        status: "ok",
        data: { items: [], next_page: nextPage, has_more: true },
      });
      await expect(
        searchProducts(plan, {
          ai: demoAI,
          marketplace: { ...createFixtureMarketplace(), searchProducts: search },
        }),
      ).rejects.toThrow("Adapter");
    }
  });

  it("preserves the three-page bound and discloses partial coverage in recommendations", async () => {
    const search = vi
      .fn<MarketplaceAdapter["searchProducts"]>()
      .mockResolvedValueOnce({ status: "ok", data: { items: [], next_page: 2, has_more: true } })
      .mockResolvedValueOnce({ status: "ok", data: { items: [], next_page: 3, has_more: true } })
      .mockResolvedValueOnce({ status: "ok", data: { items: [], next_page: 4, has_more: true } });
    const deps = {
      ai: demoAI,
      marketplace: { ...createFixtureMarketplace(), searchProducts: search },
    };
    const intent = await interpretIntent([request], deps);
    const output = await searchProducts(plan, deps);
    expect(search).toHaveBeenCalledTimes(3);
    expect(output.truncated).toBe(true);
    expect(output.search_review.pages_fetched).toBe(3);
    expect(output.search_review.entries).toEqual([]);
    const recommendation = recommendOffers(
      intent,
      [],
      { ranked_offers: [] },
      deps,
      output.truncated,
    );
    expect(recommendation.limitations).toContain(
      "Chỉ phân tích 3 kết quả tìm kiếm đầu tiên; chưa bao phủ mọi kết quả.",
    );
  });

  it("does not navigate if cancellation happens before the checkout stage", async () => {
    const deps = dependencies();
    const intent = await interpretIntent([request], deps);
    const [profile] = await buildOfferProfiles([fixtureListings[0]], intent, deps);
    const abort = new AbortController();
    abort.abort();
    const navigate = vi.fn(fixtureCheckout.openCheckout);
    await expect(openCheckout(profile, { openCheckout: navigate }, abort.signal)).rejects.toThrow();
    expect(navigate).not.toHaveBeenCalled();
  });
});
