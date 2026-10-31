import { describe, expect, it, vi } from "vitest";
import { createApproval, validateApprovedOffer } from "../src/domain/checkout";
import {
  calculateTotal,
  evaluateRequirements,
  validateSearchPlan,
} from "../src/domain/requirements";
import { createAzureAI, defaultAzureConfig, demoAI } from "../src/providers/ai";
import { fixtureCheckout } from "../src/providers/checkout";
import { openCheckout as handoffCheckout } from "../src/pipeline/open-checkout";
import { createFixtureMarketplace } from "../src/providers/fixtures";
import { unwrap } from "../src/providers/marketplace";
import { approveAndRevalidate, runPipeline } from "../src/pipeline/orchestrator";
import { assembleProfile } from "../src/pipeline/profiles";
import { validateRanking } from "../src/pipeline/rank-offers";
import { initialState, reducer } from "../src/state";
import { CartCleanupError } from "../src/providers/shopee-cart";

const request =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 19 triệu VND, giao tại TP.HCM. Bảo hành tối thiểu 12 tháng. Ưu tiên giá rẻ.";
async function complete(messages = [request]) {
  const output = await runPipeline(messages, {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete")
    throw new Error(`Unexpected clarification: ${output.intent.questions_for_user}`);

  return output.result;
}

describe("pipeline", () => {
  it("clarifies missing intent instead of inventing requirements", async () => {
    const output = await runPipeline(["Tìm điện thoại"], {
      ai: demoAI,
      marketplace: createFixtureMarketplace(),
    });
    expect(output.status).toBe("clarification");
    if (output.status === "clarification") {
      expect(output.intent.quantity).toBeNull();
      expect(output.intent.requirements).toEqual([]);
      expect(output.intent.questions_for_user.length).toBeGreaterThan(0);
    }
  });
  it("ranks offers without confirmed failures, keeping unknown checks explicit", async () => {
    const result = await complete();
    expect(result.profiles).toHaveLength(4);
    expect(result.intent.delivery_area).toBe("tp.hcm");
    expect(result.ranking.ranked_offers).toHaveLength(3);
    expect(result.ranking.ranked_offers[0].offer_id).toContain("value:");
    expect(result.ranking.ranked_offers.some((row) => row.offer_id.startsWith("unknown:"))).toBe(
      true,
    );
    expect(result.ranking.ranked_offers.some((row) => row.offer_id.startsWith("cheap:"))).toBe(
      false,
    );
    expect(result.filters.find((filter) => filter.offer_id.startsWith("cheap:"))?.status).toBe(
      "excluded",
    );
    expect(result.filters.find((filter) => filter.offer_id.startsWith("unknown:"))?.status).toBe(
      "unresolved",
    );
    expect(result.profiles[0].review_summary.themes[1].matching_variant_review_count).toBe(0);
  });
  it("changes ordering for an explicit delivery preference", async () => {
    const result = await complete([request, "Ưu tiên giao nhanh."]);
    expect(result.ranking.ranked_offers[0].offer_id).toContain("fast:");
  });
  it("uses the latest explicit preference and preserves Mall as a preference", async () => {
    const fast = await complete([request, "Ưu tiên giao nhanh.", "Ưu tiên giá rẻ."]);
    expect(fast.ranking.ranked_offers[0].offer_id).toContain("value:");
    const mall = await demoAI.interpretIntent([request, "Ưu tiên Mall."]);
    expect(mall.preferences[0].field_path).toBe("seller.is_mall");
    expect(
      mall.requirements.some((requirement) => requirement.field_path === "seller.is_mall"),
    ).toBe(false);
  });
  it("does not silently ignore unsupported demo constraints", async () => {
    for (const text of ["Màu đen.", "Không mua hàng đã kích hoạt.", "Bỏ điều kiện Mall."]) {
      const output = await runPipeline([request, text], {
        ai: demoAI,
        marketplace: createFixtureMarketplace(),
      });
      expect(output.status).toBe("clarification");
    }
  });
  it("explains zero eligible offers without relaxing budget", async () => {
    const result = await complete([request, "Tổng tối đa 10 triệu VND."]);
    expect(result.recommendation.recommended_offer_id).toBeNull();
    expect(result.ranking.ranked_offers).toHaveLength(0);
    expect(result.filters.every((filter) => filter.status === "excluded")).toBe(true);
  });
  it("rejects invented, duplicate, missing, or incorrectly ordered ranking IDs", async () => {
    const result = await complete();
    const eligible = result.profiles.filter((profile) =>
      result.filters.some(
        (filter) => filter.offer_id === profile.offer_id && filter.status !== "excluded",
      ),
    );
    for (const ranking of [
      { ranked_offers: [] },
      { ranked_offers: [result.ranking.ranked_offers[0], result.ranking.ranked_offers[0]] },
      {
        ranked_offers: result.ranking.ranked_offers.map((row) => ({
          ...row,
          offer_id: "invented",
        })),
      },
      { ranked_offers: [...result.ranking.ranked_offers].reverse() },
    ])
      expect(() => validateRanking(ranking, eligible, result.intent)).toThrow();
    expect(() =>
      validateRanking(
        {
          ranked_offers: result.ranking.ranked_offers.map((row) => ({
            ...row,
            preference_reasons: [],
          })),
        },
        eligible,
        result.intent,
      ),
    ).toThrow("giải thích");
  });
  it("ranks an offer with an unknown total without citing it as a price reason", async () => {
    const result = await complete();
    const profiles = result.profiles
      .filter((profile) =>
        result.filters.some(
          (filter) => filter.offer_id === profile.offer_id && filter.status !== "excluded",
        ),
      )
      .map((profile) =>
        profile.offer_id.startsWith("unknown:")
          ? { ...profile, quote: { ...profile.quote, total: null } }
          : profile,
      );
    const ranking = await demoAI.rankOffers(result.intent, profiles);
    expect(() => validateRanking(ranking, profiles, result.intent)).not.toThrow();
    const unknown = ranking.ranked_offers.find((row) => row.offer_id.startsWith("unknown:"));
    expect(unknown?.rank).toBe(profiles.length);
    expect(unknown?.preference_reasons).toEqual([]);
    expect(unknown?.trade_offs.some((text) => text.startsWith("Chưa rõ quote.total"))).toBe(true);
  });
  it("rejects AI review IDs and incorrect variant counts", async () => {
    const result = await complete();
    const marketplace = createFixtureMarketplace();
    const listing = unwrap(
      await marketplace.searchProducts(
        { query: "iPhone 16", filters: [], sort_by: null, post_search_requirement_ids: [] },
        1,
      ),
    ).items[0];
    await expect(
      assembleProfile(listing, result.intent, marketplace, {
        ...demoAI,
        summarizeReviews: async () => ({
          analyzed_review_count: 2,
          limitations: [],
          themes: [
            {
              subject: "product",
              sentiment: "positive",
              description: "Invented",
              review_ids: ["fake"],
              matching_variant_review_count: 1,
            },
          ],
        }),
      }),
    ).rejects.toThrow("đánh giá");
  });
  it.each([false, true])(
    "waits for cart cleanup after an early AI error, prioritizing cleanup failure: %s",
    async (cleanupFails) => {
      const { intent } = await complete();
      const marketplace = createFixtureMarketplace();
      const listing = unwrap(
        await marketplace.searchProducts(
          { query: "iPhone 16", filters: [], sort_by: null, post_search_requirement_ids: [] },
          1,
        ),
      ).items[0];
      let releaseCleanup!: () => void;
      const cleanup = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      const cleanupError = new CartCleanupError("Cart restoration failed");
      const aiError = new Error("Review summarization failed");
      const summarizeReviews = vi.fn().mockRejectedValue(aiError);
      let settled = false;
      const result = assembleProfile(
        listing,
        intent,
        {
          ...marketplace,
          async getOfferQuote(...args) {
            await cleanup;
            if (cleanupFails) throw cleanupError;

            return marketplace.getOfferQuote(...args);
          },
        },
        { ...demoAI, summarizeReviews },
      ).then(
        () => {
          settled = true;
        },
        (error: unknown) => {
          settled = true;

          return error;
        },
      );
      await vi.waitFor(() => expect(summarizeReviews).toHaveBeenCalledOnce());
      expect(settled).toBe(false);
      releaseCleanup();
      expect(await result).toBe(cleanupFails ? cleanupError : aiError);
    },
  );
  it("aborts superseded runs", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      runPipeline([request], {
        ai: demoAI,
        marketplace: createFixtureMarketplace(),
        signal: abort.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("domain rules", () => {
  it("does not turn a preference into a hard search filter", async () => {
    const intent = await demoAI.interpretIntent([request, "Ưu tiên Mall"]);
    const capabilities = unwrap(
      await createFixtureMarketplace().getSearchCapabilities("iPhone 16"),
    );
    expect(() =>
      validateSearchPlan(
        {
          query: "iPhone 16",
          filters: [{ name: "mall", value: true, requirement_ids: ["mall"] }],
          sort_by: null,
          post_search_requirement_ids: intent.requirements.map(
            (requirement) => requirement.requirement_id,
          ),
        },
        capabilities,
        intent,
      ),
    ).toThrow();
  });
  it("requires supported parameters and coverage of all requirements", async () => {
    const intent = await demoAI.interpretIntent([request]);
    const capabilities = unwrap(
      await createFixtureMarketplace().getSearchCapabilities("iPhone 16"),
    );
    expect(() =>
      validateSearchPlan(
        { query: "phone", filters: [], sort_by: null, post_search_requirement_ids: [] },
        capabilities,
        intent,
      ),
    ).toThrow();
    expect(() =>
      validateSearchPlan(
        { query: "phone", filters: [], sort_by: "fake", post_search_requirement_ids: [] },
        capabilities,
        intent,
      ),
    ).toThrow();
  });
  it("keeps total unknown with unknown fees, currency mismatch or ineligible discounts", async () => {
    const { profiles } = await complete();
    const quote = profiles[0].quote;
    expect(calculateTotal({ ...quote, shipping_cost: null })).toBeNull();
    expect(calculateTotal({ ...quote, other_fees: null })).toBeNull();
    expect(
      calculateTotal({ ...quote, shipping_cost: { amount_minor: 0, currency: "USD" } }),
    ).toBeNull();
    expect(
      calculateTotal({
        ...quote,
        discounts: quote.discounts.map((discount) => ({ ...discount, eligible: null })),
      }),
    ).toBeNull();
    expect(calculateTotal(quote)).toEqual({ amount_minor: 17_840_000, currency: "VND" });
  });
  it("treats unknown price, missing sources and currency ambiguity as unresolved", async () => {
    const { profiles, intent } = await complete();
    expect(
      evaluateRequirements({ ...profiles[0], quote: { ...profiles[0].quote, total: null } }, intent)
        .status,
    ).toBe("unresolved");
    expect(evaluateRequirements({ ...profiles[0], sources: [] }, intent).status).toBe("unresolved");
    const wrongCurrency = structuredClone(intent);
    wrongCurrency.requirements.find(
      (requirement) => requirement.requirement_id === "budget",
    )!.unit = "USD";
    expect(evaluateRequirements(profiles[0], wrongCurrency).status).toBe("unresolved");
  });
  it("does not pass invalid delivery dates or unverified availability", async () => {
    const { profiles, intent } = await complete();
    const dateIntent = structuredClone(intent);
    dateIntent.requirements.push({
      requirement_id: "date",
      user_text: "Invalid date",
      field_path: "quote.estimated_delivery_to",
      operator: "lte",
      value: "2026-99-99",
      unit: "date",
    });
    expect(evaluateRequirements(profiles[0], dateIntent).status).toBe("unresolved");
    const unverified = {
      ...profiles[0],
      sources: profiles[0].sources.filter((source) => source.field_path !== "quote.in_stock"),
    };
    expect(evaluateRequirements(unverified, intent).status).toBe("unresolved");
  });
});

describe("approval and checkout", () => {
  it("blocks changes to a quoted discount", async () => {
    const { profiles, intent } = await complete();
    const profile = structuredClone(profiles[0]);
    const approval = createApproval(1, profile);
    const fresh = structuredClone(profile);
    fresh.quote.discounts[0].discount_id = "different-selected-voucher";
    expect(validateApprovedOffer(approval, fresh, intent, 1).status).toBe("changed");
  });
  it("ignores variant ordering but still blocks changed variant facts", async () => {
    const { profiles, intent } = await complete();
    const profile = structuredClone(profiles[0]);
    profile.product.variants.push({
      ...profile.product.variants[0],
      variant_id: "another-variant",
      name: "Another variant",
    });
    const approval = createApproval(1, profile);
    const fresh = structuredClone(profile);
    fresh.product.variants.reverse();
    expect(validateApprovedOffer(approval, fresh, intent, 1).changed_fields).toEqual([]);
    expect(["ready", "ready_with_unknowns"]).toContain(
      validateApprovedOffer(approval, fresh, intent, 1).status,
    );
    fresh.product.variants[0].name = "Changed variant";
    expect(validateApprovedOffer(approval, fresh, intent, 1).status).toBe("changed");
    expect(approval.displayed_offer.product.variants).toEqual(profile.product.variants);
  });
  it("captures an independent snapshot and rejects stale or declined approvals", async () => {
    const { profiles, intent } = await complete();
    const approval = createApproval(1, profiles[0]);
    profiles[0].seller.name = "Mutated";
    expect(approval.displayed_offer.seller.name).not.toBe("Mutated");
    expect(validateApprovedOffer(approval, approval.displayed_offer, intent, 2).status).toBe(
      "invalid_approval",
    );
    expect(
      validateApprovedOffer(
        { ...approval, decision: "declined" },
        approval.displayed_offer,
        intent,
        1,
      ).status,
    ).toBe("invalid_approval");
  });
  it.each([
    ["unchanged", "ready", 1],
    ["price_changed", "changed", 0],
    ["out_of_stock", "requirements_not_met", 0],
    ["unknown_shipping", "ready_with_unknowns", 1],
  ] as const)("revalidates %s and navigates unless blocked", async (scenario, status, calls) => {
    const result = await complete();
    const profile = result.profiles.find(
      (item) => item.offer_id === result.recommendation.recommended_offer_id,
    )!;
    const openCheckout = vi.fn(fixtureCheckout.openCheckout);
    const output = await approveAndRevalidate(
      1,
      profile,
      result.intent,
      {
        ai: demoAI,
        marketplace: createFixtureMarketplace(scenario, true),
      },
      { openCheckout },
    );
    expect(output.validation.status).toBe(status);
    expect(openCheckout).toHaveBeenCalledTimes(calls);
    if (scenario === "unchanged") expect(output.navigation?.status).toBe("simulated");
    if (scenario === "unknown_shipping") {
      expect(output.navigation?.status).toBe("simulated");
      expect(output.validation.changed_fields).toEqual([]);
      expect(output.validation.became_unknown_fields).toEqual(
        expect.arrayContaining(["quote.shipping_cost", "quote.total"]),
      );
      expect(output.validation.requirement_checks.status).toBe("unresolved");
    }
  });
  it("blocks changed policies but warns when delivery became unknown after approval", async () => {
    const { profiles, intent } = await complete();
    const profile = profiles[0],
      approval = createApproval(1, profile);
    const changed = structuredClone(profile);
    changed.policies.return_window_days = 7;
    expect(validateApprovedOffer(approval, changed, intent, 1).status).toBe("changed");
    const lostDelivery = structuredClone(profile);
    lostDelivery.quote.estimated_delivery_to = null;
    const lost = validateApprovedOffer(approval, lostDelivery, intent, 1);
    expect(lost.status).toBe("ready_with_unknowns");
    expect(lost.became_unknown_fields).toEqual(["quote.estimated_delivery_to"]);
  });
  it("warns but continues to checkout when facts were already unknown at approval", async () => {
    const result = await complete();
    const profile = result.profiles.find((item) => item.offer_id.startsWith("unknown:"))!;
    const openCheckout = vi.fn(fixtureCheckout.openCheckout);
    const output = await approveAndRevalidate(
      1,
      profile,
      result.intent,
      { ai: demoAI, marketplace: createFixtureMarketplace("unchanged", true) },
      { openCheckout },
    );
    expect(output.validation.status).toBe("ready_with_unknowns");
    expect(output.validation.unknown_fields).toContain("policies.warranty_months");
    expect(output.validation.requirement_checks.status).toBe("unresolved");
    expect(openCheckout).toHaveBeenCalledTimes(1);
  });
  it("does not start cart handoff when approval was cancelled", async () => {
    const profile = (await complete()).profiles[0];
    const openCheckout = vi.fn(fixtureCheckout.openCheckout);
    const controller = new AbortController();
    controller.abort();
    await expect(handoffCheckout(profile, { openCheckout }, controller.signal)).rejects.toThrow();
    expect(openCheckout).not.toHaveBeenCalled();
  });
  it("preserves a prepared cart handoff and forwards the cancellation signal", async () => {
    const result = await complete();
    const controller = new AbortController();
    const navigation = {
      status: "ready" as const,
      checkout_url: "https://shopee.vn/cart",
      message: "Ready to open cart.",
    };
    const openCheckout = vi.fn(async () => ({ status: "ok" as const, data: navigation }));
    const output = await approveAndRevalidate(
      1,
      result.profiles[0],
      result.intent,
      {
        ai: demoAI,
        marketplace: createFixtureMarketplace(),
        signal: controller.signal,
      },
      { openCheckout },
    );
    expect(["ready", "ready_with_unknowns"]).toContain(output.validation.status);
    expect(output.navigation).toEqual(navigation);
    expect(openCheckout).toHaveBeenCalledExactlyOnceWith(output.fresh, controller.signal);
  });
});

describe("local application boundaries", () => {
  it("ignores delayed progress and results from an older run", async () => {
    const result = await complete();
    const state = reducer(initialState, { type: "start", runId: 2 });
    expect(reducer(state, { type: "progress", runId: 1, stage: "ranking" })).toBe(state);
    expect(reducer(state, { type: "result", runId: 1, result })).toBe(state);
    expect(
      reducer(state, {
        type: "message",
        runId: 1,
        message: { id: "old", kind: "assistant", text: "old" },
      }),
    ).toBe(state);
  });
  it("invalidates old approval actions when configuration changes", () => {
    const state = reducer(
      { ...initialState, runId: 1, busy: true },
      { type: "invalidate", runId: 2 },
    );
    expect(state.runId).toBe(2);
    expect(state.busy).toBe(false);
    expect(state.intent).toBeNull();
  });
  it("advances the active run on cancellation and ignores its delayed result", async () => {
    const result = await complete();
    const stopped = reducer(
      { ...initialState, runId: 1, busy: true },
      { type: "stop", runId: 2, stage: "idle" },
    );
    expect(stopped.runId).toBe(2);
    expect(reducer(stopped, { type: "result", runId: 1, result })).toBe(stopped);
  });
  it("rejects missing credentials and non-Azure endpoints before requests", async () => {
    await expect(createAzureAI(defaultAzureConfig)).rejects.toThrow("API key");
    await expect(
      createAzureAI({ ...defaultAzureConfig, endpoint: "https://example.com", apiKey: "test" }),
    ).rejects.toThrow("Endpoint");
  });
});
