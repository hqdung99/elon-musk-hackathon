import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AssistantText, MissingDataNotes } from "../src/components/data-notes";

const optional = [
  "product.volume_ml",
  "product.pack_count",
  "product.model",
  "product.storage_gb",
  "product.default_variant_id",
  "seller.sold_count",
  "quote.estimated_delivery_to",
  "quote.unit_price_per_100ml",
  "policies.returns_accepted",
  "policies.return_window_days",
  "policies.warranty_months",
  "policies.warranty_provider",
  "policies.conditions",
];
const render = (text: string) => renderToStaticMarkup(createElement(AssistantText, { text }));

it("collapses the user's optional field list in existing and new chat messages", () => {
  const html = render(`Đã kiểm tra lại.\nChưa rõ: ${optional.join(", ")}.\nMô phỏng hoàn tất.`);
  const [visible, details] = html.split("<details");
  expect(visible).toContain("Đã kiểm tra lại.\nMô phỏng hoàn tất.");
  expect(visible).not.toContain("Chưa rõ:");
  expect(details).toContain("Thông tin chưa xác minh (13)");
  expect(details).not.toContain('open=""');
  expect(details).toContain("<li>Dung tích</li>");
  for (const field of optional) expect(html).not.toContain(field);
});

it("keeps essential facts, unknown requirements and lost confirmed terms visible", () => {
  const html = render(
    "Chưa rõ: product.model, quote.total, quote.in_stock, quote.quantity, quote.delivery_area.\n" +
      "Điều kiện chưa xác minh: Bảo hành ít nhất 12 tháng.\n" +
      "Đã biết lúc duyệt nhưng nay không xác nhận được: policies.warranty_months.\n" +
      "Thay đổi: quote.total.",
  );
  const visible = html.split("<details")[0];
  expect(visible).toContain("Chưa xác minh: Tổng tiền · Tồn kho · Số lượng · Khu vực giao hàng.");
  expect(visible).toContain("Điều kiện chưa xác minh: Bảo hành ít nhất 12 tháng.");
  expect(visible).toContain("Đã biết lúc duyệt nhưng nay không xác nhận được: Thời hạn bảo hành.");
  expect(visible).toContain("Thay đổi: Tổng tiền.");
});

it("does not suppress ordinary prose, unfamiliar formats or navigation outcomes", () => {
  const text = "Chưa rõ: người bán có hỗ trợ đổi trả không.\nChưa hỗ trợ mở checkout Shopee.";
  expect(render(text)).toBe(`<p>${text}</p>`);
  expect(render("Thay đổi: không có.")).toBe("<p>Thay đổi: không có.</p>");
});

it("deduplicates diagnostic notes and omits empty disclosures", () => {
  const html = renderToStaticMarkup(
    createElement(MissingDataNotes, {
      fields: ["product.model", "product.model"],
    }),
  );
  expect(html).toContain("Thông tin chưa xác minh (1)");
  expect(renderToStaticMarkup(createElement(MissingDataNotes, { fields: [] }))).toBe("");
});
