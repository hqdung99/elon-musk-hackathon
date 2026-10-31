import type {
  Listing,
  OfferQuote,
  ProductDetails,
  PurchasePolicies,
  Review,
  SearchCapabilities,
  SearchPlan,
  SearchResults,
  SellerDetails,
} from "../domain/schemas";

export type AdapterResult<T> =
  { status: "ok"; data: T } | { status: "not_implemented"; operation: string; message: string };

export interface BuyerContext {
  quantity: number;
  delivery_area: string | null;
}

export interface MarketplaceAdapter {
  mode: "fixture" | "shopee";
  getSearchCapabilities(
    keyword: string,
    signal?: AbortSignal,
  ): Promise<AdapterResult<SearchCapabilities>>;
  searchProducts(
    plan: SearchPlan,
    page: number,
    signal?: AbortSignal,
  ): Promise<AdapterResult<SearchResults>>;
  getProductDetails(listing: Listing, signal?: AbortSignal): Promise<AdapterResult<ProductDetails>>;
  getSellerDetails(listing: Listing, signal?: AbortSignal): Promise<AdapterResult<SellerDetails>>;
  getReviews(listing: Listing, signal?: AbortSignal): Promise<AdapterResult<Review[]>>;
  getOfferQuote(
    listing: Listing,
    variantId: string,
    buyer: BuyerContext,
    signal?: AbortSignal,
  ): Promise<AdapterResult<OfferQuote>>;
  getPurchasePolicies(
    listing: Listing,
    variantId: string,
    signal?: AbortSignal,
  ): Promise<AdapterResult<PurchasePolicies>>;
}

export function notImplemented<T>(operation: string): AdapterResult<T> {
  const message = `#TODO ${operation}: chưa kết nối API Shopee.`;
  console.warn(message);

  return { status: "not_implemented", operation, message };
}

export function unwrap<T>(result: AdapterResult<T>): T {
  if (result.status !== "ok") throw new Error(result.message);

  return result.data;
}

export { createShopeeAdapter, shopeeAdapter } from "./shopee-marketplace";
