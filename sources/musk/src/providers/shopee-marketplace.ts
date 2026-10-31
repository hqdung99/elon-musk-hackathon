import type {
  FieldSource,
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
import type { AdapterResult, BuyerContext, MarketplaceAdapter } from "./marketplace";
import { createCheckoutShippingEstimator } from "./shopee-shipping";
import { createShopeeCart } from "./shopee-cart";
import { calculateTotal } from "../domain/requirements";
import type { CheckoutAdapter, CheckoutNavigation } from "./checkout";

type JsonRecord = Record<string, unknown>;

interface ProductResponse {
  data: JsonRecord;
  item: JsonRecord;
}

const ok = <T>(data: T): AdapterResult<T> => ({ status: "ok", data });

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Shopee response missing object: ${label}.`);

  return value as JsonRecord;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);

  return null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Shopee response missing array: ${label}.`);

  return value;
}

function source(listing: Listing, field_path: string): FieldSource {
  return {
    field_path,
    source_url: listing.url,
    observed_at: new Date().toISOString(),
    basis: "platform_reported",
  };
}

function price(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value % 100_000 !== 0)
    return null;
  const amount_minor = value / 100_000;
  if (!Number.isSafeInteger(amount_minor) || amount_minor < 0) return null;

  return { amount_minor, currency: "VND" };
}

function modelFromTitle(title: string): string | null {
  const matches = [...title.matchAll(/\b(iPhone\s+\d+(?:\s+(?:Pro|Max|Plus|mini|Air|e))*)\b/gi)];
  const models = new Map(matches.map((match) => [match[1].toLowerCase(), match[1]]));

  return models.size === 1 ? [...models.values()][0] : null;
}

function storageFromTitle(title: string): number | null {
  const sizes = new Set(
    [...title.matchAll(/\b(\d+)\s*(GB|TB)\b/gi)].map(
      (match) => Number(match[1]) * (match[2].toUpperCase() === "TB" ? 1024 : 1),
    ),
  );
  const size = [...sizes][0];

  return sizes.size === 1 && Number.isSafeInteger(size) ? size : null;
}

function conditionFromApi(value: unknown): ProductDetails["condition"] {
  if (value === 1 || value === "1" || value === "new") return "new";
  if (value === 2 || value === "2" || value === "used") return "used";
  if (value === "refurbished") return "refurbished";

  return null;
}

function productUrl(listing: Listing): string {
  return `https://shopee.vn/product/${encodeURIComponent(listing.seller_id)}/${encodeURIComponent(listing.listing_id)}`;
}

function newSessionId(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${id}`;
}

function assertApiSuccess(payload: JsonRecord, endpoint: string): void {
  const error = payload.error;
  const errorMessage = payload.error_msg ?? payload.error_message;
  if (error !== undefined && error !== null && error !== 0 && error !== "0")
    throw new Error(
      `Shopee ${endpoint} returned error ${String(error)}.` +
        (typeof errorMessage === "string" && errorMessage.trim() ? ` ${errorMessage}` : ""),
    );
}

export function createShopeeAdapter(
  fetcher: typeof fetch = globalThis.fetch,
): MarketplaceAdapter & CheckoutAdapter {
  const products = new Map<string, Promise<ProductResponse>>();

  async function request(
    path: string,
    endpoint: string,
    signal?: AbortSignal,
    body?: JsonRecord,
  ): Promise<JsonRecord> {
    const response = await fetcher(`/shopee-api/${path}`, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      ...(body
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok)
      throw new Error(`Shopee ${endpoint} request failed with HTTP ${response.status}.`);
    const payload = record(await response.json(), `${endpoint} response`);
    assertApiSuccess(payload, endpoint);

    return payload;
  }

  const cart = createShopeeCart(request, createCheckoutShippingEstimator(request));
  const estimateShipping = cart.estimateShipping;

  function getProduct(
    listing: Listing,
    signal?: AbortSignal,
    refresh = false,
  ): Promise<ProductResponse> {
    const key = `${listing.seller_id}:${listing.listing_id}`;
    if (refresh) products.delete(key);
    const existing = products.get(key);
    if (existing) return existing;

    const query = new URLSearchParams({
      display_model_id: "0",
      item_id: listing.listing_id,
      model_selection_logic: "3",
      tz_offset_in_minutes: String(-new Date().getTimezoneOffset()),
      detail_level: "0",
      incoming_pdp_page_source: "0",
      incoming_pdp_page_scenario: "0",
      shop_id: listing.seller_id,
    });
    const pending = request(`v4/pdp/get_pc?${query}`, "get_product", signal).then((payload) => {
      const data = record(payload.data, "get_product.data");
      const item = record(data.item, "get_product.data.item");
      if (
        stringValue(item.item_id) !== listing.listing_id ||
        stringValue(item.shop_id) !== listing.seller_id
      )
        throw new Error("Shopee returned product details for a different listing.");

      return { data, item };
    });
    products.set(key, pending);
    void pending.then(undefined, () => {
      if (products.get(key) === pending) products.delete(key);
    });

    return pending;
  }

  return {
    mode: "shopee",

    async openCheckout(profile, signal) {
      if (
        profile.quote.listing_id !== profile.product.listing_id ||
        profile.quote.variant_id !== profile.selected_variant_id ||
        !profile.product.variants.some(
          (variant) => variant.variant_id === profile.selected_variant_id,
        )
      )
        throw new Error("Approved product, quote and selected SKU do not match.");
      const result = await cart.prepareCheckout(
        {
          listing_id: profile.product.listing_id,
          seller_id: profile.seller.seller_id,
          title: profile.product.title,
          url: profile.listing_url,
        },
        profile.selected_variant_id,
        profile.quote.quantity,
        signal,
      );

      return ok<CheckoutNavigation>({
        status: "ready",
        checkout_url: "https://shopee.vn/cart",
        message:
          (result.added
            ? "Đã dọn giỏ và chỉ giữ SKU với số lượng đã duyệt trong giỏ Shopee."
            : "Giỏ đã chỉ có SKU với đúng số lượng đã duyệt; không thêm trùng.") +
          " Nội dung giỏ cũ không được khôi phục. Mở giỏ hàng Shopee để kiểm tra giá, phí, voucher, địa chỉ trước khi mua. Trình duyệt cần đăng nhập cùng tài khoản Shopee đã cấu hình. Musk không đặt hàng hay thanh toán.",
      });
    },

    async getSearchCapabilities(keyword, signal) {
      products.clear();
      const query = new URLSearchParams({
        extra_params: JSON.stringify({
          global_search_session_id: newSessionId("gs"),
          search_session_id: newSessionId("ss"),
        }),
        filter_version: "v3",
        ignore_old_filter_data: "true",
        keyword,
        page_type: "search",
        scenario: "PAGE_GLOBAL_SEARCH",
        use_new_filter_group: "true",
        use_new_filter_shortcut: "true",
      });
      const response = await request(
        `v4/search/search_filter_config?${query}`,
        "search_filter_config",
        signal,
      );
      const data = record(response.data, "search_filter_config.data");
      const configuration = record(
        data.filter_configuration_v2,
        "search_filter_config.data.filter_configuration_v2",
      );
      const groups = arrayValue(
        configuration.filter_groups,
        "search_filter_config.data.filter_configuration_v2.filter_groups",
      ).map((group) => record(group, "search filter group"));
      const group = (name: string) => groups.find((candidate) => candidate.name === name);
      const mallValues = arrayValue(group("SHOP_TYPE")?.filters ?? [], "SHOP_TYPE filters")
        .map((filter) => record(filter, "SHOP_TYPE filter"))
        .map((filter) => filter.value);
      const conditionValues = arrayValue(group("CONDITION")?.filters ?? [], "CONDITION filters")
        .map((filter) => record(filter, "CONDITION filter"))
        .map((filter) => filter.value);
      const filters: SearchCapabilities["filters"] = [];

      if (mallValues.includes("OFFICIAL_MALL"))
        filters.push({ name: "mall", field_path: "seller.is_mall", values: [true] });
      const conditions = [
        ...(conditionValues.includes("NEW_ITEM") ? (["new"] as const) : []),
        ...(conditionValues.includes("USED_ITEM") ? (["used"] as const) : []),
      ];
      if (conditions.length)
        filters.push({
          name: "condition",
          field_path: "product.condition",
          values: [...conditions],
        });

      return ok({
        filters,
        sort_options: ["relevancy", "price_asc", "price_desc"],
      });
    },

    async searchProducts(plan: SearchPlan, page: number, signal?: AbortSignal) {
      if (!Number.isInteger(page) || page < 1)
        throw new Error("Shopee search page must be a positive integer.");
      const filterOptions: { group_name: string; values: string[] }[] = [];
      for (const filter of plan.filters) {
        if (filter.name === "mall" && filter.value === true)
          filterOptions.push({ group_name: "SHOP_TYPE", values: ["OFFICIAL_MALL"] });
        else if (filter.name === "condition" && filter.value === "new")
          filterOptions.push({ group_name: "CONDITION", values: ["NEW_ITEM"] });
        else if (filter.name === "condition" && filter.value === "used")
          filterOptions.push({ group_name: "CONDITION", values: ["USED_ITEM"] });
        else throw new Error(`Unsupported Shopee search filter: ${filter.name}.`);
      }

      const sort = plan.sort_by ?? "relevancy";
      const [by, order] =
        sort === "price_asc"
          ? ["price", "asc"]
          : sort === "price_desc"
            ? ["price", "desc"]
            : sort === "relevancy"
              ? ["relevancy", "desc"]
              : (() => {
                  throw new Error(`Unsupported Shopee sort option: ${sort}.`);
                })();
      const query = new URLSearchParams({
        by,
        extra_params: JSON.stringify({
          global_search_session_id: newSessionId("gs"),
          search_session_id: newSessionId("ss"),
        }),
        fe_filter_options: JSON.stringify(filterOptions),
        keyword: plan.query,
        limit: "60",
        newest: String((page - 1) * 60),
        order,
        page_type: "search",
        scenario: "PAGE_GLOBAL_SEARCH",
        source: "SRP",
        version: "2",
        view_session_id: newSessionId("view"),
      });
      const response = await request(`v4/search/search_items?${query}`, "search", signal);
      const items = arrayValue(response.items, "search.items");
      const listings = items.flatMap((entry) => {
        const result = record(entry, "search item");
        if (result.adsid !== null && result.adsid !== undefined) return [];
        const data = record(result.item_data ?? result.item_basic ?? result, "search item data");
        const listingId = stringValue(
          data.itemid ?? data.item_id ?? result.itemid ?? result.item_id,
        );
        const sellerId = stringValue(
          data.shopid ?? data.shop_id ?? result.shopid ?? result.shop_id,
        );
        if (!listingId || !sellerId)
          throw new Error("Organic Shopee search result is missing item or shop ID.");
        const itemBasic =
          result.item_basic && typeof result.item_basic === "object"
            ? (result.item_basic as JsonRecord)
            : null;
        const title =
          stringValue(itemBasic?.name ?? data.name ?? result.title) ?? `Shopee item ${listingId}`;

        return [
          {
            listing_id: listingId,
            seller_id: sellerId,
            url: productUrl({ listing_id: listingId, seller_id: sellerId, title, url: "" }),
            title,
          },
        ];
      });
      if (typeof response.nomore !== "boolean")
        throw new Error("Shopee search response is missing pagination state.");

      const has_more = !response.nomore;
      const results: SearchResults = {
        items: listings,
        next_page: has_more ? page + 1 : null,
        has_more,
      };

      return ok(results);
    },

    async getProductDetails(listing, signal) {
      const { data, item } = await getProduct(listing, signal, true);
      const title = stringValue(item.title ?? item.name) ?? listing.title;
      const rawModels = Array.isArray(item.models) ? item.models : [];
      const models = rawModels.map((model) => record(model, "product model"));
      const priceData = record(data.product_price ?? {}, "get_product.data.product_price");
      const priceModel = record(
        priceData.price_model ?? {},
        "get_product.data.product_price.price_model",
      );
      const defaultVariantId = stringValue(priceModel.price_single_model_id);
      const variants = models.flatMap((model, index) => {
        const variantId = stringValue(model.model_id);
        if (!variantId) throw new Error("Shopee product model is missing its ID.");
        const name = stringValue(model.name) ?? `Biến thể ${index + 1}`;

        return [
          {
            variant_id: variantId,
            name,
            model: modelFromTitle(name),
            storage_gb: storageFromTitle(name),
          },
        ];
      });
      if (!variants.length) {
        if (!defaultVariantId) throw new Error("Shopee product has no confirmed model ID.");
        variants.push({
          variant_id: defaultVariantId,
          name: "Mặc định",
          model: null,
          storage_gb: null,
        });
      }

      const rawCondition = conditionFromApi(item.condition);
      const productSources: FieldSource[] = [];
      const model = modelFromTitle(title);
      const storage_gb = storageFromTitle(title);
      if (model) productSources.push(source(listing, "product.model"));
      if (storage_gb !== null) productSources.push(source(listing, "product.storage_gb"));
      if (rawCondition) productSources.push(source(listing, "product.condition"));

      return ok<ProductDetails>({
        listing_id: stringValue(item.item_id) ?? listing.listing_id,
        title,
        model,
        storage_gb,
        condition: rawCondition,
        variants,
        default_variant_id:
          defaultVariantId && variants.some((v) => v.variant_id === defaultVariantId)
            ? defaultVariantId
            : null,
        sources: productSources,
      });
    },

    async getSellerDetails(listing, signal) {
      const { data } = await getProduct(listing, signal);
      const shop = record(data.shop_detailed ?? {}, "get_product.data.shop_detailed");
      const account =
        shop.account && typeof shop.account === "object" ? (shop.account as JsonRecord) : {};
      const is_mall = typeof shop.is_official_shop === "boolean" ? shop.is_official_shop : null;
      const ratingValue = numberValue(shop.rating_star);
      const rating =
        ratingValue !== null && ratingValue >= 0 && ratingValue <= 5 ? ratingValue : null;
      const sold_count = numberValue(shop.sold_total);
      const sources: FieldSource[] = [];
      if (is_mall !== null) sources.push(source(listing, "seller.is_mall"));
      if (rating !== null) sources.push(source(listing, "seller.rating"));
      if (sold_count !== null && Number.isSafeInteger(sold_count))
        sources.push(source(listing, "seller.sold_count"));

      const name = stringValue(shop.name ?? account.username);
      if (!name) throw new Error(`Shopee seller name missing for shop ${listing.seller_id}.`);

      return ok<SellerDetails>({
        seller_id: stringValue(shop.shopid) ?? listing.seller_id,
        name,
        is_mall,
        rating,
        sold_count: sold_count !== null && Number.isSafeInteger(sold_count) ? sold_count : null,
        sources,
      });
    },

    async getReviews(listing, signal) {
      const query = new URLSearchParams({
        exclude_filter: "1",
        fe_toggle: "[2,3]",
        filter: "0",
        filter_size: "0",
        flag: "1",
        fold_filter: "0",
        itemid: listing.listing_id,
        limit: "20",
        need_translation: "1",
        offset: "0",
        preferred_item_include_type: "1",
        preferred_item_item_id: "",
        preferred_item_shop_id: "",
        relevant_reviews: "false",
        request_source: "2",
        shopid: listing.seller_id,
        tag_filter: "",
        type: "0",
        variation_filters: "",
      });
      const response = await request(`v2/item/get_ratings?${query}`, "get_ratings", signal);
      const data = record(response.data, "get_ratings.data");

      return ok<Review[]>(
        arrayValue(data.ratings, "get_ratings.data.ratings").map((entry) => {
          const rating = record(entry, "rating");
          const productItems = Array.isArray(rating.product_items) ? rating.product_items : [];
          const item = productItems[0] ? record(productItems[0], "rating product item") : null;
          const reviewId = stringValue(rating.cmtid);
          const timestamp = numberValue(rating.ctime);
          if (!reviewId || timestamp === null)
            throw new Error(
              `Shopee returned a review without an ID or timestamp for ${listing.listing_id}.`,
            );
          const ratingValue = numberValue(rating.rating_star);

          return {
            review_id: reviewId,
            variant_id: item ? stringValue(item.modelid) : null,
            rating:
              ratingValue !== null && ratingValue >= 0 && ratingValue <= 5 ? ratingValue : null,
            text: typeof rating.comment === "string" ? rating.comment : "",
            posted_at: new Date(timestamp * 1000).toISOString(),
            source_url: listing.url,
          };
        }),
      );
    },

    async getOfferQuote(listing, variantId, buyer: BuyerContext, signal) {
      const { item } = await getProduct(listing, signal);
      if (!Number.isSafeInteger(buyer.quantity) || buyer.quantity <= 0)
        throw new Error("Shopee quote quantity must be a positive integer.");
      const models = Array.isArray(item.models)
        ? item.models.map((model) => record(model, "product model"))
        : [];
      const selectedModel = models.find((model) => stringValue(model.model_id) === variantId);
      if (!selectedModel)
        throw new Error(
          `Shopee variant ${variantId} was not found for item ${listing.listing_id}.`,
        );
      const extinfo = record(selectedModel.extinfo, "product model extinfo");
      const tiers = arrayValue(extinfo.tier_index, "product model tier_index");
      if (tiers.some((tier) => !Number.isInteger(tier) || Number(tier) < 0))
        throw new Error("Shopee variant tier indexes are invalid.");
      const selected = await request(
        "v4/pdp/cart_panel/select_variation_pc",
        "select_variation",
        signal,
        {
          item_id: Number(listing.listing_id),
          shop_id: Number(listing.seller_id),
          quantity: buyer.quantity,
          tz_offset_in_minutes: -new Date().getTimezoneOffset(),
          selected_tiers: Object.fromEntries(tiers.map((tier, index) => [String(index), tier])),
        },
      );
      const selection = record(selected.data, "select_variation.data");
      const priceData = record(selection.product_price, "select_variation.product_price");
      const currentPrice = record(priceData.price ?? {}, "get_product.data.product_price.price");
      const selectedModelId = stringValue(
        record(priceData.price_model ?? {}, "get_product.data.product_price.price_model")
          .price_single_model_id,
      );
      if (selectedModelId !== variantId)
        throw new Error("Shopee select_variation returned a different model.");
      const item_unit_price = price(currentPrice.single_value);
      const stock = numberValue(selection.stock);
      const maximum = numberValue(selection.max_quantity);
      const in_stock =
        stock === null
          ? null
          : stock >= buyer.quantity && (maximum === null || maximum >= buyer.quantity);
      const sources: FieldSource[] = [];
      if (item_unit_price) sources.push(source(listing, "quote.item_unit_price"));
      if (in_stock !== null) sources.push(source(listing, "quote.in_stock"));
      const shipping =
        in_stock === true
          ? await estimateShipping(listing, variantId, buyer.quantity, signal)
          : {
              shipping_cost: null,
              limitations: ["Chưa ước tính phí ship: chưa xác nhận đủ số lượng tồn kho."],
            };
      if (shipping.shipping_cost) sources.push(source(listing, "quote.shipping_cost"));
      if (shipping.item_unit_price) sources.push(source(listing, "quote.item_unit_price"));
      if (shipping.other_fees) sources.push(source(listing, "quote.other_fees"));

      const quote: OfferQuote = {
        listing_id: listing.listing_id,
        variant_id: variantId,
        quantity: buyer.quantity,
        delivery_area: buyer.delivery_area,
        item_unit_price: shipping.item_unit_price ?? item_unit_price,
        shipping_cost: shipping.shipping_cost,
        shipping_estimated: shipping.shipping_cost !== null,
        limitations: shipping.limitations,
        total_estimated: shipping.total_estimated,
        other_fees: shipping.other_fees ?? null,
        discounts: [],
        total: null,
        in_stock,
        estimated_delivery_to: null,
        observed_at: new Date().toISOString(),
        sources,
      };
      quote.total = calculateTotal(quote);
      if (quote.total) sources.push(source(listing, "quote.total"));

      return ok(quote);
    },

    async getPurchasePolicies(listing, variantId, signal) {
      const { data, item } = await getProduct(listing, signal);
      const returnsValue = data.returns_accepted ?? item.returns_accepted;
      const returns_accepted = typeof returnsValue === "boolean" ? returnsValue : null;
      const returnWindow = numberValue(data.return_window_days ?? item.return_window_days);
      const warrantyMonths = numberValue(data.warranty_months ?? item.warranty_months);
      const rawConditions = data.conditions ?? item.conditions;
      const conditions =
        Array.isArray(rawConditions) && rawConditions.every((value) => typeof value === "string")
          ? rawConditions
          : null;
      const sources: FieldSource[] = [];
      if (returns_accepted !== null) sources.push(source(listing, "policies.returns_accepted"));
      if (returnWindow !== null && Number.isSafeInteger(returnWindow) && returnWindow >= 0)
        sources.push(source(listing, "policies.return_window_days"));
      if (warrantyMonths !== null && Number.isSafeInteger(warrantyMonths) && warrantyMonths >= 0)
        sources.push(source(listing, "policies.warranty_months"));
      if (conditions !== null) sources.push(source(listing, "policies.conditions"));

      return ok<PurchasePolicies>({
        listing_id: listing.listing_id,
        variant_id: variantId,
        returns_accepted,
        return_window_days:
          returnWindow !== null && Number.isSafeInteger(returnWindow) && returnWindow >= 0
            ? returnWindow
            : null,
        warranty_months:
          warrantyMonths !== null && Number.isSafeInteger(warrantyMonths) && warrantyMonths >= 0
            ? warrantyMonths
            : null,
        warranty_provider: stringValue(data.warranty_provider ?? item.warranty_provider),
        conditions,
        sources,
      });
    },
  };
}

export const shopeeAdapter = createShopeeAdapter();
