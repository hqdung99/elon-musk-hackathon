import { listingKey } from "../../domain/schemas";
import type { ListingReview, SearchReview, ShoppingIntent } from "../../domain/schemas";

const outcomes: Record<ListingReview["status"], { label: string; badge: string }> = {
  pending: { label: "Chờ đánh giá SKU", badge: "neutral" },
  irrelevant: { label: "Loại: khác sản phẩm cần tìm", badge: "red" },
  skipped: { label: "Bạn đã bỏ qua", badge: "neutral" },
  excluded: { label: "Loại: không đạt điều kiện", badge: "red" },
  eligible: { label: "Giữ lại để xếp hạng", badge: "green" },
  unresolved: { label: "Giữ lại: còn điều kiện chưa rõ", badge: "warning" },
  not_evaluated: { label: "Chưa đánh giá: giới hạn tìm kiếm", badge: "neutral" },
};

export function ListingReviewTrail({
  review,
  intent,
}: {
  review: SearchReview | undefined;
  intent: ShoppingIntent;
}) {
  if (!review)
    return (
      <p className="callout warning">
        Kết quả cũ chưa ghi nhật ký xét listing. Gửi lại yêu cầu để xem danh sách và lý do.
      </p>
    );
  const count = (...statuses: ListingReview["status"][]) =>
    review.entries.filter((entry) => statuses.includes(entry.status)).length;
  const filters = review.plan.filters.map((filter) =>
    filter.requirement_ids.length
      ? filter.requirement_ids
          .map(
            (id) =>
              intent.requirements.find((requirement) => requirement.requirement_id === id)
                ?.user_text ?? id,
          )
          .join(", ")
      : `${filter.name}: ${JSON.stringify(filter.value)}`,
  );
  const sorts: Record<string, string> = {
    relevancy: "Liên quan",
    price_asc: "Giá tăng dần",
    price_desc: "Giá giảm dần",
  };
  const sort = review.plan.sort_by;

  return (
    <details className="listing-review" aria-label="Nhật ký xét listing">
      <summary>
        <b>Các listing đã xem ({review.entries.length})</b>
        <span>
          {count("eligible", "unresolved")} giữ lại · {count("irrelevant", "excluded", "skipped")}{" "}
          loại / bỏ qua · {count("pending")} chờ đánh giá SKU · {count("not_evaluated")} chưa đánh
          giá
        </span>
      </summary>
      <div className="listing-review-body">
        <p>
          Từ khóa: <b>{review.plan.query}</b> · Sắp xếp: {sort ? (sorts[sort] ?? sort) : "Mặc định"}
        </p>
        <p>Bộ lọc API: {filters.join(" · ") || "Không có"}</p>
        <p className="muted">
          Đã tải {review.pages_fetched} trang, phân tích {review.entries.length} listing duy nhất
          không quảng cáo. Musk chỉ phân tích {review.listing_limit} kết quả đầu tiên (tối đa{" "}
          {review.page_limit} trang để bù quảng cáo).
        </p>
        {review.truncated && (
          <p className="callout warning">
            Shopee còn thêm kết quả ngoài {review.listing_limit} kết quả đầu tiên; các kết quả đó
            không được tải hay phân tích và không nằm trong nhật ký.
          </p>
        )}
        {review.entries.length === 0 ? (
          <p>Không nhận được listing nào từ các trang đã tải.</p>
        ) : (
          <ol className="listing-review-list">
            {review.entries.map((entry) => (
              <li key={listingKey(entry.listing)} data-review-status={entry.status}>
                <a href={entry.listing.url} target="_blank" rel="noopener noreferrer">
                  {entry.listing.title}
                </a>
                <p className="muted">
                  {entry.seller_name ?? `Shop ${entry.listing.seller_id}`} · Listing{" "}
                  {entry.listing.listing_id}
                </p>
                <span className={`badge ${outcomes[entry.status].badge}`}>
                  {outcomes[entry.status].label}
                </span>
                {entry.selected_variant && (
                  <p className="muted">
                    Biến thể: {entry.selected_variant.name} · SKU{" "}
                    {entry.selected_variant.variant_id}
                  </p>
                )}
                <ul>
                  {entry.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
