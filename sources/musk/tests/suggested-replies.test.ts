import { expect, it } from "vitest";
import { interpretIntent } from "../src/pipeline/interpret-intent";
import { canReuseProfiles, interpretTurn, intentMessages } from "../src/pipeline/interpret-turn";
import { cleanReplies } from "../src/pipeline/suggested-replies";
import { demoAI } from "../src/providers/ai";
import type { AIAdapter } from "../src/providers/ai";
import { createFixtureMarketplace } from "../src/providers/fixtures";

const deps = { ai: demoAI, marketplace: createFixtureMarketplace() };

function withSuggestions(suggested_replies: string[]): AIAdapter {
  return {
    ...demoAI,
    async interpretIntent(messages) {
      return { ...(await demoAI.interpretIntent(messages)), suggested_replies };
    },
  };
}

it("suggests replies that answer every demo question in one message", async () => {
  const asked = await interpretIntent(["Mua iPhone 16 128GB"], deps);
  expect(asked.questions_for_user).not.toContain("Bạn muốn mua số lượng bao nhiêu?");
  expect(asked.questions_for_user).toEqual(
    expect.arrayContaining(["Bạn muốn mua mấy máy?", "Bạn muốn giao hàng tại khu vực nào?"]),
  );
  const replies = asked.suggested_replies!;
  expect(replies).toEqual([
    "Tổng tối đa 19 triệu VND",
    "Tổng tối đa 25 triệu VND",
    "Ưu tiên giá rẻ",
    "Ưu tiên giao nhanh",
    "Mua 1 chiếc",
    "Mua 2 chiếc",
    "Giao tại TP.HCM",
    "Giao tại Hà Nội",
  ]);
  const answer = [replies[0], replies[2], replies[4], replies[6]].join(". ");
  const decision = { action: "answer_clarification" as const, question: null };
  const answered = await interpretIntent(intentMessages(answer, asked, decision), deps);
  expect(answered).toMatchObject({ quantity: 1, delivery_area: "tp.hcm", questions_for_user: [] });
  expect(answered.suggested_replies).toEqual([]);
});

it("puts AI suggestions before the built-in ones and drops them when nothing is asked", async () => {
  const intent = await interpretIntent(
    ["Mua iPhone 16 128GB, tổng tối đa 19 triệu VND, giao tại TP.HCM, ưu tiên giá rẻ"],
    { ...deps, ai: withSuggestions(["  Mua   1 chiếc ", "Mua 3 chiếc", ""]) },
  );
  expect(intent.questions_for_user).toHaveLength(1);
  expect(intent.suggested_replies).toEqual(["Mua 1 chiếc", "Mua 3 chiếc", "Mua 2 chiếc"]);
  const complete = await interpretIntent(
    ["Mua 1 máy iPhone 16 128GB, tổng tối đa 19 triệu VND, giao tại TP.HCM, ưu tiên giá rẻ"],
    { ...deps, ai: withSuggestions(["Mua 3 chiếc"]) },
  );
  expect(complete.questions_for_user).toEqual([]);
  expect(complete.suggested_replies).toEqual([]);
});

it("cleans clarify suggestions and leaves other turn decisions untouched", async () => {
  const intent = await demoAI.interpretIntent(["Mua 1 máy iPhone 16 128GB, giao tại TP.HCM"]);
  const clarify = await interpretTurn(
    "nệm",
    { intent, result: null },
    {
      ...demoAI,
      async interpretTurn() {
        return {
          action: "clarify",
          question: "Bạn muốn đổi sang mua nệm?",
          suggested_replies: ["Đổi sang mua nệm", " Đổi sang mua nệm ", "x".repeat(81)],
        };
      },
    },
  );
  expect(clarify.suggested_replies).toEqual(["Đổi sang mua nệm"]);
  const decision = await interpretTurn("Ưu tiên giá rẻ", { intent, result: null }, demoAI);
  expect(decision).toEqual({ action: "revise_preferences", question: null });
});

it("caps replies at eight and ignores them when deciding whether profiles can be reused", () => {
  expect(cleanReplies(["a", "b", "c", "d", "e"], ["f", "g", "h", "i"])).toEqual([
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
  ]);
  const intent = {
    product_description: "iPhone 16",
    quantity: 1,
    delivery_area: "TP.HCM",
    requirements: [],
    preferences: [],
    questions_for_user: [],
  };
  expect(canReuseProfiles(intent, { ...intent, suggested_replies: [] })).toBe(true);
});
