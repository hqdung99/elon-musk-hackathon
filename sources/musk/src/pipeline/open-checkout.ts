import type { OfferProfile } from "../domain/schemas";
import type { CheckoutAdapter, CheckoutOutcome } from "../providers/checkout";

export async function openCheckout(
  profile: OfferProfile,
  checkout: CheckoutAdapter,
  signal?: AbortSignal,
): Promise<CheckoutOutcome> {
  signal?.throwIfAborted();
  const result = await checkout.openCheckout(profile, signal);

  return result.status === "ok" ? result.data : result;
}
