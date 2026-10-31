import type {
  FilterResult,
  OfferProfile,
  RankingResults,
  Recommendation,
  ShoppingIntent,
  SearchReview,
} from "../domain/schemas";
import { fixtureLimitations } from "../providers/fixtures";
import { searchListingLimit } from "./search-products";
import type { PipelineDependencies } from "./types";

export function recommendOffers(
  intent: ShoppingIntent,
  profiles: OfferProfile[],
  ranking: RankingResults,
  { ai, marketplace }: PipelineDependencies,
  truncated: boolean,
  filters: FilterResult[] = [],
  review?: SearchReview,
): Recommendation {
  const recommended = ranking.ranked_offers[0];
  const unknownChecks =
    filters
      .find((filter) => filter.offer_id === recommended?.offer_id)
      ?.checks.filter((check) => check.result === "unknown") ?? [];
  const label = (id: string) =>
    intent.requirements.find((requirement) => requirement.requirement_id === id)?.user_text ?? id;

  return {
    recommended_offer_id: recommended?.offer_id ?? null,
    reasons: recommended?.preference_reasons.map((reason) => reason.reason) ?? [],
    limitations: [
      ...(review?.discovery
        ? [
            "Thương hiệu là danh sách ứng viên từ web search, không phải xếp hạng thị phần hoặc bằng chứng hiệu quả điều trị.",
            ...review.discovery.limitations,
            `Phân tích tối đa ${searchListingLimit} listing cho mỗi thương hiệu (${review.discovery.brands.length} thương hiệu), không khảo sát toàn thị trường.`,
            ...review.discovery.brands.flatMap((brand) =>
              profiles.some((profile) =>
                review.entries.some(
                  (entry) =>
                    entry.brand === brand.name &&
                    entry.listing.listing_id === profile.product.listing_id &&
                    entry.listing.seller_id === profile.seller.seller_id,
                ),
              )
                ? []
                : [`Chưa có offer được xác minh để so sánh cho ${brand.name}.`],
            ),
          ]
        : []),
      ...intent.requirements
        .filter((requirement) => !requirement.field_path)
        .map(
          (requirement) =>
            `Chưa hỗ trợ xác minh: ${requirement.user_text}. Yêu cầu vẫn được giữ; bạn cần kiểm tra trên Shopee.`,
        ),
      ...(marketplace.mode === "fixture" ? fixtureLimitations(profiles) : []),
      ...new Set(profiles.flatMap((profile) => profile.quote.limitations ?? [])),
      ...(ai.mode === "demo" ? ["AI demo theo kịch bản cố định, không gọi mô hình."] : []),
      ...(truncated && !review?.discovery
        ? [
            `Chỉ phân tích ${searchListingLimit} kết quả tìm kiếm đầu tiên; chưa bao phủ mọi kết quả.`,
          ]
        : []),
      ...(unknownChecks.length
        ? [
            `Offer đề xuất còn điều kiện chưa xác minh: ${unknownChecks.map((check) => label(check.requirement_id)).join("; ")}.`,
          ]
        : []),
      ...(!ranking.ranked_offers.length
        ? [
            profiles.length
              ? "Mọi offer đều không đạt ít nhất một điều kiện. Không tự nới yêu cầu."
              : "Chưa có offer được xác minh để đề xuất. Không tự tạo sản phẩm hoặc nới yêu cầu.",
          ]
        : []),
      ...(!intent.preferences.length
        ? ["Chưa có sở thích rõ ràng; thứ tự không thể hiện một lựa chọn tốt nhất cho bạn."]
        : []),
    ],
  };
}
