import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ListingReviewTrail } from "../src/components/offers/ListingReviewTrail";
import { OfferResults } from "../src/components/offers/OfferResults";
import type { ListingReview, SearchReview } from "../src/domain/schemas";
import { runPipeline } from "../src/pipeline/orchestrator";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace, fixtureListings } from "../src/providers/fixtures";

const request =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM. Ưu tiên giá rẻ.";

it("evaluates relevance beyond the first 12 raw listings and accounts for every fetched listing", async () => {
  const listings = Array.from({ length: 13 }, (_, index) =>
    index === 12
      ? fixtureListings[0]
      : { ...fixtureListings[0], listing_id: `other-${index}`, title: `Other product ${index}` },
  );
  const marketplace = createFixtureMarketplace();
  vi.spyOn(marketplace, "searchProducts")
    .mockResolvedValueOnce({
      status: "ok",
      data: { items: listings, has_more: true, next_page: 2 },
    })
    .mockResolvedValueOnce({
      status: "ok",
      data: { items: [fixtureListings[0]], has_more: false, next_page: null },
    });
  const product = vi.spyOn(marketplace, "getProductDetails");
  const quote = vi.spyOn(marketplace, "getOfferQuote");
  const assessListings = vi.fn<typeof demoAI.assessListings>(async (_intent, candidates) => ({
    assessments: candidates.map((listing) => ({
      listing_id: listing.listing_id,
      seller_id: listing.seller_id,
      status:
        listing.listing_id === fixtureListings[0].listing_id
          ? ("relevant" as const)
          : ("irrelevant" as const),
      reason:
        listing.listing_id === fixtureListings[0].listing_id
          ? "Đúng sản phẩm cần tìm."
          : "Không phải điện thoại được yêu cầu.",
    })),
  }));
  const output = await runPipeline([request], {
    ai: { ...demoAI, assessListings },
    marketplace,
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  const { result } = output;
  expect(result.search_review.entries).toHaveLength(13);
  expect(result.search_review.pages_fetched).toBe(2);
  expect(result.search_review.truncated).toBe(false);
  expect(result.search_review.plan.query).toContain("iPhone");
  expect(
    result.search_review.entries.filter((entry) => entry.status === "irrelevant"),
  ).toHaveLength(12);
  expect(result.search_review.entries[12].status).toBe("eligible");
  expect(assessListings.mock.calls.map((call) => call[1].length)).toEqual([12, 1]);
  expect(product).toHaveBeenCalledOnce();
  expect(quote).toHaveBeenCalledOnce();
  expect(marketplace.searchProducts).toHaveBeenCalledTimes(2);
  const html = renderToStaticMarkup(
    createElement(OfferResults, {
      result,
      active: true,
      onApprove: vi.fn(),
      onDecline: vi.fn(),
      onRevise: vi.fn(),
    }),
  );
  expect(html).toContain("Các listing đã xem (13)");
  expect(html.match(/data-review-status=/g)).toHaveLength(13);
  expect(html).toContain("Không phải điện thoại được yêu cầu.");
  expect(html).not.toContain("Chưa đánh giá: giới hạn tìm kiếm");
  expect(html).toContain("Listing bị loại hoặc bạn bỏ qua không tính vào giới hạn");
});

it("keeps unknown checks visible without misreporting them as rejection", async () => {
  const output = await runPipeline([`${request} Bảo hành tối thiểu 12 tháng.`], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  const unknown = output.result.search_review.entries.find(
    (entry) => entry.status === "unresolved",
  );
  expect(unknown).toBeDefined();
  expect(unknown?.reasons.join(" ")).toContain("Chưa xác minh, vẫn giữ");
  expect(unknown?.selected_variant).toBeDefined();
  expect(output.result.search_review.entries.some((entry) => entry.status === "pending")).toBe(
    false,
  );
});

it("renders each outcome, exact search context, source links and SKU without conflating stages", async () => {
  const intent = await demoAI.interpretIntent([request]);
  const statuses: ListingReview["status"][] = [
    "eligible",
    "unresolved",
    "irrelevant",
    "skipped",
    "excluded",
    "pending",
    "not_evaluated",
  ];
  const review: SearchReview = {
    plan: {
      query: "iPhone 16 128GB",
      filters: [{ name: "mall", value: true, requirement_ids: [] }],
      sort_by: "price_asc",
      post_search_requirement_ids: [],
    },
    pages_fetched: 2,
    listing_limit: 12,
    page_limit: 3,
    truncated: true,
    entries: statuses.map((status, index) => ({
      listing: {
        ...fixtureListings[0],
        listing_id: `item-${index}`,
        title: `Listing ${index}`,
        url: `https://shopee.vn/product/456/${index}`,
      },
      status,
      reasons: [`Recorded reason ${index}`],
      ...(index === 0 ? { selected_variant: { variant_id: "789", name: "Đen" } } : {}),
    })),
  };
  const html = renderToStaticMarkup(createElement(ListingReviewTrail, { review, intent }));
  for (const status of statuses) expect(html).toContain(`data-review-status="${status}"`);
  expect(html).toContain("Giữ lại: còn điều kiện chưa rõ");
  expect(html).toContain("Bạn đã bỏ qua");
  expect(html).toContain("Loại: khác sản phẩm cần tìm");
  expect(html).toContain("Loại: không đạt điều kiện");
  expect(html).toContain("Chờ đánh giá SKU");
  expect(html).toContain("iPhone 16 128GB");
  expect(html).toContain("Giá tăng dần");
  expect(html).toContain("mall: true");
  expect(html).toContain('href="https://shopee.vn/product/456/0"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("SKU");
  expect(html).toContain("789");
  expect(html).toContain("Các trang chưa tải không nằm trong nhật ký.");
  expect(html.match(/Recorded reason/g)).toHaveLength(7);
});

it("shows the review trail when search returns no listings", async () => {
  const marketplace = createFixtureMarketplace();
  vi.spyOn(marketplace, "searchProducts").mockResolvedValue({
    status: "ok",
    data: { items: [], has_more: false, next_page: null },
  });
  const output = await runPipeline([request], { ai: demoAI, marketplace });
  if (output.status !== "complete") throw new Error("Expected empty completed comparison.");
  expect(output.result.search_review.entries).toEqual([]);
  const html = renderToStaticMarkup(
    createElement(ListingReviewTrail, {
      review: output.result.search_review,
      intent: output.result.intent,
    }),
  );
  expect(html).toContain("Các listing đã xem (0)");
  expect(html).toContain("Không nhận được listing nào từ các trang đã tải.");
});

it("reports an unavailable trail for old in-memory results instead of inventing an empty search", async () => {
  const intent = await demoAI.interpretIntent([request]);
  const html = renderToStaticMarkup(
    createElement(ListingReviewTrail, { review: undefined, intent }),
  );
  expect(html).toContain("Kết quả cũ chưa ghi nhật ký xét listing.");
  expect(html).not.toContain("Các listing đã xem (0)");
});
