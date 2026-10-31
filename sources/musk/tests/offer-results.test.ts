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
function render(result: PipelineResult, active = true) {
  return renderToStaticMarkup(
    createElement(OfferResults, {
      result,
      active,
      onApprove: vi.fn(),
      onDecline: vi.fn(),
      onRevise: vi.fn(),
    }),
  );
}

it("shows one compact recommendation and compares ranked offers side by side", async () => {
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
  const [primary, comparison] = html.split('<table class="comparison-table"');
  expect(primary.match(/class="offer-card /g)).toHaveLength(1);
  expect(html.match(/class="offer-card /g)).toHaveLength(1);
  expect(comparison.match(/scope="col"/g)).toHaveLength(3);
  expect(comparison).toContain('scope="row">Tổng tiền');
  expect(comparison).toContain('scope="row">Giao dự kiến');
  expect(comparison).toContain('scope="row">Lựa chọn');
  expect(html).toContain("<caption>So sánh offer</caption>");
  expect(html).toContain('<details class="offer-details">');
  expect(html).not.toContain('<details class="offer-details" open');
  expect(html.match(/ĐỀ XUẤT CHO BẠN/g)).toHaveLength(1);
  expect(html).toContain("THAM KHẢO #2");
  expect(html).toContain("Chọn offer này");
  expect(html).toContain("Các listing đã xem");
  const shopeeHtml = render({ ...output.result, mode: "shopee/demo" }).replace(/\s+/g, " ");
  expect(shopeeHtml).toContain("xóa toàn bộ giỏ cũ, không khôi phục");
  expect(shopeeHtml).toContain("giỏ Shopee chỉ giữ SKU với số lượng đã duyệt");
});

it("keeps full ranking explanations and limitations behind disclosures, with demo status visible", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected comparison.");
  const explanation = "Full sourced explanation preserved without truncation.";
  output.result.ranking.ranked_offers[0].preference_reasons[0].reason = explanation;
  const html = render(output.result);
  expect(html).toContain(explanation);
  expect(html).toContain("<summary>Lý do chọn &amp; lưu ý</summary>");
  expect(html).toContain('<details class="limitations">');
  expect(html).not.toContain('<details class="limitations" open');
  expect(html).toContain("Dữ liệu giả lập, không phải báo giá Shopee.");
});

it("keeps unknown requirement warnings explicit in the card and table", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });

  if (output.status !== "complete") throw new Error("Expected comparison.");
  const id = output.result.recommendation.recommended_offer_id;
  const filter = output.result.filters.find((item) => item.offer_id === id);
  if (!filter) throw new Error("Missing recommendation filter.");
  const profile = output.result.profiles.find((item) => item.offer_id === id);
  if (!profile) throw new Error("Missing recommendation profile.");
  profile.quote.in_stock = null;
  filter.checks.push({
    requirement_id: "availability",
    result: "unknown",
    reason: "Stock has not been verified.",
    profile_field_paths: ["quote.in_stock"],
  });
  const html = render(output.result);
  expect(html).toContain("Chưa rõ: Tồn kho");
  expect(html).toContain("Stock has not been verified.");
  expect(html).toContain("Chưa xác minh");
});

it("disables every comparison selection and approval for superseded results", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected comparison.");
  const html = render(output.result, false);
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)];
  expect(buttons.length).toBeGreaterThan(3);
  expect(buttons.every((match) => match[1].includes('disabled=""'))).toBe(true);
  expect(html).toContain("Bản tham khảo");
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

it("renders the selected SKU image for recommendations and alternatives", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  for (const profile of output.result.profiles) {
    profile.product.image_url = `https://down-vn.img.susercontent.com/file/product-${profile.product.listing_id}`;
    const selected = profile.product.variants.find(
      (variant) => variant.variant_id === profile.selected_variant_id,
    );
    if (!selected) throw new Error("Expected selected SKU.");
    selected.image_url = `https://down-vn.img.susercontent.com/file/sku-${profile.product.listing_id}`;
  }

  const html = render(output.result);
  expect(html).toContain('src="https://down-vn.img.susercontent.com/file/sku-value"');
  expect(html).toContain('src="https://down-vn.img.susercontent.com/file/sku-fast"');
  expect(html).not.toContain('src="https://down-vn.img.susercontent.com/file/product-value"');
  expect(html).not.toContain("phone-art");
  expect(html).toContain('referrerPolicy="no-referrer"');
});

it("uses the product image when the SKU image is missing and omits absent images", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected completed comparison.");
  const profile = output.result.profiles[0];
  profile.product.image_url = "https://down-vn.img.susercontent.com/file/product-image";
  expect(render(output.result)).toContain(
    'src="https://down-vn.img.susercontent.com/file/product-image"',
  );
  profile.product.image_url = null;
  const html = render(output.result);
  expect(html).not.toContain("Chưa có ảnh sản phẩm");
  expect(html).not.toContain("phone-art");
  expect(html).not.toContain("<img");
});

it("hides optional facts and comparison rows when every offer lacks data", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected comparison.");
  output.result.intent.preferences[0].field_path = "quote.unit_price_per_100ml";
  for (const profile of output.result.profiles) {
    profile.seller.rating = null;
    profile.seller.is_mall = null;
    profile.quote.estimated_delivery_to = null;
    profile.policies.warranty_months = null;
    profile.quote.in_stock = null;
    profile.product.volume_ml = null;
    profile.product.pack_count = null;
    profile.quote.unit_price_per_100ml = null;
    profile.missing_fields.push("policies.warranty_months");
  }

  const html = render(output.result);
  const card = html.split('<article class="offer-card ')[1].split("<details")[0];
  expect(card).not.toContain('class="rating"');
  expect(card).not.toContain('class="offer-facts"');
  expect(card).not.toContain("Mall chưa rõ");
  expect(html).not.toContain('scope="row">Giao dự kiến');
  expect(html).not.toContain('scope="row">Bảo hành');
  expect(html).not.toContain('scope="row">Tồn kho');
  expect(html).not.toContain('scope="row">Dung tích / sản phẩm');
  expect(html).not.toContain('scope="row">Sản phẩm / gói');
  expect(html).not.toContain('scope="row">Chi phí / 100ml');
  expect(html).toContain('scope="row">Tổng tiền');
  expect(html).toContain('class="evidence missing-data"');
  expect(html).toContain("<li>Thời hạn bảo hành</li>");
  expect(html).not.toContain("Chưa có dữ liệu: policies.warranty_months");
});

it("keeps partially populated rows with a quiet missing cell and preserves zero values", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected comparison.");
  const rankedProfiles = output.result.ranking.ranked_offers.map((ranked) => {
    const profile = output.result.profiles.find((item) => item.offer_id === ranked.offer_id);
    if (!profile) throw new Error("Missing ranked profile.");

    return profile;
  });
  rankedProfiles[0].policies.warranty_months = null;
  rankedProfiles[1].policies.warranty_months = 0;
  rankedProfiles[0].product.volume_ml = 500;
  rankedProfiles[0].product.pack_count = null;
  const html = render(output.result);
  const row = html.split('scope="row">Bảo hành</th>')[1].split("</tr>")[0];
  expect(row).toContain('aria-label="Chưa có dữ liệu">—');
  expect(row).toContain("0 tháng");
  expect(row).not.toContain("Chưa rõ");
  const card = html.split('<article class="offer-card ')[1].split("<details")[0];
  expect(card).toContain("500ml");
  expect(card).not.toContain("? sản phẩm / gói");
});

it("does not hide an unconfirmed total with the optional missing facts", async () => {
  const output = await runPipeline([request], {
    ai: demoAI,
    marketplace: createFixtureMarketplace(),
  });
  if (output.status !== "complete") throw new Error("Expected comparison.");
  for (const profile of output.result.profiles) profile.quote.total = null;
  const html = render(output.result);
  const card = html.split('<article class="offer-card ')[1].split("<details")[0];
  expect(card).toContain("Chưa xác nhận tổng tiền");
  const row = html.split('scope="row">Tổng tiền</th>')[1].split("</tr>")[0];
  expect(row).toContain("Chưa xác nhận");
  expect(row).not.toContain('aria-label="Chưa có dữ liệu"');
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
