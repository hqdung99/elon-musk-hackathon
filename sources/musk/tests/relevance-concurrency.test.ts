import { expect, it } from "vitest";
import { listingKey } from "../src/domain/schemas";
import { runPipeline } from "../src/pipeline/orchestrator";
import { prepareSearch } from "../src/pipeline/profiles";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";

it("assesses relevance batches concurrently (max 4) and keeps search order", async () => {
  const marketplace = createFixtureMarketplace();
  const [template] = fixtureListings;
  const listings = Array.from({ length: 60 }, (_, index) => ({
    ...template,
    listing_id: String(1000 + index),
    title: `iPhone 16 128GB #${index}`,
  }));
  const intent = await demoAI.interpretIntent([
    "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM.",
  ]);
  let inFlight = 0;
  let peak = 0;
  const prepared = await prepareSearch(
    {
      listings,
      truncated: false,
      search_review: {
        plan: { query: "iPhone 16", filters: [], sort_by: null, post_search_requirement_ids: [] },
        pages_fetched: 1,
        listing_limit: 12,
        page_limit: 3,
        truncated: false,
        entries: listings.map((listing) => ({ listing, status: "pending", reasons: [] })),
      },
    },
    intent,
    {
      ai: {
        ...demoAI,
        async assessListings(_intent, batch) {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          // Earlier batches finish later, so completion order is the reverse of search order.
          await new Promise((resolve) =>
            setTimeout(resolve, 50 - Number(batch[0].listing_id) / 100),
          );
          inFlight -= 1;

          return {
            assessments: batch.map((listing) => ({
              listing_id: listing.listing_id,
              seller_id: listing.seller_id,
              status: Number(listing.listing_id) % 2 ? "irrelevant" : "relevant",
              reason: "Tiêu đề kiểm tra.",
            })),
          };
        },
      },
      marketplace: {
        ...marketplace,
        async getProductDetails(listing) {
          const result = await marketplace.getProductDetails(template);
          if (result.status !== "ok") return result;

          return { status: "ok", data: { ...result.data, listing_id: listing.listing_id } };
        },
      },
    },
  );
  expect(peak).toBe(4);
  expect(prepared.candidates.map(({ listing }) => listing.listing_id)).toEqual(
    listings.filter((_, index) => index % 2 === 0).map((listing) => listing.listing_id),
  );
  expect(prepared.search_review.entries.map((entry) => entry.status)).toEqual(
    listings.map((_, index) => (index % 2 ? "irrelevant" : "pending")),
  );
  expect(new Set(prepared.candidates.map(({ listing }) => listingKey(listing))).size).toBe(30);
});

it("summarizes reviews for up to 4 listings at once and keeps profile order", async () => {
  const marketplace = createFixtureMarketplace();
  const listings = Array.from({ length: 10 }, (_, index) => ({
    ...fixtureListings[0],
    seller_id: `${fixtureListings[0].seller_id}-${index}`,
  }));
  let inFlight = 0;
  let peak = 0;
  const output = await runPipeline(
    ["Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM. Ưu tiên giá rẻ."],
    {
      ai: {
        ...demoAI,
        async summarizeReviews(reviews, variantId) {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;

          return demoAI.summarizeReviews(reviews, variantId);
        },
      },
      marketplace: {
        ...marketplace,
        async searchProducts() {
          return { status: "ok", data: { items: listings, has_more: false, next_page: null } };
        },
      },
    },
  );
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  expect(peak).toBe(4);
  expect(output.result.profiles.map((profile) => profile.seller.seller_id)).toEqual(
    listings.map((listing) => listing.seller_id),
  );
});
