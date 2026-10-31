import { calculateTotal } from "../domain/requirements";
import {
  policiesSchema,
  listingKey,
  listingRelevanceSchema,
  productSchema,
  profileSchema,
  quoteSchema,
  reviewSchema,
  reviewSummarySchema,
  sellerSchema,
} from "../domain/schemas";
import type { Listing, OfferProfile, ProductDetails, ShoppingIntent } from "../domain/schemas";
import type { AIAdapter } from "../providers/ai";
import { unwrap } from "../providers/marketplace";
import type { MarketplaceAdapter } from "../providers/marketplace";
import type { PipelineDependencies, PreparedSearch, VariantChoices } from "./types";
import type { CandidateResults } from "./search-products";

const relevanceConcurrency = 4;

// Runs at most `limit` tasks at once and returns results in input order.
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
}

export async function prepareSearch(
  search: CandidateResults,
  intent: ShoppingIntent,
  dependencies: PipelineDependencies,
): Promise<PreparedSearch> {
  const { ai, marketplace, signal } = dependencies;
  const { listings, truncated } = search;
  const prepared: PreparedSearch = {
    intent,
    candidates: [],
    truncated,
    search_review: structuredClone(search.search_review),
  };
  const relevanceBatchSize = 12;
  const batches: Listing[][] = [];
  for (let offset = 0; offset < listings.length; offset += relevanceBatchSize)
    batches.push(listings.slice(offset, offset + relevanceBatchSize));
  // Batches are independent, so they run concurrently; results keep search order because
  // profiling later walks candidates in order and stops at the retained-offer limit.
  const assessed = await mapConcurrent(batches, relevanceConcurrency, async (batch) => {
    signal?.throwIfAborted();
    const { assessments } = listingRelevanceSchema.parse(
      await ai.assessListings(intent, batch, signal),
    );
    const expected = new Set(batch.map(listingKey));
    const seen = new Set<string>();
    for (const assessment of assessments) {
      const key = listingKey(assessment);
      if (!expected.has(key) || seen.has(key))
        throw new Error(
          "AI tham chiếu listing không tồn tại hoặc bị trùng khi kiểm tra liên quan.",
        );
      seen.add(key);
    }

    if (seen.size !== expected.size)
      throw new Error("AI bỏ sót listing khi kiểm tra mức liên quan.");
    const results = [];
    for (const listing of batch) {
      signal?.throwIfAborted();
      const assessment = assessments.find((entry) => listingKey(entry) === listingKey(listing))!;
      if (assessment.status === "irrelevant") {
        results.push({ listing, assessment, product: null });
        continue;
      }

      const product = productSchema.parse(
        unwrap(await marketplace.getProductDetails(listing, signal)),
      );
      if (product.listing_id !== listing.listing_id)
        throw new Error("Dữ liệu sản phẩm không khớp listing.");
      results.push({ listing, assessment, product });
    }

    return results;
  });
  for (const { listing, assessment, product } of assessed.flat()) {
    const entry = prepared.search_review.entries.find(
      (entry) => listingKey(entry.listing) === listingKey(listing),
    );
    if (!entry) throw new Error("Nhật ký tìm kiếm thiếu listing đã kiểm tra.");
    entry.status = assessment.status === "irrelevant" ? "irrelevant" : "pending";
    entry.reasons = [
      assessment.reason,
      ...(assessment.status === "unknown"
        ? ["Mức liên quan chưa rõ; vẫn giữ để đánh giá, chưa được tính là phù hợp."]
        : []),
    ];
    if (product && assessment.status !== "irrelevant")
      prepared.candidates.push({ listing, product, relevance: assessment.status });
  }

  return prepared;
}

export async function buildOfferProfiles(
  listings: Listing[],
  intent: ShoppingIntent,
  { marketplace, ai, signal }: PipelineDependencies,
  choices: VariantChoices = {},
  products: Map<string, ProductDetails> = new Map(),
): Promise<OfferProfile[]> {
  const profiles: OfferProfile[] = [];
  for (const listing of listings) {
    signal?.throwIfAborted();
    profiles.push(
      await assembleProfile(
        listing,
        intent,
        marketplace,
        ai,
        signal,
        choices[listingKey(listing)] ?? undefined,
        products.get(listingKey(listing)),
      ),
    );
  }

  return profiles;
}

export async function assembleProfile(
  listing: Listing,
  intent: ShoppingIntent,
  marketplace: MarketplaceAdapter,
  ai: AIAdapter,
  signal?: AbortSignal,
  variantId?: string,
  preparedProduct?: ProductDetails,
): Promise<OfferProfile> {
  signal?.throwIfAborted();
  if (intent.quantity === null) throw new Error("Cần xác nhận số lượng trước khi lấy báo giá.");
  const [rawProduct, rawSeller, rawReviews] = await Promise.all([
    preparedProduct
      ? Promise.resolve(preparedProduct)
      : marketplace.getProductDetails(listing, signal).then((result) => unwrap(result)),
    marketplace.getSellerDetails(listing, signal),
    marketplace.getReviews(listing, signal),
  ]);
  const product = productSchema.parse(rawProduct);
  const seller = sellerSchema.parse(unwrap(rawSeller));
  const reviews = reviewSchema.array().parse(unwrap(rawReviews));
  if (product.listing_id !== listing.listing_id || seller.seller_id !== listing.seller_id)
    throw new Error("Dữ liệu sản phẩm và người bán không khớp listing.");
  const selected = variantId
    ? product.variants.find((variant) => variant.variant_id === variantId)
    : (product.variants.find((variant) => variant.variant_id === product.default_variant_id) ??
      (product.variants.length === 1 ? product.variants[0] : undefined));
  if (!selected)
    throw new Error("Chưa xác định được chính xác biến thể; cần bổ sung adapter chọn biến thể.");
  if (selected.model != null) product.model = selected.model;
  if (selected.storage_gb != null) product.storage_gb = selected.storage_gb;
  for (const field of ["model", "storage_gb"] as const) {
    const field_path = `product.${field}` as const;
    if (
      selected[field] != null &&
      !product.sources.some((source) => source.field_path === field_path)
    )
      product.sources.push({
        field_path,
        source_url: listing.url,
        observed_at: new Date().toISOString(),
        basis: "platform_reported",
      });
  }

  const [quoteResult, policiesResult, summaryResult] = await Promise.allSettled([
    marketplace.getOfferQuote(
      listing,
      selected.variant_id,
      { quantity: intent.quantity, delivery_area: intent.delivery_area },
      signal,
    ),
    marketplace.getPurchasePolicies(listing, selected.variant_id, signal),
    ai.summarizeReviews(reviews, selected.variant_id, signal),
  ]);
  // A sibling AI/policy failure must not hide a cleanup failure or return before cart restoration.
  if (quoteResult.status === "rejected") throw quoteResult.reason;
  if (policiesResult.status === "rejected") throw policiesResult.reason;
  if (summaryResult.status === "rejected") throw summaryResult.reason;
  signal?.throwIfAborted();
  const quote = quoteSchema.parse(unwrap(quoteResult.value));
  const policies = policiesSchema.parse(unwrap(policiesResult.value));
  if (
    quote.listing_id !== listing.listing_id ||
    policies.listing_id !== listing.listing_id ||
    quote.variant_id !== selected.variant_id ||
    policies.variant_id !== selected.variant_id ||
    quote.quantity !== intent.quantity ||
    quote.delivery_area !== intent.delivery_area
  )
    throw new Error("Báo giá, chính sách, biến thể hoặc ngữ cảnh người mua không khớp.");
  const calculated = calculateTotal(quote);
  if (quote.total && calculated && JSON.stringify(quote.total) !== JSON.stringify(calculated))
    throw new Error("Tổng báo giá không khớp các thành phần giá.");
  quote.total = calculated;
  const summary = reviewSummarySchema.parse(summaryResult.value);
  if (summary.analyzed_review_count !== reviews.length)
    throw new Error("AI đếm sai số đánh giá đã phân tích.");
  for (const theme of summary.themes) {
    const cited = reviews.filter((review) => theme.review_ids.includes(review.review_id));
    if (
      new Set(theme.review_ids).size !== theme.review_ids.length ||
      cited.length !== theme.review_ids.length ||
      theme.matching_variant_review_count !==
        cited.filter((review) => review.variant_id === selected.variant_id).length
    )
      throw new Error("AI tham chiếu đánh giá hoặc đếm biến thể không hợp lệ.");
  }

  const missing_fields = [
    ...Object.entries(product)
      .filter(([, value]) => value === null)
      .map(([key]) => `product.${key}`),
    ...Object.entries(seller)
      .filter(([, value]) => value === null)
      .map(([key]) => `seller.${key}`),
    ...Object.entries(quote)
      .filter(([, value]) => value === null)
      .map(([key]) => `quote.${key}`),
    ...Object.entries(policies)
      .filter(([, value]) => value === null)
      .map(([key]) => `policies.${key}`),
  ];

  return profileSchema.parse({
    offer_id: `${listing.listing_id}:${seller.seller_id}:${selected.variant_id}:${intent.quantity}`,
    listing_url: listing.url,
    selected_variant_id: selected.variant_id,
    product,
    seller,
    reviews,
    review_summary: summary,
    quote,
    policies,
    missing_fields,
    sources: [...product.sources, ...seller.sources, ...quote.sources, ...policies.sources],
  });
}
