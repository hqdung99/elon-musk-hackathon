import { describe, expect, it } from "vitest";
import { canReuseProfiles, intentMessages, interpretTurn } from "../src/pipeline/interpret-turn";
import { demoAI } from "../src/providers/ai";
import { initialState, reducer } from "../src/state";

const messages = [
  "Mua 1 máy iPhone 16 128GB. Tổng tối đa 19 triệu VND. Giao tại TP.HCM. Ưu tiên giá rẻ.",
];

describe("shopping turn routing", () => {
  it("drops every old product fact when switching from iPhone to a mattress", async () => {
    const intent = await demoAI.interpretIntent(messages);
    const decision = await interpretTurn("mua nệm cao su", { intent, result: null }, demoAI);
    expect(decision.action).toBe("new_product");
    const inputs = intentMessages("mua nệm cao su", intent, decision);
    expect(inputs).toEqual(["mua nệm cao su"]);
    const next = await demoAI.interpretIntent(inputs);
    expect(next.product_description).not.toContain("iPhone");
    expect(next.quantity).toBeNull();
    expect(next.delivery_area).toBeNull();
    expect(next.requirements).toEqual([]);
  });

  it("applies revisions to the active intent without replaying old conversation", async () => {
    const intent = await demoAI.interpretIntent(messages);
    const decision = await interpretTurn(
      "Tổng tối đa 20 triệu VND.",
      { intent, result: null },
      demoAI,
    );
    expect(decision.action).toBe("revise_requirements");
    const next = await demoAI.interpretIntent(
      intentMessages("Tổng tối đa 20 triệu VND.", intent, decision),
    );
    expect(next.product_description).toBe(intent.product_description);
    expect(next.requirements.find((row) => row.field_path === "quote.total")?.value).toBe(
      20_000_000,
    );
    expect(canReuseProfiles(intent, next)).toBe(false);
  });

  it("reuses profiles only when product and hard requirements remain unchanged", async () => {
    const intent = await demoAI.interpretIntent(messages);
    const next = structuredClone(intent);
    next.preferences = [];
    expect(canReuseProfiles(intent, next)).toBe(true);
    next.quantity = 2;
    expect(canReuseProfiles(intent, next)).toBe(false);
    next.quantity = intent.quantity;
    next.questions_for_user = ["Làm rõ ưu tiên?"];
    expect(canReuseProfiles(intent, next)).toBe(false);
  });

  it("guards questions without results and rejects arbitrary execution nodes", async () => {
    const context = { intent: null, result: null };
    const ai = {
      ...demoAI,
      interpretTurn: async () => ({ action: "ask_results" as const, question: null }),
    };
    expect((await interpretTurn("Bảo hành sao?", context, ai)).action).toBe("clarify");
    await expect(
      interpretTurn("Buy", context, {
        ...demoAI,
        // Deliberately malformed provider response.
        interpretTurn: async () => ({ action: "open_checkout", question: null }) as never,
      }),
    ).rejects.toThrow();
  });

  it("never treats text approval as checkout authorization", async () => {
    expect((await interpretTurn("duyệt", { intent: null, result: null }, demoAI)).action).toBe(
      "request_approval",
    );
  });

  it("clears the displayed intent without erasing chat history", () => {
    const state = {
      ...initialState,
      busy: true,
      runId: 3,
      messages: [{ id: "old", kind: "user" as const, text: "iPhone" }],
    };
    const next = reducer(state, { type: "clearIntent", runId: 3 });
    expect(next.intent).toBeNull();
    expect(next.messages).toEqual(state.messages);
    expect(next.busy).toBe(true);
  });

  it("ignores stale turn resets and cancellation before interpretation", async () => {
    const state = { ...initialState, runId: 3 };
    expect(reducer(state, { type: "clearIntent", runId: 2 })).toBe(state);
    await expect(
      interpretTurn("mua nệm cao su", { intent: null, result: null }, demoAI, AbortSignal.abort()),
    ).rejects.toThrow();
  });
});
