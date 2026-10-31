const fieldLabels: Record<string, string> = {
  "product.volume_ml": "Dung tích",
  "product.pack_count": "Số sản phẩm / gói",
  "product.model": "Model",
  "product.storage_gb": "Dung lượng",
  "product.default_variant_id": "Biến thể mặc định",
  "product.brand": "Thương hiệu",
  "seller.sold_count": "Số lượt bán",
  "seller.rating": "Đánh giá người bán",
  "seller.is_mall": "Shopee Mall",
  "quote.total": "Tổng tiền",
  "quote.in_stock": "Tồn kho",
  "quote.quantity": "Số lượng",
  "quote.delivery_area": "Khu vực giao hàng",
  "quote.estimated_delivery_to": "Ngày giao dự kiến",
  "quote.unit_price_per_100ml": "Chi phí / 100ml",
  "policies.returns_accepted": "Chính sách đổi trả",
  "policies.return_window_days": "Thời hạn đổi trả",
  "policies.warranty_months": "Thời hạn bảo hành",
  "policies.warranty_provider": "Đơn vị bảo hành",
  "policies.conditions": "Điều kiện chính sách",
};

const essentialFields = new Set([
  "quote.total",
  "quote.in_stock",
  "quote.quantity",
  "quote.delivery_area",
]);

export function MissingDataNotes({ fields }: { fields: string[] }) {
  const unique = [...new Set(fields)];
  if (!unique.length) return null;

  return (
    <details className="evidence missing-data">
      <summary>Thông tin chưa xác minh ({unique.length})</summary>
      <ul>
        {unique.map((field) => (
          <li key={field}>{fieldLabels[field] ?? field}</li>
        ))}
      </ul>
    </details>
  );
}

function parseFields(text: string): string[] | null {
  const fields = text
    .replace(/\.$/, "")
    .split(",")
    .map((field) => field.trim());

  return fields.every((field) => /^(product|seller|quote|policies)\.[\w.[\]]+$/.test(field))
    ? fields
    : null;
}

export function AssistantText({ text }: { text: string }) {
  const optionalFields: string[] = [];
  const visible = text.split("\n").flatMap((line) => {
    const missing = line.match(/^Chưa rõ: (.+)$/);
    if (missing) {
      const fields = parseFields(missing[1]);
      if (!fields) return [line];
      optionalFields.push(...fields.filter((field) => !essentialFields.has(field)));
      const essential = fields.filter((field) => essentialFields.has(field));

      return essential.length
        ? [`Chưa xác minh: ${essential.map((field) => fieldLabels[field] ?? field).join(" · ")}.`]
        : [];
    }

    const changed = line.match(
      /^(Thay đổi: |Đã biết lúc duyệt nhưng nay không xác nhận được: )(.+)$/,
    );
    if (!changed) return [line];
    const fields = parseFields(changed[2]);

    return [
      fields
        ? `${changed[1]}${fields.map((field) => fieldLabels[field] ?? field).join(" · ")}.`
        : line,
    ];
  });

  return (
    <>
      {visible.some((line) => line.trim()) && <p>{visible.join("\n")}</p>}
      <MissingDataNotes fields={optionalFields} />
    </>
  );
}
