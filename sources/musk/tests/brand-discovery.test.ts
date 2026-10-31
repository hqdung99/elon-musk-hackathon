import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OfferResults } from "../src/components/offers/OfferResults";
import { createApproval, validateApprovedOffer } from "../src/domain/checkout";
import type { BrandDiscovery, FieldSource, Listing, ShoppingIntent } from "../src/domain/schemas";
import { compareOffers } from "../src/pipeline/compare-brands";
import { validateBrandDiscovery } from "../src/pipeline/discover-brands";
import { filterOffers } from "../src/pipeline/filter-offers";
import { canReuseProfiles } from "../src/pipeline/interpret-turn";
import { runPipeline, runWithIntent } from "../src/pipeline/orchestrator";
import { assembleProfile } from "../src/pipeline/profiles";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";
import { unwrap } from "../src/providers/marketplace";
import type { MarketplaceAdapter } from "../src/providers/marketplace";

const discovery: BrandDiscovery = {
  brands: ["Clear", "Head & Shoulders", "Selsun"].map((name, index) => ({
    name,
    aliases: index === 1 ? ["H&S", "Head&Shoulders"] : [],
    reason: `Mock source mentions ${name} shampoo; not clinical evidence.`,
    source_urls: [`https://brands.example/${index}`],
  })),
  sources: [0, 1, 2].map((index) => ({
    url: `https://brands.example/${index}`,
    title: `Mock manufacturer ${index}`,
  })),
  limitations: ["Mock research, not market-share ranking or clinical evidence."],
  researched_at: "2026-01-01T00:00:00Z",
};
const intent: ShoppingIntent = {
  product_description: "dầu gội trị gàu",
  shopping_goal: { mode: "discover_brands", category: "dầu gội trị gàu", requested_brand: null },
  quantity: 1,
  delivery_area: "TP.HCM",
  requirements: [],
  preferences: [
    {
      preference_id: "price",
      user_text: "Ưu tiên giá rẻ",
      field_path: "quote.total",
      direction: "lower",
      preferred_value: null,
      priority: 1,
    },
  ],
  questions_for_user: [],
};

function setup() {
  const seed = createFixtureMarketplace();
  const listings = discovery.brands.map((brand, group) =>
    fixtureListings.slice(0, 3).map((listing) => ({
      ...listing,
      listing_id: `${group}-${listing.listing_id}`,
      seller_id: `${group}-${listing.seller_id}`,
      title: `${brand.name} dầu gội trị gàu 1 chai 500ml`,
      url: `https://shopee.vn/product/${group}/${listing.listing_id}`,
    })),
  );
  function original(listing: Listing) {
    const found = fixtureListings.find((candidate) =>
      listing.listing_id.endsWith(`-${candidate.listing_id}`),
    );
    if (!found) throw new Error("Unexpected mock listing.");

    return found;
  }

  function source(listing: Listing, field_path: string): FieldSource {
    return {
      field_path,
      source_url: listing.url,
      observed_at: discovery.researched_at,
      basis: "platform_reported",
    };
  }

  const marketplace: MarketplaceAdapter = {
    ...seed,
    searchProducts: vi.fn<MarketplaceAdapter["searchProducts"]>(async (plan) => {
      const group = discovery.brands.findIndex((brand) => plan.query.includes(brand.name));
      if (group < 0) throw new Error("Unexpected mock brand search.");

      return { status: "ok", data: { items: listings[group], has_more: false, next_page: null } };
    }),
    async getProductDetails(listing) {
      const product = unwrap(await seed.getProductDetails(original(listing)));
      const group = Number(listing.listing_id.split("-")[0]);

      return {
        status: "ok",
        data: {
          ...product,
          listing_id: listing.listing_id,
          title: listing.title,
          model: null,
          storage_gb: null,
          brand: group === 1 ? "H&S" : discovery.brands[group].name,
          volume_ml: 500,
          pack_count: 1,
          variants: product.variants.map((variant) => ({
            ...variant,
            name: "1 chai 500ml",
            model: null,
            storage_gb: null,
            volume_ml: 500,
            pack_count: 1,
          })),
          sources: ["product.brand", "product.volume_ml", "product.pack_count"].map((path) =>
            source(listing, path),
          ),
        },
      };
    },
    async getSellerDetails(listing) {
      const seller = unwrap(await seed.getSellerDetails(original(listing)));

      return {
        status: "ok",
        data: { ...seller, seller_id: listing.seller_id, name: listing.seller_id },
      };
    },
    async getReviews() {
      return { status: "ok", data: [] };
    },
    getOfferQuote: vi.fn<MarketplaceAdapter["getOfferQuote"]>(async (listing, variantId, buyer) => {
      const quote = unwrap(await seed.getOfferQuote(original(listing), variantId, buyer));
      const group = Number(listing.listing_id.split("-")[0]);
      const unit =
        (listing.listing_id.endsWith("cheap")
          ? 150_000
          : listing.listing_id.endsWith("fast")
            ? 230_000
            : 200_000) +
        group * 50_000;

      return {
        status: "ok",
        data: {
          ...quote,
          listing_id: listing.listing_id,
          variant_id: variantId,
          item_unit_price: { amount_minor: unit, currency: "VND" },
          shipping_cost: { amount_minor: 30_000, currency: "VND" },
          other_fees: { amount_minor: 0, currency: "VND" },
          discounts: [],
          total: { amount_minor: unit * buyer.quantity + 30_000, currency: "VND" },
          sources: ["quote.total", "quote.in_stock"].map((path) => source(listing, path)),
        },
      };
    }),
    async getPurchasePolicies(listing, variantId) {
      const policies = unwrap(await seed.getPurchasePolicies(original(listing), variantId));

      return {
        status: "ok",
        data: { ...policies, listing_id: listing.listing_id, variant_id: variantId },
      };
    },
  };
  const ai = {
    ...demoAI,
    interpretIntent: vi.fn(async () => structuredClone(intent)),
    discoverBrands: vi.fn(async () => structuredClone(discovery)),
    rankOffers: vi.fn(demoAI.rankOffers),
  };

  return { marketplace, ai, listings };
}

it("routes a category through sourced brands, nine listings, within-brand ranks then cross-brand leaders", async () => {
  const dependencies = setup();
  const stages: string[] = [];
  const output = await runPipeline(["Mua dầu gội trị gàu"], {
    ...dependencies,
    progress: (stage) => stages.push(stage),
  });
  if (output.status !== "complete") throw new Error("Expected completed category comparison.");
  const result = output.result;
  expect(stages).toContain("discovering");
  expect(dependencies.ai.discoverBrands).toHaveBeenCalledOnce();
  expect(dependencies.marketplace.searchProducts).toHaveBeenCalledTimes(3);
  expect(dependencies.marketplace.getOfferQuote).toHaveBeenCalledTimes(9);
  expect(result.search_review.listing_limit).toBe(9);
  expect(result.search_review.entries).toHaveLength(9);
  expect(result.search_review.brand_searches?.map((search) => search.listing_limit)).toEqual([
    3, 3, 3,
  ]);
  expect(result.intent.requirements).toEqual([]);
  expect(result.brand_comparisons?.map((group) => group.ranking.ranked_offers.length)).toEqual([
    3, 3, 3,
  ]);
  expect(result.ranking.ranked_offers.map((row) => row.offer_id.split(":")[0])).toEqual([
    "0-cheap",
    "1-cheap",
    "2-cheap",
  ]);
  const calls = dependencies.ai.rankOffers.mock.calls;
  expect(calls.slice(0, 3).map((call) => call[1].length)).toEqual([3, 3, 3]);
  expect(calls[3][1].map((profile) => profile.product.listing_id)).toEqual([
    "0-cheap",
    "1-cheap",
    "2-cheap",
  ]);
  expect(
    result.search_review.entries.find((entry) => entry.listing.listing_id === "1-cheap")?.brand,
  ).toBe("Head & Shoulders");
  expect(
    result.profiles.find((profile) => profile.product.listing_id === "1-cheap")?.product.brand,
  ).toBe("H&S");
  expect(result.profiles[2].quote.unit_price_per_100ml?.amount_minor).toBe(36_000);

  const html = renderToStaticMarkup(
    createElement(OfferResults, {
      result,
      active: true,
      onApprove: vi.fn(),
      onDecline: vi.fn(),
      onRevise: vi.fn(),
    }),
  );
  expect(html).toContain('aria-label="Nghiên cứu thương hiệu"');
  expect(html).toContain('href="https://brands.example/0"');
  expect(html).toContain("So sánh cùng thương hiệu: Clear (3 offer)");
  expect(html).toContain("CÙNG THƯƠNG HIỆU #1");
  expect(html.match(/class="comparison-table"/g)).toHaveLength(4);
  expect(html).toContain("<caption>So sánh giữa các thương hiệu</caption>");
  expect(html).toContain("<caption>So sánh Clear</caption>");
  expect(html).toContain('scope="row">Chi phí / 100ml');
  expect(html.match(/ĐỀ XUẤT CHO BẠN/g)).toHaveLength(1);
  expect(html).toContain("Giới hạn tổng 9 listing");
  expect(html).not.toContain(" máy");

  const next = {
    ...result.intent,
    preferences: [
      {
        ...result.intent.preferences[0],
        field_path: "quote.estimated_delivery_to" as const,
        direction: "earlier" as const,
      },
    ],
  };
  expect(canReuseProfiles(result.intent, next)).toBe(true);
  const { candidates } = filterOffers(result.profiles, next);
  const reranked = await compareOffers(
    next,
    candidates,
    dependencies,
    result.search_review.discovery,
  );
  expect(
    reranked.brand_comparisons?.every((group) =>
      group.ranking.ranked_offers[0].offer_id.includes("-fast:"),
    ),
  ).toBe(true);
  expect(dependencies.marketplace.searchProducts).toHaveBeenCalledTimes(3);
  expect(dependencies.marketplace.getOfferQuote).toHaveBeenCalledTimes(9);
  const innerAlternative = result.profiles[0];
  expect(
    validateApprovedOffer(createApproval(1, innerAlternative), innerAlternative, result.intent, 1)
      .status,
  ).toBe("ready_with_unknowns");
});

it("preserves the existing targeted three-listing path without web research", async () => {
  const ai = { ...demoAI, discoverBrands: vi.fn(demoAI.discoverBrands) };
  const output = await runPipeline(
    ["Mua 1 máy iPhone 16 128GB, giao tại TP.HCM. Tổng tối đa 25 triệu VND. Ưu tiên giá rẻ."],
    { ai, marketplace: createFixtureMarketplace() },
  );
  if (output.status !== "complete") throw new Error("Expected completed targeted comparison.");
  expect(ai.discoverBrands).not.toHaveBeenCalled();
  expect(output.result.search_review.listing_limit).toBe(3);
  expect(output.result.brand_comparisons).toBeUndefined();
});

it("skips mismatched, missing and unsourced API brands before quoting", async () => {
  const dependencies = setup();
  const original = dependencies.marketplace.getProductDetails;
  vi.spyOn(dependencies.marketplace, "getProductDetails").mockImplementation(async (listing) => {
    const product = unwrap(await original(listing));
    if (listing.listing_id === "0-value") product.brand = "Unresearched brand";
    if (listing.listing_id === "0-fast") product.brand = null;
    if (listing.listing_id === "0-cheap")
      product.sources = product.sources.filter((source) => source.field_path !== "product.brand");

    return { status: "ok", data: product };
  });
  const output = await runWithIntent(intent, dependencies);
  if (output.status !== "complete") throw new Error("Expected comparison.");
  expect(dependencies.marketplace.getOfferQuote).toHaveBeenCalledTimes(6);
  expect(
    output.result.search_review.entries.slice(0, 3).every((entry) => entry.status === "skipped"),
  ).toBe(true);
  expect(output.result.brand_comparisons?.[0].ranking.ranked_offers).toEqual([]);
  expect(output.result.ranking.ranked_offers).toHaveLength(2);
});

it("deduplicates globally while retaining per-brand caps and actual search plans", async () => {
  const dependencies = setup();
  vi.mocked(dependencies.marketplace.searchProducts).mockResolvedValue({
    status: "ok",
    data: {
      items: [...dependencies.listings[0], ...dependencies.listings[1]],
      has_more: true,
      next_page: 2,
    },
  });
  const output = await runWithIntent(intent, dependencies);
  if (output.status !== "complete") throw new Error("Expected comparison.");
  expect(output.result.search_review.entries).toHaveLength(3);
  expect(dependencies.marketplace.getOfferQuote).toHaveBeenCalledTimes(3);
  expect(output.result.search_review.truncated).toBe(true);
  expect(output.result.search_review.brand_searches?.every((search) => search.truncated)).toBe(
    true,
  );
});

it("uses fewer supported brands with an explicit limitation, never inventing a third", async () => {
  const dependencies = setup();
  dependencies.ai.discoverBrands.mockResolvedValue({
    ...discovery,
    brands: discovery.brands.slice(0, 2),
  });
  const output = await runWithIntent(intent, dependencies);
  if (output.status !== "complete") throw new Error("Expected comparison.");
  expect(output.result.search_review.listing_limit).toBe(6);
  expect(output.result.search_review.brand_searches).toHaveLength(2);
});

it("rejects fabricated sources and brand/alias collisions", () => {
  expect(() =>
    validateBrandDiscovery({
      ...discovery,
      brands: [{ ...discovery.brands[0], source_urls: ["https://fabricated.example"] }],
    }),
  ).toThrow("nguồn");
  expect(() =>
    validateBrandDiscovery({
      ...discovery,
      brands: [discovery.brands[0], { ...discovery.brands[1], aliases: ["CLEAR"] }],
    }),
  ).toThrow("alias");
  expect(() =>
    validateBrandDiscovery({ ...discovery, brands: discovery.brands.slice(0, 2), limitations: [] }),
  ).toThrow("giới hạn");
});

it("surfaces unsupported demo research and research errors without Shopee calls", async () => {
  const dependencies = setup();
  dependencies.ai.discoverBrands.mockRejectedValue(new Error("Research unavailable"));
  await expect(runWithIntent(intent, dependencies)).rejects.toThrow("Research unavailable");
  expect(dependencies.marketplace.searchProducts).not.toHaveBeenCalled();
  await expect(demoAI.discoverBrands(intent)).rejects.toThrow("demo");
});

it("keeps unit cost unknown without explicit pack evidence and uses selected SKU dimensions", async () => {
  const dependencies = setup();
  const listing = dependencies.listings[0][0];
  const product = unwrap(await dependencies.marketplace.getProductDetails(listing));
  product.pack_count = null;
  product.variants[0].pack_count = null;
  const unknown = await assembleProfile(
    listing,
    intent,
    dependencies.marketplace,
    dependencies.ai,
    undefined,
    product.variants[0].variant_id,
    product,
  );
  expect(unknown.quote.unit_price_per_100ml).toBeNull();
  product.variants[0].pack_count = 2;
  product.variants[0].volume_ml = 250;
  const known = await assembleProfile(
    listing,
    { ...intent, quantity: 2 },
    dependencies.marketplace,
    dependencies.ai,
    undefined,
    product.variants[0].variant_id,
    product,
  );
  expect(known.product.pack_count).toBe(2);
  expect(known.product.volume_ml).toBe(250);
  expect(known.quote.unit_price_per_100ml?.amount_minor).toBe(43_000);
});

it.each(["lower", "higher"] as const)(
  "orders confirmed cost per 100ml %s only when explicitly preferred",
  async (direction) => {
    const dependencies = setup();
    const original = dependencies.marketplace.getProductDetails;
    vi.spyOn(dependencies.marketplace, "getProductDetails").mockImplementation(async (listing) => {
      const product = unwrap(await original(listing));
      if (listing.listing_id === "0-value") {
        product.volume_ml = 2000;
        product.variants[0].volume_ml = 2000;
        product.variants[0].name = "1 chai 2000ml";
      }

      return { status: "ok", data: product };
    });
    const output = await runWithIntent(
      {
        ...intent,
        preferences: [
          { ...intent.preferences[0], field_path: "quote.unit_price_per_100ml", direction },
        ],
      },
      dependencies,
    );
    if (output.status !== "complete") throw new Error("Expected unit-cost comparison.");
    expect(output.result.ranking.ranked_offers[0].offer_id).toContain(
      direction === "lower" ? "0-value:" : "2-fast:",
    );
    expect(
      output.result.ranking.ranked_offers[0].preference_reasons[0].profile_field_paths,
    ).toEqual(["quote.unit_price_per_100ml"]);
  },
);
