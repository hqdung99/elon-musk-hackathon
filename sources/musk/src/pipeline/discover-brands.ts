import { brandDiscoverySchema, listingKey, normalizeBrand } from "../domain/schemas";
import type { BrandDiscovery, SearchPlan, ShoppingIntent } from "../domain/schemas";
import { mapConcurrent } from "./profiles";
import { planSearch } from "./plan-search";
import { searchListingLimit, searchPageLimit, searchProducts } from "./search-products";
import type { CandidateResults } from "./search-products";
import type { PipelineDependencies, PreparedSearch } from "./types";

export function discoveredBrand(value: string | null | undefined, discovery: BrandDiscovery) {
  if (!value) return undefined;

  return discovery.brands.find((brand) =>
    [brand.name, ...brand.aliases].some((alias) => normalizeBrand(alias) === normalizeBrand(value)),
  );
}

export function validateBrandDiscovery(value: unknown): BrandDiscovery {
  const discovery = brandDiscoverySchema.parse(value);
  const sources = new Set(discovery.sources.map((source) => source.url));
  const names = new Set<string>();
  for (const brand of discovery.brands) {
    for (const name of new Set([brand.name, ...brand.aliases].map(normalizeBrand))) {
      if (!name || names.has(name))
        throw new Error(
          "Danh sách thương hiệu bị trùng, nhập nhằng alias hoặc có tên không hợp lệ.",
        );
      names.add(name);
    }

    if (brand.source_urls.some((url) => !sources.has(url)))
      throw new Error("Thương hiệu tham chiếu nguồn không có trong kết quả web search.");
  }

  if (discovery.brands.length < 3 && !discovery.limitations.length)
    throw new Error("Nghiên cứu thiếu thương hiệu nhưng không giải thích giới hạn bằng chứng.");

  return discovery;
}

export async function searchDiscoveredBrands(
  intent: ShoppingIntent,
  discovery: BrandDiscovery,
  dependencies: PipelineDependencies,
): Promise<CandidateResults> {
  const plans = await mapConcurrent(discovery.brands, 3, async (brand) => {
    const plan = await planSearch(
      {
        ...intent,
        product_description: `${brand.name} ${intent.product_description}`,
        shopping_goal: {
          mode: "targeted",
          category: intent.shopping_goal?.category ?? intent.product_description,
          requested_brand: brand.name,
        },
      },
      dependencies,
    );
    if (
      ![brand.name, ...brand.aliases].some((name) =>
        normalizeBrand(plan.query).includes(normalizeBrand(name)),
      )
    )
      throw new Error("Kế hoạch tìm kiếm bỏ sót thương hiệu đã nghiên cứu.");

    return { brand: brand.name, plan };
  });
  dependencies.progress?.("searching");
  const searches = await mapConcurrent(plans, 3, async ({ brand, plan }) => ({
    brand,
    result: await searchProducts(plan, dependencies),
  }));
  const listings = new Map<string, CandidateResults["listings"][number]>();
  const entries = new Map<string, CandidateResults["search_review"]["entries"][number]>();
  for (const { result } of searches)
    for (const entry of result.search_review.entries) {
      const key = listingKey(entry.listing);
      if (!listings.has(key)) {
        listings.set(key, entry.listing);
        entries.set(key, structuredClone(entry));
      }
    }

  const overview: SearchPlan = {
    query: intent.product_description,
    filters: [],
    sort_by: null,
    post_search_requirement_ids: intent.requirements.map(
      (requirement) => requirement.requirement_id,
    ),
  };
  const truncated = searches.some(({ result }) => result.truncated);

  return {
    listings: [...listings.values()],
    truncated,
    search_review: {
      plan: overview,
      pages_fetched: searches.reduce(
        (total, { result }) => total + result.search_review.pages_fetched,
        0,
      ),
      listing_limit: searchListingLimit * discovery.brands.length,
      page_limit: searchPageLimit * discovery.brands.length,
      truncated,
      entries: [...entries.values()],
      discovery,
      brand_searches: searches.map(({ brand, result }) => ({
        brand,
        plan: result.search_review.plan,
        pages_fetched: result.search_review.pages_fetched,
        listing_limit: result.search_review.listing_limit,
        page_limit: result.search_review.page_limit,
        truncated: result.truncated,
      })),
    },
  };
}

export function verifyDiscoveredBrands(prepared: PreparedSearch): void {
  const discovery = prepared.search_review.discovery;
  if (!discovery) return;
  prepared.candidates = prepared.candidates.filter(({ listing, product }) => {
    const brand =
      product.brand && product.sources.some((source) => source.field_path === "product.brand")
        ? discoveredBrand(product.brand, discovery)
        : undefined;
    const entry = prepared.search_review.entries.find(
      (entry) => listingKey(entry.listing) === listingKey(listing),
    );
    if (!entry) throw new Error("Nhật ký tìm kiếm thiếu listing xác minh thương hiệu.");
    if (!brand) {
      entry.status = "skipped";
      entry.reasons.push(
        product.brand
          ? `Thương hiệu ${product.brand} không được xác minh thuộc nhóm nghiên cứu; không lấy báo giá.`
          : "Shopee chưa xác nhận thương hiệu sản phẩm; không đoán từ tiêu đề để so sánh thương hiệu.",
      );

      return false;
    }

    entry.brand = brand.name;
    entry.reasons.push(`Thương hiệu ${brand.name} được xác nhận từ dữ liệu sản phẩm Shopee.`);

    return true;
  });
}
