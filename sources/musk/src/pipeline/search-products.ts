import type { Listing, SearchPlan, SearchResults, SearchReview } from "../domain/schemas";
import { unwrap } from "../providers/marketplace";
import type { PipelineDependencies } from "./types";

export interface CandidateResults {
  listings: Listing[];
  truncated: boolean;
  search_review: SearchReview;
}

export async function searchProducts(
  plan: SearchPlan,
  { marketplace, signal }: PipelineDependencies,
): Promise<CandidateResults> {
  const listings = new Map<string, Listing>();
  const visited = new Set<number>();
  const listingLimit = 12;
  const pageLimit = 3;
  let page: number | null = 1;
  let truncated = false;
  while (page !== null) {
    signal?.throwIfAborted();
    if (visited.has(page)) throw new Error("Adapter trả về trang tìm kiếm lặp.");
    visited.add(page);
    const results: SearchResults = unwrap(await marketplace.searchProducts(plan, page, signal));
    for (const listing of results.items)
      listings.set(`${listing.seller_id}:${listing.listing_id}`, listing);
    if (results.has_more && results.next_page === null)
      throw new Error("Adapter báo còn kết quả nhưng thiếu trang kế tiếp.");
    if (visited.size >= pageLimit) {
      truncated = results.has_more;
      break;
    }

    page = results.has_more ? results.next_page : null;
  }

  const fetched = [...listings.values()];

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
