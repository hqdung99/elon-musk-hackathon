import type { OfferProfile } from "../domain/schemas";
import type { AdapterResult } from "./marketplace";
import { shopeeAdapter } from "./shopee-marketplace";

export interface CheckoutNavigation {
  status: "ready" | "opened" | "simulated";
  checkout_url: string | null;
  message: string;
}

export type CheckoutOutcome =
  CheckoutNavigation | Extract<AdapterResult<CheckoutNavigation>, { status: "not_implemented" }>;

export interface CheckoutAdapter {
  openCheckout(
    profile: OfferProfile,
    signal?: AbortSignal,
  ): Promise<AdapterResult<CheckoutNavigation>>;
}

export const shopeeCheckout: CheckoutAdapter = shopeeAdapter;

export const fixtureCheckout: CheckoutAdapter = {
  async openCheckout() {
    return {
      status: "ok",
      data: {
        status: "simulated",
        checkout_url: null,
        message:
          "Mô phỏng hoàn tất: điều kiện vẫn khớp. Không mở Shopee, không đặt hàng hay thanh toán.",
      },
    };
  },
};
