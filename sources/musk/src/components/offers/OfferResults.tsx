import { useState } from "react";
import type { OfferProfile, PipelineResult, RankedOffer } from "../../domain/schemas";
import { ListingReviewTrail } from "./ListingReviewTrail";

export function formatMoney(money: OfferProfile["quote"]["total"]) {
  if (!money) return "Chưa xác nhận";
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: money.currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  if (digits === undefined) throw new Error(`Chưa xác nhận đơn vị nhỏ nhất của ${money.currency}.`);

  return formatter.format(money.amount_minor / 10 ** digits);
}

function Evidence({ profile }: { profile: OfferProfile }) {
  const { quote, policies } = profile;

  return (
    <details className="evidence">
      <summary>
        Bằng chứng & chi tiết giá <span>＋</span>
      </summary>
      <div className="evidence-body">
        <h4>Giá cho {quote.quantity} sản phẩm</h4>
        <dl className="price-lines">
          <div>
            <dt>Đơn giá</dt>
            <dd>{formatMoney(quote.item_unit_price)}</dd>
          </div>
          <div>
            <dt>Phí vận chuyển{quote.shipping_estimated ? " (ước tính)" : ""}</dt>
            <dd>{formatMoney(quote.shipping_cost)}</dd>
          </div>
          <div>
            <dt>Phí khác</dt>
            <dd>{formatMoney(quote.other_fees)}</dd>
          </div>
          {quote.discounts.map((discount) => (
            <div key={discount.discount_id}>
              <dt>
                {discount.description} (
                {discount.applied
                  ? quote.total_estimated
                    ? "tính trong ước tính"
                    : "đã áp dụng"
                  : "chưa áp dụng"}
                )
              </dt>
              <dd>−{formatMoney(discount.amount)}</dd>
            </div>
          ))}
          <div className="total-line">
            <dt>{quote.total_estimated ? "Tổng ước tính" : "Tổng thanh toán"}</dt>
            <dd>{formatMoney(quote.total)}</dd>
          </div>
        </dl>
        {quote.limitations?.map((limitation) => (
          <p className="callout warning" key={limitation}>
            {limitation}
          </p>
        ))}
        <h4>Chính sách & giao hàng</h4>
        <p>
          Giao dự kiến: {quote.estimated_delivery_to ?? "Chưa rõ"} ·{" "}
          {quote.delivery_area ?? "Chưa xác nhận khu vực"}.
        </p>
        <p>
          Bảo hành {policies.warranty_months ?? "chưa rõ"} tháng ·{" "}
          {policies.warranty_provider ?? "Chưa xác nhận đơn vị"}. Đổi trả:{" "}
          {policies.returns_accepted === null
            ? "chưa rõ"
            : policies.returns_accepted
              ? `${policies.return_window_days ?? "?"} ngày`
              : "không"}
          .
        </p>
        <ul>
          {policies.conditions?.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
        <h4>Người mua nói gì</h4>
        {profile.review_summary.themes.map((theme, index) => (
          <blockquote key={index}>
            <span className={`badge ${theme.subject === "product" ? "neutral" : "blue"}`}>
              {theme.subject === "product" ? "Sản phẩm" : "Người bán / giao hàng"}
            </span>
            <p>{theme.description}</p>
            <small>
              {theme.matching_variant_review_count} đánh giá đúng biến thể · Nguồn:{" "}
              {theme.review_ids.join(", ")}
            </small>
          </blockquote>
        ))}
        {profile.review_summary.limitations.map((limitation) => (
          <p className="muted small" key={limitation}>
            {limitation}
          </p>
        ))}
        {profile.missing_fields.length > 0 && (
          <p className="callout warning">Chưa có dữ liệu: {profile.missing_fields.join(", ")}</p>
        )}
        <h4>Nguồn quan sát</h4>
        <ul className="source-list">
          {profile.sources.map((source, index) => (
            <li key={index}>
              <a href={source.source_url} target="_blank" rel="noreferrer">
                {source.field_path} ↗
              </a>
              <span>{source.basis}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Quan sát: {new Date(quote.observed_at).toLocaleString("vi-VN")}. Giá và điều kiện sẽ được
          kiểm tra lại sau khi duyệt.
        </p>
      </div>
    </details>
  );
}

function ProductImage({
  url,
  fallbackUrl,
  alt,
}: {
  url: string | null | undefined;
  fallbackUrl: string | null | undefined;
  alt: string;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const image = [url, fallbackUrl].find(
    (candidate) => candidate && !failedUrls.includes(candidate),
  );

  return (
    <div className="product-image">
      {image ? (
        <img
          src={image}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrls((failed) => [...failed, image])}
        />
      ) : (
        <span className="muted small" role="status">
          {url || fallbackUrl ? "Không tải được ảnh sản phẩm" : "Chưa có ảnh sản phẩm"}
        </span>
      )}
    </div>
  );
}

function OfferCard({
  profile,
  ranked,
  unknownChecks,
  selected,
  active,
  onSelect,
  withinBrand = false,
}: {
  profile: OfferProfile;
  ranked: RankedOffer;
  unknownChecks: { id: string; label: string; reason: string }[];
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  withinBrand?: boolean;
}) {
  const variant = profile.product.variants.find(
    (item) => item.variant_id === profile.selected_variant_id,
  );

  return (
    <article className={`offer-card ${selected ? "selected" : ""}`}>
      <div className="offer-top">
        <span className={`badge ${ranked.rank === 1 ? "green" : "neutral"}`}>
          {withinBrand
            ? `CÙNG THƯƠNG HIỆU #${ranked.rank}`
            : ranked.rank === 1
              ? "ĐỀ XUẤT CHO BẠN"
              : `THAM KHẢO #${ranked.rank}`}
        </span>
        {unknownChecks.length > 0 && <span className="badge warning">Chưa xác minh</span>}
        <span className="rating">
          ★ {profile.seller.rating ?? "Chưa rõ"}
          <span>/5</span>
        </span>
      </div>
      <div className="offer-product">
        <ProductImage
          url={variant?.image_url}
          fallbackUrl={profile.product.image_url}
          alt={`${profile.product.title}${variant ? ` · ${variant.name}` : ""}`}
        />
        <div>
          <p className="muted small">{variant?.name}</p>
          <h3>{profile.product.title.split(" · ")[0]}</h3>
          <p className="shop-name">
            {profile.seller.name}{" "}
            {profile.seller.is_mall === null ? (
              <span className="badge warning">Mall chưa rõ</span>
            ) : (
              profile.seller.is_mall && <span className="badge blue">Mall</span>
            )}
          </p>
          <div className="price">{formatMoney(profile.quote.total)}</div>
          <p className="muted small">
            Tổng cho {profile.quote.quantity} sản phẩm ·{" "}
            {profile.quote.total
              ? profile.quote.total_estimated
                ? "ước tính gồm giá sản phẩm và phí; cần xác nhận tại Shopee"
                : "gồm phí và giảm giá đã xác nhận"
              : "chưa xác nhận đủ giá và phí"}
          </p>
          {profile.product.brand && (
            <p className="muted small">Thương hiệu: {profile.product.brand}</p>
          )}
          {(profile.product.volume_ml !== undefined ||
            profile.product.pack_count !== undefined) && (
            <p className="muted small">
              Dung tích / sản phẩm:{" "}
              {profile.product.volume_ml ? `${profile.product.volume_ml}ml` : "Chưa rõ"} · Số sản
              phẩm / gói: {profile.product.pack_count ?? "Chưa rõ"} · Chi phí / 100ml (làm tròn, gồm
              phí): {formatMoney(profile.quote.unit_price_per_100ml ?? null)}
            </p>
          )}
        </div>
      </div>
      <div className="offer-facts">
        <div>
          <span>Giao dự kiến</span>
          <b>{profile.quote.estimated_delivery_to ?? "Chưa rõ"}</b>
        </div>
        <div>
          <span>Bảo hành</span>
          <b>
            {profile.policies.warranty_months === null
              ? "Chưa rõ"
              : `${profile.policies.warranty_months} tháng`}{" "}
            · {profile.policies.warranty_provider ?? "Chưa rõ đơn vị"}
          </b>
        </div>
      </div>
      {unknownChecks.length > 0 && (
        <div className="callout warning">
          <b>Chưa rõ, chưa được tính là đạt:</b>
          <ul>
            {unknownChecks.map((check) => (
              <li key={check.id}>
                {check.label}: {check.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="reasons">
        {ranked.preference_reasons.map((reason, index) => (
          <li key={index}>
            <span>✓</span>
            {reason.reason}
          </li>
        ))}
      </ul>
      <div className="tradeoffs">
        <b>Cân nhắc thêm</b>
        {ranked.trade_offs.map((tradeoff) => (
          <p key={tradeoff}>{tradeoff}</p>
        ))}
      </div>
      <button
        className={`button ${selected ? "selected-button" : "secondary"} full`}
        onClick={onSelect}
        disabled={!active}
        aria-pressed={selected}
      >
        {selected ? "✓ Đang chọn offer này" : "Chọn offer này"}
      </button>
      <Evidence profile={profile} />
    </article>
  );
}

export function OfferResults({
  result,
  active,
  onApprove,
  onDecline,
  onRevise,
}: {
  result: PipelineResult;
  active: boolean;
  onApprove: (profile: OfferProfile) => void;
  onDecline: () => void;
  onRevise: () => void;
}) {
  const [selectedId, setSelectedId] = useState(result.recommendation.recommended_offer_id);
  const discovery = result.search_review.discovery;
  const selected = result.profiles.find((profile) => profile.offer_id === selectedId);
  const excluded = result.filters.filter((filter) => filter.status === "excluded");
  const label = (id: string) =>
    result.intent.requirements.find((requirement) => requirement.requirement_id === id)
      ?.user_text ?? id;
  const unknownChecks = (offerId: string) =>
    (result.filters.find((filter) => filter.offer_id === offerId)?.checks ?? [])
      .filter((check) => check.result === "unknown")
      .map((check) => ({
        id: check.requirement_id,
        label: label(check.requirement_id),
        reason: check.reason,
      }));
  const unverifiedCount = result.ranking.ranked_offers.filter(
    (ranked) => unknownChecks(ranked.offer_id).length > 0,
  ).length;
  const recommended = result.profiles.find(
    (profile) => profile.offer_id === result.recommendation.recommended_offer_id,
  );
  const renderOffer = (ranked: RankedOffer, withinBrand = false) => {
    const profile = result.profiles.find((item) => item.offer_id === ranked.offer_id);
    if (!profile) throw new Error("Kết quả xếp hạng thiếu hồ sơ offer.");

    return (
      <OfferCard
        key={profile.offer_id}
        profile={profile}
        ranked={ranked}
        unknownChecks={unknownChecks(profile.offer_id)}
        selected={selectedId === profile.offer_id}
        active={active}
        onSelect={() => setSelectedId(profile.offer_id)}
        withinBrand={withinBrand}
      />
    );
  };

  const alternatives = result.ranking.ranked_offers.filter(
    (ranked) => ranked.offer_id !== recommended?.offer_id,
  );

  return (
    <section className={`result-group ${active ? "" : "superseded"}`} aria-label="Kết quả so sánh">
      {!active && (
        <div className="version-note">
          Bản tham khảo · không thể duyệt khi đang xử lý, đã dừng hoặc đã có phiên bản mới
        </div>
      )}
      <div className="result-heading">
        <span className="assistant-spark">✦</span>
        <div>
          <h2>
            {recommended ? `Musk đề xuất: ${recommended.seller.name}` : "Chưa có offer phù hợp."}
          </h2>
          <p className="muted">
            {result.ranking.ranked_offers.length}{" "}
            {result.brand_comparisons
              ? "offer dẫn đầu mỗi thương hiệu được đối chiếu"
              : "offer được giữ lại để xếp hạng"}
            {unverifiedCount > 0 && ` (${unverifiedCount} còn điều kiện chưa rõ)`} ·{" "}
            {result.profiles.length} offer đã khảo sát
          </p>
        </div>
      </div>
      {discovery && (
        <div className="callout" aria-label="Nghiên cứu thương hiệu">
          <h3>Thương hiệu ứng viên từ web search</h3>
          <p className="muted small">
            Không phải top thị phần hoặc bằng chứng hiệu quả điều trị. Nghiên cứu:{" "}
            {new Date(discovery.researched_at).toLocaleString("vi-VN")}.
          </p>
          <ol>
            {discovery.brands.map((brand) => (
              <li key={brand.name}>
                <b>{brand.name}</b>: {brand.reason}
                <ul>
                  {brand.source_urls.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {discovery.sources.find((source) => source.url === url)?.title ?? url}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {discovery.limitations.map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
        </div>
      )}
      <ListingReviewTrail review={result.search_review} intent={result.intent} />
      <div className="offer-grid">
        {result.ranking.ranked_offers
          .filter((ranked) => ranked.offer_id === recommended?.offer_id)
          .map((row) => renderOffer(row))}
      </div>
      {alternatives.length > 0 && (
        <details className="excluded alternatives">
          <summary>Xem {alternatives.length} offer khác để đối chiếu</summary>
          <p className="muted small">
            Đây là các phương án tham khảo, không phải đề xuất đồng hạng. Bạn vẫn có thể chọn phương
            án khác.
          </p>
          <div className="offer-grid">{alternatives.map((row) => renderOffer(row))}</div>
        </details>
      )}
      {result.brand_comparisons?.map((comparison) => (
        <details className="excluded alternatives" key={comparison.brand}>
          <summary>
            So sánh cùng thương hiệu: {comparison.brand} ({comparison.ranking.ranked_offers.length}{" "}
            offer)
          </summary>
          <p className="muted small">
            Xếp hạng trong nhóm trước, rồi đối chiếu offer đứng đầu mỗi nhóm giữa các thương hiệu.
          </p>
          {comparison.ranking.ranked_offers.length ? (
            <div className="offer-grid">
              {comparison.ranking.ranked_offers.map((row) => renderOffer(row, true))}
            </div>
          ) : (
            <p>Chưa có offer được xác minh và giữ lại cho thương hiệu này.</p>
          )}
        </details>
      ))}
      {excluded.length > 0 && (
        <details className="excluded">
          <summary>Vì sao không chọn {excluded.length} offer khác?</summary>
          {excluded.map((filter) => {
            const profile = result.profiles.find((item) => item.offer_id === filter.offer_id);

            return (
              <div key={filter.offer_id} className="excluded-row">
                <div>
                  <b>{profile?.seller.name}</b>
                  <span className="badge red">Không đạt</span>
                </div>
                <ul>
                  {filter.checks
                    .filter((check) => check.result !== "pass")
                    .map((check) => (
                      <li key={check.requirement_id}>
                        {label(check.requirement_id)}
                        {check.result === "unknown" ? " (chưa rõ)" : ""}: {check.reason}
                      </li>
                    ))}
                </ul>
                {profile && <Evidence profile={profile} />}
              </div>
            );
          })}
        </details>
      )}
      <div className="limitations">
        {result.recommendation.limitations.map((limitation) => (
          <p key={limitation}>ⓘ {limitation}</p>
        ))}
      </div>
      {selected && (
        <div className="approval-card">
          <div>
            <h3>Bạn chọn. Musk kiểm tra lại.</h3>
            <p>
              Duyệt {selected.seller.name} ·{" "}
              {
                selected.product.variants.find(
                  (variant) => variant.variant_id === selected.selected_variant_id,
                )?.name
              }
              {" · "}
              {selected.quote.quantity} sản phẩm · <b>{formatMoney(selected.quote.total)}</b>.
            </p>
            <p className="small muted">
              Duyệt cả giá, giao hàng và chính sách hiển thị. Có thay đổi? Musk sẽ dừng và hỏi lại.
            </p>
            {result.mode.startsWith("shopee/") && (
              <p className="small muted">
                Duyệt và kiểm tra lại sẽ xóa toàn bộ giỏ cũ, không khôi phục. Sau khi thành công,
                giỏ Shopee chỉ giữ SKU với số lượng đã duyệt. Bấm Mở giỏ hàng Shopee để tiếp tục thủ
                công. Không đặt hàng hay thanh toán.
              </p>
            )}
          </div>
          <div className="actions">
            <button
              className="button primary"
              disabled={!active}
              onClick={() => onApprove(selected)}
            >
              Duyệt & kiểm tra lại <span>→</span>
            </button>
            <button className="button text-button" disabled={!active} onClick={onDecline}>
              Không tiếp tục
            </button>
          </div>
        </div>
      )}
      <button className="button text-button revise" disabled={!active} onClick={onRevise}>
        ↶ Sửa yêu cầu trong chat
      </button>
    </section>
  );
}
