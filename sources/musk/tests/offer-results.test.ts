import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OfferResults } from "../src/components/offers/OfferResults";
import type { PipelineResult } from "../src/domain/schemas";
import { runPipeline } from "../src/pipeline/orchestrator";
import { demoAI } from "../src/providers/ai";
import { createFixtureMarketplace } from "../src/providers/fixtures";

const request =
  "Mua 1 máy iPhone 16 128GB, tổng tối đa 25 triệu VND, giao tại TP.HCM. Bảo hành tối thiểu 12 tháng. Ưu tiên giá rẻ.";
function render(result: PipelineResult) {
  return renderToStaticMarkup(
    createElement(OfferResults, {
      result,
      active: true,
      onApprove: vi.fn(),
      onDecline: vi.fn(),
      onRevise: vi.fn(),
    }),
  );
}

it("shows one named recommendation and keeps selectable alternatives collapsed", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  const html = render(output.result);
  const winner = output.result.profiles.find(
    (profile) => profile.offer_id === output.result.recommendation.recommended_offer_id,
  );
  expect(winner).toBeDefined();
  expect(html).toContain(`Musk đề xuất: ${winner?.seller.name}`);
  const [primary, alternatives] = html.split('<details class="excluded alternatives">');
  expect(primary.match(/class="offer-card /g)).toHaveLength(1);
  expect(alternatives.match(/class="offer-card /g)).toHaveLength(2);
  expect(html).not.toContain('class="excluded alternatives" open');
  expect(html.match(/ĐỀ XUẤT CHO BẠN/g)).toHaveLength(1);
  expect(html).toContain("THAM KHẢO #2");
  expect(html).toContain("Chọn offer này");
  expect(html).toContain("Các listing đã xem");
  const shopeeHtml = render({ ...output.result, mode: "shopee/demo" }).replace(/\s+/g, " ");
  expect(shopeeHtml).toContain("xóa toàn bộ giỏ cũ, không khôi phục");
  expect(shopeeHtml).toContain("giỏ Shopee chỉ giữ SKU với số lượng đã duyệt");
});

it("labels estimated totals without claiming local voucher optimization", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  for (const profile of output.result.profiles) profile.quote.total_estimated = true;
  const html = render(output.result);
  expect(html).toContain("Tổng ước tính");
  expect(html).toContain("tính trong ước tính");
  expect(html).toContain("cần xác nhận tại Shopee");
  expect(html).not.toContain("(đã áp dụng)");
  expect(html).not.toContain("voucher tính cục bộ");
  expect(html).not.toContain("API trả");
});

it("does not invent a winner or show approval when all offers fail requirements", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace("out_of_stock", true),
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  const html = render(output.result);
  expect(html).toContain("Chưa có offer phù hợp.");
  expect(html).not.toContain("Musk đề xuất:");
  expect(html).not.toContain('class="offer-card ');
  expect(html).not.toContain("Duyệt &amp; kiểm tra lại");
});
