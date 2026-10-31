import { z } from "zod";
import { isSelectableVariant, listingKey } from "../domain/schemas";
import type { ProductDetails, ShoppingIntent } from "../domain/schemas";
import type { PreparedSearch, PipelineDependencies, VariantChoices } from "./types";

export const variantDecisionSchema = z.object({
  status: z.enum(["selected", "no_match", "uncertain"]),
  variant_id: z.string().nullable(),
  reason: z.string().min(1),
  ambiguous_variant_ids: z.array(z.string()).default([]),
});

export type VariantDecision = z.input<typeof variantDecisionSchema>;

function fallbackVariant(intent: ShoppingIntent, product: ProductDetails) {
  const candidates = product.variants.filter((variant) =>
    intent.requirements.every((requirement) => {
      const actual =
        requirement.field_path === "product.storage_gb"
          ? (variant.storage_gb ?? product.storage_gb)
          : requirement.field_path === "product.model"
            ? (variant.model ?? product.model)
            : null;
      if (actual == null || requirement.value == null) return true;
      if (requirement.operator === "eq") return actual === requirement.value;
      if (
        requirement.operator === "gte" &&
        typeof actual === "number" &&
        typeof requirement.value === "number"
      )
        return actual >= requirement.value;
      if (
        requirement.operator === "lte" &&
        typeof actual === "number" &&
        typeof requirement.value === "number"
      )
        return actual <= requirement.value;

      return true;
    }),
  );

  return (
    candidates.find((variant) => variant.variant_id === product.default_variant_id) ?? candidates[0]
  );
}

export async function selectVariants(
  prepared: PreparedSearch,
  { ai, signal }: PipelineDependencies,
): Promise<VariantChoices | null> {
  const choices: VariantChoices = {};
  let needsSelection = false;
  for (const { listing, product } of prepared.candidates) {
    signal?.throwIfAborted();
    const entry = prepared.search_review.entries.find(
      (entry) => listingKey(entry.listing) === listingKey(listing),
    );
    if (!entry) throw new Error("Nhật ký tìm kiếm thiếu listing chọn SKU.");
    const variants = product.variants.filter((variant) =>
      isSelectableVariant(variant, prepared.intent.quantity ?? 1),
    );
    if (variants.length !== product.variants.length)
      entry.reasons.push(
        "Không chọn SKU không khả dụng hoặc không đủ tồn kho theo dữ liệu sản phẩm.",
      );
    if (!variants.length) {
      choices[listingKey(listing)] = null;
      entry.reasons.push("Không có SKU khả dụng cho số lượng yêu cầu; bỏ qua listing.");
      continue;
    }

    const selectableProduct = {
      ...product,
      variants,
      default_variant_id:
        variants.find((variant) => variant.variant_id === product.default_variant_id)?.variant_id ??
        null,
    };
    const decision = variantDecisionSchema.parse(
      await ai.chooseVariant(prepared.intent, selectableProduct, signal),
    );
    if (
      decision.status === "selected" &&
      !product.variants.some((variant) => variant.variant_id === decision.variant_id)
    )
      throw new Error("AI chọn SKU không tồn tại trong listing.");
    if (
      decision.status === "selected" &&
      !variants.some((variant) => variant.variant_id === decision.variant_id)
    )
      throw new Error("AI chọn SKU không khả dụng hoặc không đủ tồn kho.");
    if (decision.status !== "selected" && decision.variant_id !== null)
      throw new Error("Quyết định SKU chưa xác nhận không được chứa variant_id.");
    if (
      decision.ambiguous_variant_ids.some(
        (id) => !product.variants.some((variant) => variant.variant_id === id),
      )
    )
      throw new Error("AI tham chiếu SKU không tồn tại khi giải thích lựa chọn chưa rõ.");
    if (
      decision.ambiguous_variant_ids.some(
        (id) => !variants.some((variant) => variant.variant_id === id),
      )
    )
      throw new Error("AI tham chiếu SKU không khả dụng khi giải thích lựa chọn chưa rõ.");
    entry.reasons.push(`Chọn SKU: ${decision.reason}`);
    if (decision.status === "uncertain") {
      if (new Set(decision.ambiguous_variant_ids).size >= 2) needsSelection = true;
      else {
        const selected = fallbackVariant(prepared.intent, selectableProduct);
        choices[listingKey(listing)] = selected?.variant_id ?? null;
        entry.reasons.push(
          selected
            ? `Tự chọn ${selected.name}; thông tin chưa xác minh vẫn giữ nguyên, không được coi là đã đáp ứng yêu cầu.`
            : "Không có SKU không mâu thuẫn yêu cầu đã biết; bỏ qua listing.",
        );
      }
    } else choices[listingKey(listing)] = decision.variant_id;
  }

  // Preserve confident suggestions if a specific constraint needs a user choice.
  prepared.suggested_choices = choices;

  return needsSelection ? null : choices;
}
