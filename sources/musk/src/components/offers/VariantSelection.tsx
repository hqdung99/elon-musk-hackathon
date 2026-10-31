import { useState } from "react";
import { isSelectableVariant, listingKey } from "../../domain/schemas";
import type { PreparedSearch, VariantChoices } from "../../pipeline/types";
import { ListingReviewTrail } from "./ListingReviewTrail";

const skip = "__skip__";

export function VariantSelection({
  prepared,
  onContinue,
}: {
  prepared: PreparedSearch;
  onContinue: (choices: VariantChoices) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      prepared.candidates.map(({ listing, product }) => {
        const key = listingKey(listing);
        const variants = product.variants.filter((variant) =>
          isSelectableVariant(variant, prepared.intent.quantity ?? 1),
        );
        const suggestion = prepared.suggested_choices?.[key];
        const value = !variants.length
          ? skip
          : prepared.suggested_choices
            ? Object.hasOwn(prepared.suggested_choices, key)
              ? suggestion === null
                ? skip
                : (variants.find((variant) => variant.variant_id === suggestion)?.variant_id ?? "")
              : ""
            : (variants.find((variant) => variant.variant_id === product.default_variant_id)
                ?.variant_id ?? (variants.length === 1 ? variants[0].variant_id : ""));

        return [key, value];
      }),
    ),
  );
  const ready =
    prepared.candidates.every(({ listing, product }) => {
      const value = values[listingKey(listing)];

      return (
        value === skip ||
        product.variants.some(
          (variant) =>
            variant.variant_id === value &&
            isSelectableVariant(variant, prepared.intent.quantity ?? 1),
        )
      );
    }) && Object.values(values).some((value) => value !== skip);

  return (
    <section className="variant-selection" aria-label="Chọn biến thể">
      <div className="eyebrow">CẦN XÁC NHẬN YÊU CẦU BIẾN THỂ</div>
      <h2>Xác nhận biến thể chưa rõ</h2>
      <p className="muted">
        Musk chưa xác định được SKU đáp ứng yêu cầu cụ thể từ thông tin biến thể. Xem lý do trong
        nhật ký, chọn SKU phù hợp hoặc bỏ qua listing. Sau khi tiếp tục, Musk xóa toàn bộ giỏ cũ,
        không khôi phục; chỉ thêm một SKU mỗi lần để kiểm tra giá và phí ship rồi dọn giỏ trống
        trước phương án tiếp theo. Không chỉnh sửa giỏ trong lúc xử lý. Không đặt hàng.
      </p>
      <ListingReviewTrail review={prepared.search_review} intent={prepared.intent} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          onContinue(
            Object.fromEntries(
              Object.entries(values).map(([key, value]) => [key, value === skip ? null : value]),
            ),
          );
        }}
      >
        {prepared.candidates.map(({ listing, product, relevance }) => {
          const key = listingKey(listing);

          return (
            <div className="variant-choice" key={key}>
              <a href={listing.url} target="_blank" rel="noreferrer">
                {product.title}
              </a>
              {relevance === "unknown" && (
                <p className="small muted">Mức liên quan chưa rõ; vẫn giữ để bạn kiểm tra.</p>
              )}
              <label htmlFor={`variant-${key}`}>Biến thể · {product.title}</label>
              <select
                id={`variant-${key}`}
                required
                value={values[key]}
                onChange={(event) => setValues({ ...values, [key]: event.target.value })}
              >
                <option value="" disabled>
                  Chọn biến thể
                </option>
                <option value={skip}>Bỏ qua sản phẩm này</option>
                {product.variants.map((variant) => (
                  <option
                    key={variant.variant_id}
                    value={variant.variant_id}
                    disabled={!isSelectableVariant(variant, prepared.intent.quantity ?? 1)}
                  >
                    {variant.name}
                    {!isSelectableVariant(variant, prepared.intent.quantity ?? 1) &&
                      " · Không khả dụng"}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <button className="button primary" type="submit" disabled={!ready}>
          Tiếp tục với biến thể đã chọn
        </button>
      </form>
    </section>
  );
}
