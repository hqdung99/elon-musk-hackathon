import type { AIAdapter } from "./ai";
import type { AdapterResult, MarketplaceAdapter } from "./marketplace";

export interface Activity {
  id: number;
  source: "ai" | "marketplace";
  label: string;
  detail: string | null;
  status: "running" | "done" | "error";
  started_at: number;
  ended_at: number | null;
}

export type ActivityReporter = (activity: Activity) => void;

let nextId = 1;

async function track<T>(
  report: ActivityReporter,
  source: Activity["source"],
  label: string,
  detail: string | null,
  run: () => Promise<T>,
  describe?: (result: T) => string | null,
): Promise<T> {
  const activity: Activity = {
    id: nextId++,
    source,
    label,
    detail,
    status: "running",
    started_at: Date.now(),
    ended_at: null,
  };
  report(activity);
  try {
    const result = await run();
    const outcome = describe?.(result) ?? null;
    report({
      ...activity,
      status: "done",
      detail: outcome && detail ? `${detail} · ${outcome}` : (outcome ?? detail),
      ended_at: Date.now(),
    });

    return result;
  } catch (error) {
    report({ ...activity, status: "error", ended_at: Date.now() });
    throw error;
  }
}

const count = (unit: string) => (value: { length: number }) => `${value.length} ${unit}`;
const counted =
  <T>(unit: string, items: (data: T) => { length: number }) =>
  (result: AdapterResult<T>) =>
    result.status === "ok" ? count(unit)(items(result.data)) : null;

// Reports every model call so a slow request shows what Musk is waiting on, not just the stage.
export function trackAI(ai: AIAdapter, report: ActivityReporter): AIAdapter {
  const step = <T>(label: string, detail: string | null, run: () => Promise<T>) =>
    track(report, "ai", label, detail, run);

  return {
    ...ai,
    interpretTurn: (text, context, signal) =>
      step("AI đọc tin nhắn của bạn", null, () => ai.interpretTurn(text, context, signal)),
    answerResults: (text, context, signal) =>
      step("AI soạn câu trả lời", null, () => ai.answerResults(text, context, signal)),
    interpretIntent: (messages, signal) =>
      step("AI phân tích yêu cầu", null, () => ai.interpretIntent(messages, signal)),
    buildSearchPlan: (intent, capabilities, signal) =>
      step("AI lập kế hoạch tìm kiếm", intent.product_description, () =>
        ai.buildSearchPlan(intent, capabilities, signal),
      ),
    assessListings: (intent, listings, signal) =>
      step("AI kiểm tra mức liên quan", count("listing")(listings), () =>
        ai.assessListings(intent, listings, signal),
      ),
    summarizeReviews: (reviews, variantId, signal) =>
      step("AI tóm tắt đánh giá", count("đánh giá")(reviews), () =>
        ai.summarizeReviews(reviews, variantId, signal),
      ),
    rankOffers: (intent, profiles, signal) =>
      step("AI so sánh các lựa chọn", count("lựa chọn")(profiles), () =>
        ai.rankOffers(intent, profiles, signal),
      ),
  };
}

export function trackMarketplace(
  marketplace: MarketplaceAdapter,
  report: ActivityReporter,
): MarketplaceAdapter {
  return {
    ...marketplace,
    getSearchCapabilities: (keyword, signal) =>
      track(report, "marketplace", "Đọc bộ lọc tìm kiếm", keyword, () =>
        marketplace.getSearchCapabilities(keyword, signal),
      ),
    searchProducts: (plan, page, signal) =>
      track(
        report,
        "marketplace",
        `Tìm “${plan.query}”`,
        `trang ${page}`,
        () => marketplace.searchProducts(plan, page, signal),
        counted("kết quả", (data) => data.items),
      ),
    getProductDetails: (listing, signal) =>
      track(report, "marketplace", "Đọc chi tiết sản phẩm", listing.title, () =>
        marketplace.getProductDetails(listing, signal),
      ),
    getSellerDetails: (listing, signal) =>
      track(report, "marketplace", "Đọc thông tin shop", listing.title, () =>
        marketplace.getSellerDetails(listing, signal),
      ),
    getReviews: (listing, signal) =>
      track(
        report,
        "marketplace",
        "Đọc đánh giá",
        listing.title,
        () => marketplace.getReviews(listing, signal),
        counted("đánh giá", (data) => data),
      ),
    getOfferQuote: (listing, variantId, buyer, signal) =>
      track(report, "marketplace", "Lấy báo giá & phí ship", listing.title, () =>
        marketplace.getOfferQuote(listing, variantId, buyer, signal),
      ),
    getPurchasePolicies: (listing, variantId, signal) =>
      track(report, "marketplace", "Đọc chính sách bảo hành, đổi trả", listing.title, () =>
        marketplace.getPurchasePolicies(listing, variantId, signal),
      ),
  };
}
