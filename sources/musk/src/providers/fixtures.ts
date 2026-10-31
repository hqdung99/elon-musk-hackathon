import type {
  FieldSource,
  Listing,
  OfferQuote,
  OfferProfile,
  ProductDetails,
  PurchasePolicies,
  Review,
  SearchCapabilities,
  SellerDetails,
} from "../domain/schemas";
import { calculateTotal } from "../domain/requirements";
import type { AdapterResult, MarketplaceAdapter } from "./marketplace";

const ok = <T>(data: T): AdapterResult<T> => ({ status: "ok", data: structuredClone(data) });
export const fixtureListings: Listing[] = ["value", "fast", "cheap", "unknown"].map((id) => ({
  listing_id: id,
  seller_id: `seller-${id}`,
  url: `https://example.com/musk-demo/${id}`,
  title: "iPhone 16 128GB · Xanh lưu ly",
}));
const shops = {
  value: {
    name: "Sông Hàn Digital",
    price: 18_190_000,
    discount: 350_000,
    days: 4,
    mall: true,
    rating: 4.8,
    warranty: 12,
  },
  fast: {
    name: "Bến Nghé Mobile",
    price: 18_690_000,
    discount: 500_000,
    days: 2,
    mall: true,
    rating: 4.9,
    warranty: 12,
  },
  cheap: {
    name: "Phố Táo 247",
    price: 17_490_000,
    discount: 200_000,
    days: 3,
    mall: false,
    rating: 4.5,
    warranty: 6,
  },
  unknown: {
    name: "Hải Âu iStore",
    price: 18_290_000,
    discount: 0,
    days: 3,
    mall: true,
    rating: 4.7,
    warranty: null,
  },
};
function shop(listing: Listing) {
  const found = Object.entries(shops).find(([id]) => id === listing.listing_id);
  if (!found) throw new Error("Fixture không có listing này.");

  return found[1];
}

function sources(
  listing: Listing,
  paths: string[],
  basis: FieldSource["basis"] = "platform_reported",
): FieldSource[] {
  return paths.map((field_path) => ({
    field_path,
    source_url: listing.url,
    observed_at: new Date().toISOString(),
    basis,
  }));
}

export type FixtureScenario = "unchanged" | "price_changed" | "out_of_stock" | "unknown_shipping";

export function createFixtureMarketplace(
  scenario: FixtureScenario = "unchanged",
  revalidating = false,
): MarketplaceAdapter {
  return {
    mode: "fixture",
    async getSearchCapabilities() {
      return ok<SearchCapabilities>({
        filters: [{ name: "mall", field_path: "seller.is_mall", values: [true, false] }],
        sort_options: [],
      });
    },
    async searchProducts(plan, page) {
      if (page !== 1) return ok({ items: [], next_page: null, has_more: false });
      if (!/iphone\s*16/i.test(plan.query))
        throw new Error(
          "Dữ liệu demo chỉ hỗ trợ iPhone 16 128GB. Chuyển adapter để mở rộng sản phẩm.",
        );
      const mall = plan.filters.find((filter) => filter.name === "mall");

      return ok({
        items: fixtureListings.filter((listing) => !mall || shop(listing).mall === mall.value),
        next_page: null,
        has_more: false,
      });
    },
    async getProductDetails(listing) {
      return ok<ProductDetails>({
        listing_id: listing.listing_id,
        title: listing.title,
        model: "iPhone 16",
        storage_gb: 128,
        condition: "new",
        variants: [{ variant_id: `${listing.listing_id}-128-blue`, name: "128GB · Xanh lưu ly" }],
        default_variant_id: `${listing.listing_id}-128-blue`,
        sources: sources(listing, ["product.model", "product.storage_gb", "product.condition"]),
      });
    },
    async getSellerDetails(listing) {
      const selected = shop(listing);

      return ok<SellerDetails>({
        seller_id: listing.seller_id,
        name: selected.name,
        is_mall: selected.mall,
        rating: selected.rating,
        sold_count: 3200,
        sources: sources(listing, ["seller.is_mall", "seller.rating", "seller.sold_count"]),
      });
    },
    async getReviews(listing) {
      return ok<Review[]>([
        {
          review_id: `${listing.listing_id}-review-1`,
          variant_id: `${listing.listing_id}-128-blue`,
          rating: listing.listing_id === "cheap" ? 2 : 5,
          text:
            listing.listing_id === "cheap"
              ? "Máy đã kích hoạt sẵn, chỉ được bảo hành shop."
              : "Máy mới, pin ổn, đúng mẫu 128GB.",
          posted_at: "2026-10-20",
          source_url: listing.url,
        },
        {
          review_id: `${listing.listing_id}-review-2`,
          variant_id: null,
          rating: 3,
          text:
            listing.listing_id === "fast"
              ? "Đóng gói cẩn thận, nhận sau 2 ngày."
              : "Shop trả lời tốt nhưng giao hàng chậm.",
          posted_at: "2026-10-21",
          source_url: listing.url,
        },
      ]);
    },
    async getOfferQuote(listing, variantId, buyer) {
      const selected = shop(listing);
      const money = (amount_minor: number) => ({ amount_minor, currency: "VND" });
      const date = new Date();
      date.setDate(date.getDate() + selected.days);
      const changed = revalidating && scenario === "price_changed";
      const quote: OfferQuote = {
        listing_id: listing.listing_id,
        variant_id: variantId,
        quantity: buyer.quantity,
        delivery_area: buyer.delivery_area,
        item_unit_price: money(selected.price + (changed ? 100_000 : 0)),
        shipping_cost: revalidating && scenario === "unknown_shipping" ? null : money(0),
        other_fees: money(0),
        discounts: [
          {
            discount_id: "demo-voucher",
            description: "Voucher mô phỏng theo đơn",
            amount: money(selected.discount),
            eligible: true,
            applied: true,
          },
        ],
        total: null,
        in_stock: !(revalidating && scenario === "out_of_stock"),
        estimated_delivery_to: buyer.delivery_area ? date.toISOString().slice(0, 10) : null,
        observed_at: new Date().toISOString(),
        sources: sources(listing, [
          "quote.total",
          "quote.in_stock",
          "quote.estimated_delivery_to",
          "quote.shipping_cost",
        ]),
      };
      quote.total = calculateTotal(quote);

      return ok(quote);
    },
    async getPurchasePolicies(listing, variantId) {
      const selected = shop(listing);

      return ok<PurchasePolicies>({
        listing_id: listing.listing_id,
        variant_id: variantId,
        returns_accepted: true,
        return_window_days: 15,
        warranty_months: selected.warranty,
        warranty_provider:
          selected.warranty === 12 ? "Apple" : selected.warranty === null ? null : "Shop",
        conditions: ["Giữ hóa đơn và bao bì; điều kiện này chỉ là dữ liệu mô phỏng."],
        sources: sources(
          listing,
          ["policies.warranty_months", "policies.returns_accepted"],
          "seller_claim",
        ),
      });
    },
  };
}

export function fixtureLimitations(profiles: OfferProfile[]): string[] {
  return [
    "Toàn bộ shop, giá và đánh giá là dữ liệu giả lập, không phải báo giá Shopee.",
    `Chỉ khảo sát ${profiles.length} offer demo; không khẳng định đây là lựa chọn rẻ nhất thị trường.`,
  ];
}
