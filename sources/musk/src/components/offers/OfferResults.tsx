import { useState } from "react";
import type { ReactNode } from "react";
import type { OfferProfile, PipelineResult, RankedOffer } from "../../domain/schemas";
import { ListingReviewTrail } from "./ListingReviewTrail";
import { MissingDataNotes } from "../data-notes";

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
        {(profile.product.brand ||
          profile.product.volume_ml !== undefined ||
          profile.product.pack_count !== undefined) && (
          <>
            <h4>Thông tin sản phẩm</h4>
            <p>
              Thương hiệu: {profile.product.brand ?? "Chưa rõ"} · Dung tích:{" "}
              {profile.product.volume_ml ? `${profile.product.volume_ml}ml` : "Chưa rõ"} · Số sản
              phẩm / gói: {profile.product.pack_count ?? "Chưa rõ"}.
            </p>
            <p>
              Chi phí / 100ml (làm tròn, gồm phí): {formatMoney(quote.unit_price_per_100ml ?? null)}
              .
            </p>
          </>
        )}
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
        <MissingDataNotes fields={profile.missing_fields} />
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

  if (!url && !fallbackUrl) return null;

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
          Không tải được ảnh sản phẩm
        </span>
      )}
    </div>
  );
}

type UnknownCheck = { id: string; label: string; reason: string };

interface ComparisonOffer {
  profile: OfferProfile;
  ranked: RankedOffer;
  unknownChecks: UnknownCheck[];
}

function OfferDetails({ ranked, unknownChecks }: Omit<ComparisonOffer, "profile">) {
  return (
    <details className="offer-details">
      <summary>Lý do chọn & lưu ý</summary>
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
      {ranked.trade_offs.length > 0 && (
        <div className="tradeoffs">
          <b>Cân nhắc thêm</b>
          {ranked.trade_offs.map((tradeoff) => (
            <p key={tradeoff}>{tradeoff}</p>
          ))}
        </div>
      )}
    </details>
  );
}

function ComparisonTable({
  offers,
  selectedId,
  active,
  onSelect,
  label,
  withinBrand = false,
  showPackage,
}: {
  offers: ComparisonOffer[];
  selectedId: string | null;
  active: boolean;
  onSelect: (id: string) => void;
  label: string;
  withinBrand?: boolean;
  showPackage: boolean;
}) {
  const rows: { label: string; render: (offer: ComparisonOffer) => ReactNode }[] = [
    {
      label: "Biến thể",
      render: ({ profile }) =>
        profile.product.variants.find(
          (variant) => variant.variant_id === profile.selected_variant_id,
        )?.name ?? null,
    },
    {
      label: "Người bán",
      render: ({ profile }) => (
        <>
          <b>{profile.seller.name}</b>
          {(profile.seller.is_mall !== null || profile.seller.rating !== null) && (
            <small>
              {[
                profile.seller.is_mall === null
                  ? null
                  : profile.seller.is_mall
                    ? "Mall"
                    : "Shop thường",
                profile.seller.rating === null ? null : `★ ${profile.seller.rating}/5`,
              ]
                .filter((fact) => fact !== null)
                .join(" · ")}
            </small>
          )}
        </>
      ),
    },
    {
      label: "Tổng tiền",
      render: ({ profile }) => (
        <>
          <b className="comparison-price">{formatMoney(profile.quote.total)}</b>
          <small>
            {profile.quote.quantity} sản phẩm
            {profile.quote.total_estimated ? " · Ước tính, cần xác nhận tại Shopee" : ""}
          </small>
        </>
      ),
    },
    {
      label: "Giao dự kiến",
      render: ({ profile }) => profile.quote.estimated_delivery_to,
    },
    {
      label: "Bảo hành",
      render: ({ profile }) =>
        profile.policies.warranty_months === null
          ? null
          : `${profile.policies.warranty_months} tháng`,
    },
    {
      label: "Tồn kho",
      render: ({ profile }) =>
        profile.quote.in_stock === false
          ? "Hết hàng"
          : profile.quote.in_stock === true &&
              profile.sources.some((source) => source.field_path === "quote.in_stock")
            ? "Còn hàng"
            : null,
    },
  ];
  if (showPackage)
    rows.push(
      {
        label: "Dung tích / sản phẩm",
        render: ({ profile }) =>
          profile.product.volume_ml ? `${profile.product.volume_ml}ml` : null,
      },
      { label: "Sản phẩm / gói", render: ({ profile }) => profile.product.pack_count ?? null },
      {
        label: "Chi phí / 100ml",
        render: ({ profile }) =>
          profile.quote.unit_price_per_100ml ? (
            <>
              {formatMoney(profile.quote.unit_price_per_100ml ?? null)}
              <small>Làm tròn, gồm phí{profile.quote.total_estimated ? " · Ước tính" : ""}</small>
            </>
          ) : null,
      },
    );
  rows.push(
    {
      label: "Điều kiện",
      render: ({ unknownChecks }) =>
        unknownChecks.length ? (
          <span className="comparison-unknown">
            Chưa rõ: {unknownChecks.map((check) => check.label).join(" · ")}
          </span>
        ) : (
          "Đạt các kiểm tra hiện có"
        ),
    },
    {
      label: "Chi tiết",
      render: ({ profile, ranked, unknownChecks }) => (
        <>
          <OfferDetails ranked={ranked} unknownChecks={unknownChecks} />
          <Evidence profile={profile} />
        </>
      ),
    },
  );

  return (
    <div className="comparison-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="comparison-table" style={{ minWidth: 144 + offers.length * 220 }}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Tiêu chí</th>
            {offers.map(({ profile, ranked }) => {
              const variant = profile.product.variants.find(
                (item) => item.variant_id === profile.selected_variant_id,
              );

              return (
                <th
                  scope="col"
                  key={profile.offer_id}
                  className={selectedId === profile.offer_id ? "comparison-selected" : ""}
                >
                  <span className={`badge ${ranked.rank === 1 ? "green" : "neutral"}`}>
                    {withinBrand
                      ? `CÙNG THƯƠNG HIỆU #${ranked.rank}`
                      : ranked.rank === 1
                        ? "Đề xuất"
                        : `THAM KHẢO #${ranked.rank}`}
                  </span>
                  <div className="comparison-product">
                    <ProductImage
                      url={variant?.image_url}
                      fallbackUrl={profile.product.image_url}
                      alt={`${profile.product.title} · ${variant?.name ?? ""}`}
                    />
                    <b title={profile.product.title}>{profile.product.title.split(" · ")[0]}</b>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((row) => offers.some((offer) => row.render(offer) != null))
            .map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {offers.map((offer) => (
                  <td
                    key={offer.profile.offer_id}
                    className={selectedId === offer.profile.offer_id ? "comparison-selected" : ""}
                  >
                    {row.render(offer) ?? <span aria-label="Chưa có dữ liệu">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          <tr>
            <th scope="row">Lựa chọn</th>
            {offers.map(({ profile }) => (
              <td
                key={profile.offer_id}
                className={selectedId === profile.offer_id ? "comparison-selected" : ""}
              >
                <button
                  className={`button ${selectedId === profile.offer_id ? "selected-button" : "secondary"} full`}
                  onClick={() => onSelect(profile.offer_id)}
                  disabled={!active}
                  aria-pressed={selectedId === profile.offer_id}
                >
                  {selectedId === profile.offer_id ? "✓ Đang chọn offer này" : "Chọn offer này"}
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
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
}: {
  profile: OfferProfile;
  ranked: RankedOffer;
  unknownChecks: UnknownCheck[];
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const variant = profile.product.variants.find(
    (item) => item.variant_id === profile.selected_variant_id,
  );

  return (
    <article className={`offer-card ${selected ? "selected" : ""}`}>
      <div className="offer-top">
        <span className={`badge ${ranked.rank === 1 ? "green" : "neutral"}`}>ĐỀ XUẤT CHO BẠN</span>
        {unknownChecks.length > 0 && <span className="badge warning">Chưa xác minh</span>}
        {profile.seller.rating !== null && (
          <span className="rating">
            ★ {profile.seller.rating}
            <span>/5</span>
          </span>
        )}
      </div>
      <div className="offer-product">
        <ProductImage
          url={variant?.image_url}
          fallbackUrl={profile.product.image_url}
          alt={`${profile.product.title}${variant ? ` · ${variant.name}` : ""}`}
        />
        <div>
          <p className="muted small">{variant?.name}</p>
          <h3 title={profile.product.title}>{profile.product.title.split(" · ")[0]}</h3>
          <p className="shop-name">
            {profile.seller.name}{" "}
            {profile.seller.is_mall && <span className="badge blue">Mall</span>}
          </p>
          <div className="price">{formatMoney(profile.quote.total)}</div>
          <p className="muted small">
            {profile.quote.quantity} sản phẩm ·{" "}
            {profile.quote.total
              ? profile.quote.total_estimated
                ? "Ước tính, cần xác nhận tại Shopee"
                : "Gồm phí & giảm giá"
              : "Chưa xác nhận tổng tiền"}
          </p>
          {profile.product.brand && (
            <p className="muted small">Thương hiệu: {profile.product.brand}</p>
          )}
          {(profile.product.volume_ml != null || profile.product.pack_count != null) && (
            <p className="muted small">
              {[
                profile.product.volume_ml ? `${profile.product.volume_ml}ml` : null,
                profile.product.pack_count != null
                  ? `${profile.product.pack_count} sản phẩm / gói`
                  : null,
              ]
                .filter((fact) => fact !== null)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
      {(profile.quote.estimated_delivery_to != null ||
        profile.policies.warranty_months !== null) && (
        <div className="offer-facts">
          {profile.quote.estimated_delivery_to != null && (
            <div>
              <span>Giao dự kiến</span>
              <b>{profile.quote.estimated_delivery_to}</b>
            </div>
          )}
          {profile.policies.warranty_months !== null && (
            <div>
              <span>Bảo hành</span>
              <b>{profile.policies.warranty_months} tháng</b>
            </div>
          )}
        </div>
      )}
      {unknownChecks.length > 0 && (
        <p className="callout warning">
          Chưa rõ: {unknownChecks.map((check) => check.label).join(" · ")}
        </p>
      )}
      <button
        className={`button ${selected ? "selected-button" : "secondary"} full`}
        onClick={onSelect}
        disabled={!active}
        aria-pressed={selected}
      >
        {selected ? "✓ Đang chọn offer này" : "Chọn offer này"}
      </button>
      <OfferDetails ranked={ranked} unknownChecks={unknownChecks} />
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
      ?.user_text ?? (id === "availability" ? "Tồn kho" : id === "quantity" ? "Số lượng" : id);
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
  const comparisonOffer = (ranked: RankedOffer): ComparisonOffer => {
    const profile = result.profiles.find((item) => item.offer_id === ranked.offer_id);
    if (!profile) throw new Error("Kết quả xếp hạng thiếu hồ sơ offer.");

    return { profile, ranked, unknownChecks: unknownChecks(profile.offer_id) };
  };

  const showPackage =
    Boolean(discovery) ||
    result.profiles.some(
      (profile) => profile.product.volume_ml != null || profile.product.pack_count != null,
    ) ||
    [...result.intent.requirements, ...result.intent.preferences].some((item) =>
      ["product.volume_ml", "product.pack_count", "quote.unit_price_per_100ml"].includes(
        item.field_path ?? "",
      ),
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
            {result.profiles.length} offer đã xem · {result.ranking.ranked_offers.length}{" "}
            {result.brand_comparisons ? "đại diện thương hiệu" : "giữ lại"}
            {unverifiedCount > 0 && ` · ${unverifiedCount} chưa xác minh`}
          </p>
        </div>
      </div>
      {discovery && (
        <details className="excluded brand-research" aria-label="Nghiên cứu thương hiệu">
          <summary>{discovery.brands.length} thương hiệu ứng viên · nguồn web</summary>
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
        </details>
      )}
      <ListingReviewTrail review={result.search_review} intent={result.intent} />
      <div className="offer-grid">
        {result.ranking.ranked_offers
          .filter((ranked) => ranked.offer_id === recommended?.offer_id)
          .map((row) => (
            <OfferCard
              key={row.offer_id}
              {...comparisonOffer(row)}
              selected={selectedId === row.offer_id}
              active={active}
              onSelect={() => setSelectedId(row.offer_id)}
            />
          ))}
      </div>
      {result.ranking.ranked_offers.length > 1 && (
        <ComparisonTable
          offers={result.ranking.ranked_offers.map(comparisonOffer)}
          selectedId={selectedId}
          active={active}
          onSelect={setSelectedId}
          showPackage={showPackage}
          label={result.brand_comparisons ? "So sánh giữa các thương hiệu" : "So sánh offer"}
        />
      )}
      {result.brand_comparisons?.map((comparison) => (
        <details className="excluded alternatives" key={comparison.brand}>
          <summary>
            So sánh cùng thương hiệu: {comparison.brand} ({comparison.ranking.ranked_offers.length}{" "}
            offer)
          </summary>
          {comparison.ranking.ranked_offers.length ? (
            <ComparisonTable
              offers={comparison.ranking.ranked_offers.map(comparisonOffer)}
              selectedId={selectedId}
              active={active}
              onSelect={setSelectedId}
              withinBrand
              showPackage={showPackage}
              label={`So sánh ${comparison.brand}`}
            />
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
      <p className="result-disclosure muted small">
        {result.mode.startsWith("fixture/")
          ? "Dữ liệu giả lập, không phải báo giá Shopee."
          : result.mode.endsWith("/demo")
            ? "AI demo theo kịch bản cố định."
            : "Giá và điều kiện có thể thay đổi."}
      </p>
      <details className="limitations">
        <summary>Giới hạn & nguồn dữ liệu</summary>
        {result.recommendation.limitations.map((limitation) => (
          <p key={limitation}>ⓘ {limitation}</p>
        ))}
      </details>
      {selected && (
        <div className="approval-card">
          <div>
            <h3>Xác nhận lựa chọn</h3>
            <p>
              {selected.seller.name} ·{" "}
              {
                selected.product.variants.find(
                  (variant) => variant.variant_id === selected.selected_variant_id,
                )?.name
              }
              {" · "}
              {selected.quote.quantity} sản phẩm · <b>{formatMoney(selected.quote.total)}</b>.
            </p>
            <p className="small muted">
              Duyệt giá, giao hàng và chính sách; Musk kiểm tra lại trước khi tiếp tục.
            </p>
            {result.mode.startsWith("shopee/") && (
              <p className="small muted">
                Kiểm tra lại sẽ xóa toàn bộ giỏ cũ, không khôi phục; giỏ Shopee chỉ giữ SKU với số
                lượng đã duyệt. Không đặt hàng hay thanh toán.
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
