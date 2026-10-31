import { createApproval } from "../domain/checkout";
import { listingKey } from "../domain/schemas";
import type { OfferProfile, PipelineResult, ShoppingIntent, Stage } from "../domain/schemas";
import type { CheckoutAdapter } from "../providers/checkout";
import { filterOffers } from "./filter-offers";
import { interpretIntent } from "./interpret-intent";
import { openCheckout } from "./open-checkout";
import { planSearch } from "./plan-search";
import { buildOfferProfiles, prepareSearch } from "./profiles";
import { rankOffers } from "./rank-offers";
import { recommendOffers } from "./recommend-offers";
import { revalidateOffer } from "./revalidate-offer";
import { searchProducts } from "./search-products";
import type {
  HandoffResult,
  PipelineDependencies,
  PreparedSearch,
  RunResult,
  VariantChoices,
} from "./types";

export async function runPipeline(
  messages: string[],
  dependencies: PipelineDependencies,
): Promise<RunResult> {
  const { signal, progress = () => undefined } = dependencies;
  const stage = (value: Stage) => {
    signal?.throwIfAborted();
    progress(value);
  };

  stage("clarifying");
  const intent = await interpretIntent(messages, dependencies);

  return runWithIntent(intent, dependencies);
}

export async function runWithIntent(
  intent: ShoppingIntent,
  dependencies: PipelineDependencies,
): Promise<RunResult> {
  const { signal, progress = () => undefined } = dependencies;
  const stage = (value: Stage) => {
    signal?.throwIfAborted();
    progress(value);
  };

  if (intent.questions_for_user.length) return { status: "clarification", intent };

  stage("planning");
  const plan = await planSearch(intent, dependencies);

  stage("searching");
  const search = await searchProducts(plan, dependencies);

  stage("profiling");
  const prepared = await prepareSearch(search, intent, dependencies);
  if (
    prepared.candidates.some(
      ({ product }) => product.variants.length > 1 && product.default_variant_id === null,
    )
  )
    return { status: "selection", ...prepared };
  const choices = Object.fromEntries(
    prepared.candidates.map(({ listing, product }) => [
      listingKey(listing),
      product.default_variant_id ?? product.variants[0].variant_id,
    ]),
  );

  return { status: "complete", result: await completeSelection(prepared, choices, dependencies) };
}

export async function completeSelection(
  prepared: PreparedSearch,
  choices: VariantChoices,
  dependencies: PipelineDependencies,
): Promise<PipelineResult> {
  const { intent, truncated } = prepared;
  const { ai, marketplace, signal, progress = () => undefined } = dependencies;
  signal?.throwIfAborted();
  const keys = new Set(prepared.candidates.map(({ listing }) => listingKey(listing)));
  if (Object.keys(choices).some((key) => !keys.has(key)))
    throw new Error("Lựa chọn biến thể tham chiếu listing không tồn tại.");
  for (const { listing, product } of prepared.candidates) {
    const key = listingKey(listing);
    if (
      !Object.hasOwn(choices, key) ||
      (choices[key] !== null &&
        !product.variants.some((variant) => variant.variant_id === choices[key]))
    )
      throw new Error("Cần chọn biến thể hợp lệ hoặc bỏ qua từng listing.");
  }

  const selected = prepared.candidates.filter(
    ({ listing }) => choices[listingKey(listing)] !== null,
  );
  if (prepared.candidates.length && !selected.length)
    throw new Error("Cần chọn ít nhất một sản phẩm để tiếp tục.");
  const stage = (value: Stage) => {
    signal?.throwIfAborted();
    progress(value);
  };

  const profiles: OfferProfile[] = [];
  let retained = 0;
  const listingLimit = prepared.search_review.listing_limit;
  for (const { listing, product } of selected) {
    if (retained >= listingLimit) break;
    const built = await buildOfferProfiles(
      [listing],
      intent,
      dependencies,
      choices,
      new Map([[listingKey(listing), product]]),
    );
    profiles.push(...built);
    retained += filterOffers(built, intent).candidates.length;
  }

  const limited = truncated || profiles.length < selected.length;

  stage("filtering");
  const { filters, candidates } = filterOffers(profiles, intent);

  stage("ranking");
  const ranking = await rankOffers(intent, candidates, dependencies);

  stage("recommending");
  const recommendation = recommendOffers(intent, profiles, ranking, dependencies, limited, filters);
  const search_review = structuredClone(prepared.search_review);
  search_review.truncated = limited;
  for (const { listing } of prepared.candidates) {
    const entry = search_review.entries.find(
      (entry) => listingKey(entry.listing) === listingKey(listing),
    );
    if (!entry) throw new Error("Nhật ký tìm kiếm thiếu listing đã đánh giá.");
    if (choices[listingKey(listing)] === null) {
      entry.status = "skipped";
      entry.reasons.push("Bạn bỏ qua listing này ở bước chọn biến thể.");
      continue;
    }

    const profile = profiles.find(
      (profile) =>
        profile.product.listing_id === listing.listing_id &&
        profile.seller.seller_id === listing.seller_id,
    );
    if (!profile && retained >= listingLimit) {
      entry.status = "not_evaluated";
      entry.reasons.push(
        `Chưa đánh giá SKU vì đã đủ ${listingLimit} offer giữ lại để so sánh (kể cả còn điều kiện chưa rõ); không phải bị loại do không phù hợp.`,
      );
      continue;
    }

    const filter = filters.find((filter) => filter.offer_id === profile?.offer_id);
    const variant = profile?.product.variants.find(
      (variant) => variant.variant_id === profile.selected_variant_id,
    );
    if (!profile || !filter || !variant)
      throw new Error("Nhật ký đánh giá thiếu kết quả hoặc SKU.");
    entry.status = filter.status;
    entry.seller_name = profile.seller.name;
    entry.selected_variant = { variant_id: variant.variant_id, name: variant.name };
    entry.reasons.push(
      ...(filter.status === "eligible"
        ? ["Đáp ứng các điều kiện đã kiểm tra; giữ lại để xếp hạng."]
        : filter.checks
            .filter((check) =>
              filter.status === "excluded" ? check.result === "fail" : check.result === "unknown",
            )
            .map((check) => {
              const label =
                intent.requirements.find(
                  (requirement) => requirement.requirement_id === check.requirement_id,
                )?.user_text ??
                (check.requirement_id === "availability" ? "Tồn kho" : check.requirement_id);

              return `${check.result === "unknown" ? "Chưa xác minh, vẫn giữ" : "Không đạt"}: ${label}. ${check.reason}`;
            })),
    );
  }

  return {
    intent,
    profiles,
    filters,
    ranking,
    recommendation,
    mode: `${marketplace.mode}/${ai.mode}`,
    search_review,
  };
}

export async function approveAndRevalidate(
  runId: number,
  profile: OfferProfile,
  intent: ShoppingIntent,
  dependencies: PipelineDependencies,
  checkout: CheckoutAdapter,
): Promise<HandoffResult> {
  const approval = createApproval(runId, profile);
  dependencies.progress?.("revalidating");
  const { fresh, validation } = await revalidateOffer(runId, approval, intent, dependencies);
  const navigation =
    validation.status === "ready" || validation.status === "ready_with_unknowns"
      ? await openCheckout(fresh, checkout, dependencies.signal)
      : null;

  return { fresh, validation, navigation };
}
