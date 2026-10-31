import { z } from "zod";

export const moneySchema = z.object({
  amount_minor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export type Money = z.infer<typeof moneySchema>;

export const sourceSchema = z.object({
  field_path: z.string(),
  source_url: z.string().url(),
  observed_at: z.string().datetime({ offset: true }),
  basis: z.enum(["seller_claim", "platform_reported", "buyer_review", "independently_verified"]),
});

export type FieldSource = z.infer<typeof sourceSchema>;

export const fieldSchema = z.enum([
  "product.model",
  "product.storage_gb",
  "product.condition",
  "seller.is_mall",
  "seller.rating",
  "quote.total",
  "quote.in_stock",
  "quote.estimated_delivery_to",
  "policies.warranty_months",
  "policies.returns_accepted",
]);

export type FieldPath = z.infer<typeof fieldSchema>;
const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
]);
export const requirementSchema = z.object({
  requirement_id: z.string(),
  user_text: z.string(),
  field_path: fieldSchema.nullable(),
  operator: z.enum(["eq", "gte", "lte", "contains", "in"]).nullable(),
  value: valueSchema.nullable(),
  unit: z.string().nullable(),
});

export const preferenceSchema = z.object({
  preference_id: z.string(),
  user_text: z.string(),
  field_path: fieldSchema.nullable(),
  direction: z.enum(["lower", "higher", "earlier", "preferred_value"]).nullable(),
  preferred_value: valueSchema.nullable(),
  priority: z.number().int().positive().nullable(),
});

export const intentSchema = z.object({
  product_description: z.string().min(1),
  quantity: z.number().int().positive().nullable(),
  delivery_area: z.string().nullable(),
  requirements: z.array(requirementSchema),
  preferences: z.array(preferenceSchema),
  questions_for_user: z.array(z.string()),
  // Short messages the user can pick to answer questions_for_user; empty when nothing is asked.
  suggested_replies: z.array(z.string()).optional(),
});

export type ShoppingIntent = z.infer<typeof intentSchema>;

export type Requirement = z.infer<typeof requirementSchema>;

export type Preference = z.infer<typeof preferenceSchema>;

export const searchPlanSchema = z.object({
  query: z.string().min(1),
  filters: z.array(
    z.object({
      name: z.string(),
      value: valueSchema,
      requirement_ids: z.array(z.string()),
    }),
  ),
  sort_by: z.string().nullable(),
  post_search_requirement_ids: z.array(z.string()),
});

export type SearchPlan = z.infer<typeof searchPlanSchema>;

export interface SearchCapabilities {
  filters: { name: string; field_path: FieldPath; values: (string | number | boolean)[] }[];
  sort_options: string[];
}

export interface Listing {
  listing_id: string;
  seller_id: string;
  url: string;
  title: string;
}

export const listingKey = (listing: Pick<Listing, "seller_id" | "listing_id">) =>
  `${listing.seller_id}:${listing.listing_id}`;

export const listingRelevanceSchema = z.object({
  assessments: z.array(
    z.object({
      listing_id: z.string(),
      seller_id: z.string(),
      status: z.enum(["relevant", "irrelevant", "unknown"]),
      reason: z.string().min(1),
    }),
  ),
});

export type ListingRelevance = z.infer<typeof listingRelevanceSchema>;

export interface SearchResults {
  items: Listing[];
  next_page: number | null;
  has_more: boolean;
}

export interface ListingReview {
  listing: Listing;
  status:
    "pending" | "irrelevant" | "skipped" | "excluded" | "eligible" | "unresolved" | "not_evaluated";
  reasons: string[];
  seller_name?: string;
  selected_variant?: { variant_id: string; name: string };
}

export interface SearchReview {
  plan: SearchPlan;
  pages_fetched: number;
  // Counts retained offers, including unresolved ones, not raw search results.
  listing_limit: number;
  page_limit: number;
  truncated: boolean;
  entries: ListingReview[];
}

const imageUrlSchema = z.string().url().startsWith("https://");

export const productVariantSchema = z.object({
  variant_id: z.string(),
  name: z.string(),
  model: z.string().nullable().optional(),
  storage_gb: z.number().nullable().optional(),
  has_stock: z.boolean().nullable().optional(),
  is_clickable: z.boolean().nullable().optional(),
  is_grayout: z.boolean().nullable().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  image_url: imageUrlSchema.nullable().optional(),
});

export const productSchema = z.object({
  listing_id: z.string(),
  title: z.string(),
  image_url: imageUrlSchema.nullable().optional(),
  model: z.string().nullable(),
  storage_gb: z.number().nullable(),
  condition: z.enum(["new", "used", "refurbished"]).nullable(),
  variants: z.array(productVariantSchema).min(1),
  default_variant_id: z.string().nullable(),
  sources: z.array(sourceSchema),
});

export type ProductDetails = z.infer<typeof productSchema>;

export function isSelectableVariant(
  variant: ProductDetails["variants"][number],
  quantity = 1,
): boolean {
  return (
    variant.has_stock !== false &&
    variant.is_clickable !== false &&
    variant.is_grayout !== true &&
    (variant.stock == null || variant.stock >= quantity)
  );
}

export const sellerSchema = z.object({
  seller_id: z.string(),
  name: z.string(),
  is_mall: z.boolean().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  sold_count: z.number().int().nonnegative().nullable(),
  sources: z.array(sourceSchema),
});

export type SellerDetails = z.infer<typeof sellerSchema>;

export const reviewSchema = z.object({
  review_id: z.string(),
  variant_id: z.string().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  text: z.string(),
  posted_at: z.string(),
  source_url: z.string().url(),
});

export type Review = z.infer<typeof reviewSchema>;

export const reviewSummarySchema = z.object({
  analyzed_review_count: z.number().int().nonnegative(),
  themes: z.array(
    z.object({
      subject: z.enum(["product", "seller"]),
      sentiment: z.enum(["positive", "negative", "mixed"]),
      description: z.string(),
      review_ids: z.array(z.string()).min(1),
      matching_variant_review_count: z.number().int().nonnegative(),
    }),
  ),
  limitations: z.array(z.string()),
});

export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export const quoteSchema = z.object({
  listing_id: z.string(),
  variant_id: z.string(),
  quantity: z.number().int().positive(),
  delivery_area: z.string().nullable(),
  item_unit_price: moneySchema.nullable(),
  shipping_cost: moneySchema.nullable(),
  shipping_estimated: z.boolean().optional(),
  total_estimated: z.boolean().optional(),
  limitations: z.array(z.string()).optional(),
  other_fees: moneySchema.nullable(),
  discounts: z.array(
    z.object({
      discount_id: z.string(),
      description: z.string(),
      amount: moneySchema.nullable(),
      eligible: z.boolean().nullable(),
      applied: z.boolean(),
    }),
  ),
  total: moneySchema.nullable(),
  in_stock: z.boolean().nullable(),
  estimated_delivery_to: z.string().date().nullable(),
  observed_at: z.string().datetime({ offset: true }),
  sources: z.array(sourceSchema),
});

export type OfferQuote = z.infer<typeof quoteSchema>;

export const policiesSchema = z.object({
  listing_id: z.string(),
  variant_id: z.string(),
  returns_accepted: z.boolean().nullable(),
  return_window_days: z.number().int().nonnegative().nullable(),
  warranty_months: z.number().int().nonnegative().nullable(),
  warranty_provider: z.string().nullable(),
  conditions: z.array(z.string()).nullable(),
  sources: z.array(sourceSchema),
});

export type PurchasePolicies = z.infer<typeof policiesSchema>;

export const profileSchema = z.object({
  offer_id: z.string(),
  listing_url: z.string().url(),
  selected_variant_id: z.string(),
  product: productSchema,
  seller: sellerSchema,
  reviews: z.array(reviewSchema),
  review_summary: reviewSummarySchema,
  quote: quoteSchema,
  policies: policiesSchema,
  missing_fields: z.array(z.string()),
  sources: z.array(sourceSchema),
});

export type OfferProfile = z.infer<typeof profileSchema>;

export interface RequirementCheck {
  requirement_id: string;
  result: "pass" | "fail" | "unknown";
  reason: string;
  profile_field_paths: string[];
}

export interface FilterResult {
  offer_id: string;
  status: "eligible" | "excluded" | "unresolved";
  checks: RequirementCheck[];
}

export const rankingSchema = z.object({
  ranked_offers: z.array(
    z.object({
      offer_id: z.string(),
      rank: z.number().int().positive(),
      preference_reasons: z.array(
        z.object({
          preference_id: z.string(),
          reason: z.string(),
          profile_field_paths: z.array(fieldSchema),
        }),
      ),
      trade_offs: z.array(z.string()),
      missing_fields: z.array(z.string()),
    }),
  ),
});

export type RankingResults = z.infer<typeof rankingSchema>;

export type RankedOffer = RankingResults["ranked_offers"][number];

export interface Recommendation {
  recommended_offer_id: string | null;
  reasons: string[];
  limitations: string[];
}

export type Stage =
  | "clarifying"
  | "planning"
  | "searching"
  | "profiling"
  | "filtering"
  | "ranking"
  | "recommending"
  | "revalidating";

export interface PipelineResult {
  intent: ShoppingIntent;
  profiles: OfferProfile[];
  filters: FilterResult[];
  ranking: RankingResults;
  recommendation: Recommendation;
  mode: string;
  search_review: SearchReview;
}
