import { z } from "zod";
import { normalizeBrand } from "./schemas";
import type {
  FieldPath,
  FilterResult,
  Money,
  OfferProfile,
  OfferQuote,
  Requirement,
  RequirementCheck,
  SearchCapabilities,
  SearchPlan,
  ShoppingIntent,
} from "./schemas";

export function calculateTotal(quote: OfferQuote): Money | null {
  const { item_unit_price: item, shipping_cost: ship, other_fees: fees, quantity } = quote;
  if (!item || !ship || !fees) return null;
  const applied = quote.discounts.filter((discount) => discount.applied);
  if (applied.some((discount) => discount.eligible !== true || !discount.amount)) return null;
  const amounts = [
    item,
    ship,
    fees,
    ...applied.flatMap((discount) => (discount.amount ? [discount.amount] : [])),
  ];
  if (amounts.some((amount) => amount.currency !== item.currency)) return null;
  const total =
    item.amount_minor * quantity +
    ship.amount_minor +
    fees.amount_minor -
    applied.reduce((sum, discount) => sum + (discount.amount?.amount_minor ?? 0), 0);

  return Number.isSafeInteger(total) && total >= 0
    ? { amount_minor: total, currency: item.currency }
    : null;
}

export function fieldValue(
  profile: OfferProfile,
  path: FieldPath,
): string | number | boolean | Money | null {
  switch (path) {
    case "product.model":
      return profile.product.model;
    case "product.storage_gb":
      return profile.product.storage_gb;
    case "product.condition":
      return profile.product.condition;
    case "product.brand":
      return profile.product.brand ?? null;
    case "product.volume_ml":
      return profile.product.volume_ml ?? null;
    case "product.pack_count":
      return profile.product.pack_count ?? null;
    case "seller.is_mall":
      return profile.seller.is_mall;
    case "seller.rating":
      return profile.seller.rating;
    case "quote.total":
      return profile.quote.total;
    case "quote.unit_price_per_100ml":
      return profile.quote.unit_price_per_100ml ?? null;
    case "quote.in_stock":
      return profile.quote.in_stock;
    case "quote.estimated_delivery_to":
      return profile.quote.estimated_delivery_to;
    case "policies.warranty_months":
      return profile.policies.warranty_months;
    case "policies.returns_accepted":
      return profile.policies.returns_accepted;
  }
}

function check(profile: OfferProfile, requirement: Requirement): RequirementCheck {
  const base = {
    requirement_id: requirement.requirement_id,
    profile_field_paths: requirement.field_path ? [requirement.field_path] : [],
  };
  const unknown = (reason: string): RequirementCheck => ({ ...base, result: "unknown", reason });
  if (!requirement.field_path)
    return unknown(
      "Musk chưa hỗ trợ xác minh thuộc tính này; giữ nguyên yêu cầu để bạn kiểm tra trên Shopee.",
    );
  if (!requirement.operator || requirement.value === null)
    return unknown("Yêu cầu chưa đủ rõ để kiểm tra.");
  if (!profile.sources.some((source) => source.field_path === requirement.field_path))
    return unknown("Thiếu nguồn bằng chứng cho điều kiện này.");
  let actual = fieldValue(profile, requirement.field_path);
  if (actual === null) return unknown("Chưa có dữ liệu xác nhận.");
  if (typeof actual === "object") {
    if (requirement.unit !== actual.currency) return unknown("Chưa xác nhận cùng đơn vị tiền tệ.");
    actual = actual.amount_minor;
  }

  if (requirement.field_path === "product.storage_gb" && requirement.unit !== "GB")
    return unknown("Dung lượng cần đơn vị GB.");
  if (requirement.field_path === "product.volume_ml" && requirement.unit !== "ml")
    return unknown("Dung tích cần đơn vị ml.");
  if (requirement.field_path === "product.pack_count" && requirement.unit !== "count")
    return unknown("Số sản phẩm trong gói cần đơn vị count.");
  if (requirement.field_path === "policies.warranty_months" && requirement.unit !== "months")
    return unknown("Thời hạn bảo hành cần đơn vị months.");
  const expected = requirement.value;
  if (
    requirement.field_path === "quote.estimated_delivery_to" &&
    !z.string().date().safeParse(expected).success
  )
    return unknown("Ngày giao yêu cầu phải là ngày hợp lệ theo YYYY-MM-DD.");
  let pass: boolean;
  switch (requirement.operator) {
    case "eq":
      if (typeof actual !== typeof expected)
        return unknown("Kiểu dữ liệu không phù hợp để so sánh.");
      pass =
        requirement.field_path === "product.brand" &&
        typeof actual === "string" &&
        typeof expected === "string"
          ? normalizeBrand(actual) === normalizeBrand(expected)
          : actual === expected;
      break;
    case "gte":
    case "lte": {
      if (
        typeof actual !== typeof expected ||
        (typeof actual !== "number" && typeof actual !== "string")
      )
        return unknown("Kiểu dữ liệu không phù hợp để so sánh.");
      if (typeof actual === "string" && requirement.field_path !== "quote.estimated_delivery_to")
        return unknown("Chỉ so sánh thứ tự chuỗi cho ngày giao hàng.");
      pass = requirement.operator === "gte" ? actual >= expected : actual <= expected;
      break;
    }

    case "contains":
      if (typeof actual !== "string" || typeof expected !== "string")
        return unknown("Cần dữ liệu văn bản.");
      pass = actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
      break;
    case "in":
      if (!Array.isArray(expected)) return unknown("Cần danh sách giá trị.");
      pass = expected.some((value) => value === actual);
      break;
  }

  return {
    ...base,
    result: pass ? "pass" : "fail",
    reason: pass ? "Đạt yêu cầu, có nguồn dữ liệu." : "Không đáp ứng yêu cầu.",
  };
}

export function evaluateRequirements(profile: OfferProfile, intent: ShoppingIntent): FilterResult {
  const checks = intent.requirements.map((requirement) => check(profile, requirement));
  if (intent.quantity === null || profile.quote.quantity !== intent.quantity)
    checks.push({
      requirement_id: "quantity",
      result: "unknown",
      reason: "Chưa khớp số lượng yêu cầu.",
      profile_field_paths: ["quote.quantity"],
    });
  if (
    profile.quote.in_stock !== true ||
    !profile.sources.some((source) => source.field_path === "quote.in_stock")
  )
    checks.push({
      requirement_id: "availability",
      result: profile.quote.in_stock === false ? "fail" : "unknown",
      reason: profile.quote.in_stock === false ? "Đã hết hàng." : "Chưa xác nhận tồn kho.",
      profile_field_paths: ["quote.in_stock"],
    });

  return {
    offer_id: profile.offer_id,
    status: checks.some((item) => item.result === "fail")
      ? "excluded"
      : checks.some((item) => item.result === "unknown")
        ? "unresolved"
        : "eligible",
    checks,
  };
}

export function validateSearchPlan(
  plan: SearchPlan,
  capabilities: SearchCapabilities,
  intent: ShoppingIntent,
): void {
  if (plan.sort_by && !capabilities.sort_options.includes(plan.sort_by))
    throw new Error("AI chọn cách sắp xếp không được hỗ trợ.");
  const used = new Set<string>();
  const covered = new Set<string>();
  for (const filter of plan.filters) {
    const supported = capabilities.filters.find((item) => item.name === filter.name);
    if (
      !supported ||
      used.has(filter.name) ||
      !supported.values.some((value) => value === filter.value)
    )
      throw new Error(`Bộ lọc không hợp lệ: ${filter.name}`);
    used.add(filter.name);
    if (!filter.requirement_ids.length)
      throw new Error("Bộ lọc phải dựa trên yêu cầu bắt buộc, không phải sở thích.");
    for (const id of filter.requirement_ids) {
      const requirement = intent.requirements.find((item) => item.requirement_id === id);
      if (
        !requirement ||
        requirement.field_path !== supported.field_path ||
        requirement.operator !== "eq" ||
        requirement.value !== filter.value
      )
        throw new Error("Bộ lọc tìm kiếm làm thay đổi ý định người mua.");
      covered.add(id);
    }
  }

  for (const id of plan.post_search_requirement_ids) {
    if (!intent.requirements.some((item) => item.requirement_id === id))
      throw new Error("Kế hoạch tham chiếu yêu cầu không tồn tại.");
    covered.add(id);
  }

  if (intent.requirements.some((item) => !covered.has(item.requirement_id)))
    throw new Error("Kế hoạch bỏ sót yêu cầu cần kiểm tra.");
}
