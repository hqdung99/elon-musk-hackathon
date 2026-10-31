import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ActivityLog, formatDuration } from "../src/components/chat/ActivityLog";
import { demoAI } from "../src/providers/ai";
import { trackAI, trackMarketplace } from "../src/providers/activity";
import type { Activity } from "../src/providers/activity";
import { createFixtureMarketplace } from "../src/providers/fixtures";
import { initialState, reducer } from "../src/state";

it("reports each AI call as running, then done, and passes results through", async () => {
  const events: Activity[] = [];
  const ai = trackAI(demoAI, (activity) => events.push(activity));
  const intent = await ai.interpretIntent([
    "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM.",
  ]);
  expect(intent).toEqual(
    await demoAI.interpretIntent([
      "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM.",
    ]),
  );
  expect(ai.mode).toBe("demo");
  expect(events.map(({ label, status, source }) => ({ label, status, source }))).toEqual([
    { label: "AI phân tích yêu cầu", status: "running", source: "ai" },
    { label: "AI phân tích yêu cầu", status: "done", source: "ai" },
  ]);
  expect(events[0].id).toBe(events[1].id);
  expect(events[1].ended_at).not.toBeNull();
});

it("marks failed calls as errors and rethrows", async () => {
  const events: Activity[] = [];
  const failure = new Error("timeout");
  const ai = trackAI({ ...demoAI, rankOffers: vi.fn().mockRejectedValue(failure) }, (activity) =>
    events.push(activity),
  );
  await expect(
    ai.rankOffers(await demoAI.interpretIntent(["Mua 1 máy iPhone 16 128GB"]), []),
  ).rejects.toBe(failure);
  expect(events.at(-1)).toMatchObject({
    label: "AI so sánh các lựa chọn",
    detail: "0 lựa chọn",
    status: "error",
  });
});

it("describes marketplace calls with the listing and result counts", async () => {
  const events: Activity[] = [];
  const marketplace = trackMarketplace(createFixtureMarketplace(), (activity) =>
    events.push(activity),
  );
  const plan = { query: "iPhone 16", filters: [], sort_by: null, post_search_requirement_ids: [] };
  const result = await marketplace.searchProducts(plan, 1);
  if (result.status !== "ok") throw new Error("Expected fixture results.");
  expect(events.at(-1)).toMatchObject({
    label: "Tìm “iPhone 16”",
    detail: `trang 1 · ${result.data.items.length} kết quả`,
    status: "done",
  });
  await marketplace.getProductDetails(result.data.items[0]);
  expect(events.at(-1)).toMatchObject({
    label: "Đọc chi tiết sản phẩm",
    detail: result.data.items[0].title,
  });
  expect(marketplace.mode).toBe("fixture");
});

it("keeps activities per run and ignores reports from superseded runs", () => {
  const activity: Activity = {
    id: 1,
    source: "ai",
    label: "AI phân tích yêu cầu",
    detail: null,
    status: "running",
    started_at: 0,
    ended_at: null,
  };
  let state = reducer(initialState, { type: "start", runId: 2 });
  state = reducer(state, { type: "activity", runId: 2, activity });
  state = reducer(state, {
    type: "activity",
    runId: 2,
    activity: { ...activity, status: "done", ended_at: 5 },
  });
  expect(state.activities).toEqual([{ ...activity, status: "done", ended_at: 5 }]);
  expect(reducer(state, { type: "activity", runId: 1, activity: { ...activity, id: 9 } })).toBe(
    state,
  );
  expect(reducer(state, { type: "start", runId: 3 }).activities).toEqual([]);
});

it("shows running and recent steps with timers, and explains slow AI calls", () => {
  vi.useFakeTimers({ now: 100_000 });
  try {
    const step = (id: number, status: Activity["status"], started_at: number): Activity => ({
      id,
      source: "ai",
      label: `Bước ${id}`,
      detail: id === 7 ? "12 listing" : null,
      status,
      started_at,
      ended_at: status === "running" ? null : started_at + 1_500,
    });
    const html = renderToStaticMarkup(
      createElement(ActivityLog, {
        stage: "Thu thập bằng chứng",
        activities: [1, 2, 3, 4, 5, 6]
          .map((id) => step(id, "done", 0))
          .concat(step(7, "running", 80_000)),
      }),
    );
    expect(html).toContain("Thu thập bằng chứng");
    expect(html).not.toContain("Bước 1<");
    expect(html).toContain("Bước 3");
    expect(html).toContain("Bước 7<small>12 listing</small>");
    expect(html).toContain("20s");
    expect(html).toContain("mỗi lượt gọi có thể mất tới 60 giây");
  } finally {
    vi.useRealTimers();
  }
});

it("formats durations compactly", () => {
  expect(formatDuration(1_234)).toBe("1.2s");
  expect(formatDuration(42_900)).toBe("42s");
  expect(formatDuration(65_000)).toBe("1m 05s");
});
