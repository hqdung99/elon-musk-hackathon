import type { Listing, SearchPlan, SearchResults, SearchReview } from "../domain/schemas";
import { unwrap } from "../providers/marketplace";
import type { PipelineDependencies } from "./types";

export interface CandidateResults {
  listings: Listing[];
  truncated: boolean;
  search_review: SearchReview;
}

// Only the first organic results are analyzed, to keep AI and Shopee calls few and fast.
export const searchListingLimit = 3;

export const searchPageLimit = 3;

export async function searchProducts(
  plan: SearchPlan,
  { marketplace, signal }: PipelineDependencies,
): Promise<CandidateResults> {
  const listings = new Map<string, Listing>();
  const visited = new Set<number>();
  // Extra pages are fetched only when ads or duplicates leave fewer than the limit on a page.
  const listingLimit = searchListingLimit;
  const pageLimit = searchPageLimit;
  let page: number | null = 1;
  let hasMore = false;
  while (page !== null && listings.size < listingLimit && visited.size < pageLimit) {
    signal?.throwIfAborted();
    if (visited.has(page)) throw new Error("Adapter trả về trang tìm kiếm lặp.");
    visited.add(page);
    const results: SearchResults = unwrap(await marketplace.searchProducts(plan, page, signal));
    for (const listing of results.items)
      listings.set(`${listing.seller_id}:${listing.listing_id}`, listing);
    if (results.has_more && results.next_page === null)
      throw new Error("Adapter báo còn kết quả nhưng thiếu trang kế tiếp.");
    hasMore = results.has_more;
    page = results.has_more ? results.next_page : null;
  }

  const found = [...listings.values()];
  const fetched = found.slice(0, listingLimit);
  const truncated = hasMore || found.length > listingLimit;

  return {
    listings: fetched,
    truncated,
    search_review: {
      plan,
      pages_fetched: visited.size,
      listing_limit: listingLimit,
      page_limit: pageLimit,
      truncated,
      entries: fetched.map((listing) => ({
        listing,
        status: "pending",
        reasons: [],
      })),
    },
  };
}
