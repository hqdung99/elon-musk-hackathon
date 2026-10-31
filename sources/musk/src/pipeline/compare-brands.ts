import type {
  BrandComparison,
  BrandDiscovery,
  OfferProfile,
  RankingResults,
  ShoppingIntent,
} from "../domain/schemas";
import { discoveredBrand } from "./discover-brands";
import { rankOffers } from "./rank-offers";
import { mapConcurrent } from "./profiles";
import type { PipelineDependencies } from "./types";

export async function compareOffers(
  intent: ShoppingIntent,
  candidates: OfferProfile[],
  dependencies: PipelineDependencies,
  discovery?: BrandDiscovery,
): Promise<{ ranking: RankingResults; brand_comparisons?: BrandComparison[] }> {
  if (!discovery) return { ranking: await rankOffers(intent, candidates, dependencies) };
  if (candidates.some((profile) => !discoveredBrand(profile.product.brand, discovery)))
    throw new Error("Hồ sơ so sánh thiếu thương hiệu đã xác minh.");
  const brand_comparisons = await mapConcurrent(discovery.brands, 3, async (brand) => ({
    brand: brand.name,
    ranking: await rankOffers(
      intent,
      candidates.filter(
        (profile) => discoveredBrand(profile.product.brand, discovery)?.name === brand.name,
      ),
      dependencies,
    ),
  }));
  const winners = brand_comparisons.flatMap(({ ranking }) => {
    const best = ranking.ranked_offers[0];
    if (!best) return [];
    const profile = candidates.find((candidate) => candidate.offer_id === best.offer_id);
    if (!profile) throw new Error("So sánh cùng thương hiệu tham chiếu offer không tồn tại.");

    return [profile];
  });

  return {
    ranking: await rankOffers(intent, winners, dependencies),
    brand_comparisons,
  };
}
