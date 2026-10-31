import { evaluateRequirements } from "./requirements";
import type { FilterResult, OfferProfile, ShoppingIntent } from "./schemas";

export interface CheckoutApproval {
  run_id: number;
  decision: "approved" | "declined";
  displayed_offer: OfferProfile;
  decided_at: string;
}

export interface CheckoutValidation {
  // "ready_with_unknowns" proceeds to checkout; unknown_fields are shown as warnings.
  status: "ready" | "ready_with_unknowns" | "changed" | "requirements_not_met" | "invalid_approval";
  changed_fields: string[];
  unknown_fields: string[];
  // Known at approval, unknown now: warned about, not treated as a change.
  became_unknown_fields: string[];
  requirement_checks: FilterResult;
}

export function createApproval(runId: number, profile: OfferProfile): CheckoutApproval {
  return {
    run_id: runId,
    decision: "approved",
    displayed_offer: structuredClone(profile),
    decided_at: new Date().toISOString(),
  };
}

function terms(profile: OfferProfile): Record<string, unknown> {
  return {
    offer_id: profile.offer_id,
    listing_url: profile.listing_url,
    selected_variant_id: profile.selected_variant_id,
    product: {
      ...profile.product,
      image_url: undefined,
      // Availability is rechecked for the selected SKU through quote.in_stock.
      variants: profile.product.variants
        .map((variant) => ({
          variant_id: variant.variant_id,
          name: variant.name,
          model: variant.model,
          storage_gb: variant.storage_gb,
        }))
        .sort((a, b) => a.variant_id.localeCompare(b.variant_id)),
      sources: undefined,
    },
    seller: {
      seller_id: profile.seller.seller_id,
      name: profile.seller.name,
      is_mall: profile.seller.is_mall,
    },
    quote: {
      ...profile.quote,
      observed_at: undefined,
      sources: undefined,
    },
    policies: { ...profile.policies, sources: undefined },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function diffTerms(
  previous: unknown,
  current: unknown,
  path: string,
  changed: string[],
  becameUnknown: string[],
) {
  if (JSON.stringify(previous) === JSON.stringify(current)) return;
  if (current === null || current === undefined) becameUnknown.push(path);
  else if (isRecord(previous) && isRecord(current))
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)]))
      diffTerms(previous[key], current[key], `${path}.${key}`, changed, becameUnknown);
  else changed.push(path);
}

export function validateApprovedOffer(
  approval: CheckoutApproval,
  fresh: OfferProfile,
  intent: ShoppingIntent,
  runId: number,
): CheckoutValidation {
  const requirement_checks = evaluateRequirements(fresh, intent);
  const previous = terms(approval.displayed_offer);
  const current = terms(fresh);
  const changed_fields: string[] = [];
  const became_unknown_fields: string[] = [];
  for (const key of Object.keys(previous))
    diffTerms(previous[key], current[key], key, changed_fields, became_unknown_fields);
  const validApproval = approval.decision === "approved" && approval.run_id === runId;
  const unknown_fields = [
    ...became_unknown_fields,
    ...fresh.missing_fields,
    ...(!fresh.quote.total ? ["quote.total"] : []),
    ...(fresh.quote.in_stock === null ? ["quote.in_stock"] : []),
    ...(!fresh.quote.delivery_area ? ["quote.delivery_area"] : []),
    ...(!fresh.quote.estimated_delivery_to ? ["quote.estimated_delivery_to"] : []),
    ...(fresh.policies.returns_accepted === null ? ["policies.returns_accepted"] : []),
    ...(fresh.policies.warranty_months === null ? ["policies.warranty_months"] : []),
    ...(fresh.policies.conditions === null ? ["policies.conditions"] : []),
  ];

  return {
    // Changed known values stop; values that became unknown only warn.
    status: !validApproval
      ? "invalid_approval"
      : requirement_checks.status === "excluded"
        ? "requirements_not_met"
        : changed_fields.length
          ? "changed"
          : unknown_fields.length || requirement_checks.status === "unresolved"
            ? "ready_with_unknowns"
            : "ready",
    changed_fields,
    unknown_fields: [...new Set(unknown_fields)],
    became_unknown_fields,
    requirement_checks,
  };
}
