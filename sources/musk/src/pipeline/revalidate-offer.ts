import { validateApprovedOffer } from "../domain/checkout";
import type { CheckoutApproval } from "../domain/checkout";
import type { ShoppingIntent } from "../domain/schemas";
import { assembleProfile } from "./profiles";
import type { PipelineDependencies, RevalidationResult } from "./types";

export async function revalidateOffer(
  runId: number,
  approval: CheckoutApproval,
  intent: ShoppingIntent,
  { ai, marketplace, signal }: PipelineDependencies,
): Promise<RevalidationResult> {
  const profile = approval.displayed_offer;
  const fresh = await assembleProfile(
    {
      listing_id: profile.product.listing_id,
      seller_id: profile.seller.seller_id,
      url: profile.listing_url,
      title: profile.product.title,
    },
    intent,
    marketplace,
    ai,
    signal,
    profile.selected_variant_id,
  );
  signal?.throwIfAborted();
  const validation = validateApprovedOffer(approval, fresh, intent, runId);

  return { fresh, validation };
}
