import { evaluateRequirements } from "../domain/requirements";
import type { FilterResult, OfferProfile, ShoppingIntent } from "../domain/schemas";

export interface FilteredOffers {
  filters: FilterResult[];
  candidates: OfferProfile[];
}

// Only confirmed failures exclude an offer; unknown checks stay visible on the candidate.
export function filterOffers(profiles: OfferProfile[], intent: ShoppingIntent): FilteredOffers {
  const filters = profiles.map((profile) => evaluateRequirements(profile, intent));
  const candidates = profiles.filter((profile) =>
    filters.some((filter) => filter.offer_id === profile.offer_id && filter.status !== "excluded"),
  );

  return { filters, candidates };
}
