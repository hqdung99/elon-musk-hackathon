import { validateSearchPlan } from "../domain/requirements";
import { searchPlanSchema } from "../domain/schemas";
import type { SearchPlan, ShoppingIntent } from "../domain/schemas";
import { unwrap } from "../providers/marketplace";
import type { PipelineDependencies } from "./types";

export async function planSearch(
  intent: ShoppingIntent,
  { ai, marketplace, signal }: PipelineDependencies,
): Promise<SearchPlan> {
  const capabilities = unwrap(
    await marketplace.getSearchCapabilities(intent.product_description, signal),
  );
  const plan = searchPlanSchema.parse(await ai.buildSearchPlan(intent, capabilities, signal));
  validateSearchPlan(plan, capabilities, intent);

  return plan;
}
