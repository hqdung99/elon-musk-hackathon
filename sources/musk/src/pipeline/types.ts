import type { CheckoutValidation } from "../domain/checkout";
import type {
  Listing,
  OfferProfile,
  PipelineResult,
  ProductDetails,
  ShoppingIntent,
  SearchReview,
  Stage,
} from "../domain/schemas";
import type { AIAdapter } from "../providers/ai";
import type { CheckoutOutcome } from "../providers/checkout";
import type { MarketplaceAdapter } from "../providers/marketplace";

export interface PipelineDependencies {
  ai: AIAdapter;
  marketplace: MarketplaceAdapter;
  signal?: AbortSignal;
  progress?: (stage: Stage) => void;
}

export interface PreparedSearch {
  suggested_choices?: VariantChoices;
  intent: ShoppingIntent;
  candidates: { listing: Listing; product: ProductDetails; relevance: "relevant" | "unknown" }[];
  truncated: boolean;
  search_review: SearchReview;
}

export type VariantChoices = Record<string, string | null>;

export type RunResult =
  | { status: "clarification"; intent: ShoppingIntent }
  | ({ status: "selection" } & PreparedSearch)
  | { status: "complete"; result: PipelineResult };

export interface RevalidationResult {
  fresh: OfferProfile;
  validation: CheckoutValidation;
}

export interface HandoffResult extends RevalidationResult {
  navigation: CheckoutOutcome | null;
}
