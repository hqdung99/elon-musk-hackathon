import { useState } from "react";
import type { OpenAIConfig } from "../../providers/ai";
import type { FixtureScenario } from "../../providers/fixtures";

export interface SettingsValue {
  aiMode: "demo" | "openai";
  dataMode: "fixture" | "shopee";
  scenario: FixtureScenario;
  openai: OpenAIConfig;
}

export function Settings({
  value,
  onSave,
  onClose,
}: {
  value: SettingsValue;
  onSave: (value: SettingsValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const { openai } = value;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">LOCAL WORKSPACE</div>
            <h2 id="settings-title">Cấu hình bản MVP</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng cấu hình">
            ×
          </button>
        </div>
        <p className="muted small">
          Không backend. Không lưu key hay hội thoại trong trình duyệt. Cấu hình local được nạp lại
          khi tải trang.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ ...draft, openai });
          }}
        >
          <label>
            AI xử lý
            <select
              value={draft.aiMode}
              onChange={(event) =>
                setDraft({ ...draft, aiMode: event.target.value === "openai" ? "openai" : "demo" })
              }
            >
              <option value="demo">Demo theo kịch bản · không gọi AI</option>
              <option value="openai">OpenAI · LangChain</option>
            </select>
          </label>
          <label>
            Dữ liệu sản phẩm
            <select
              value={draft.dataMode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  dataMode: event.target.value === "shopee" ? "shopee" : "fixture",
                })
              }
            >
              <option value="fixture">Fixture · dữ liệu giả lập</option>
              <option value="shopee">Shopee · API qua proxy cục bộ</option>
            </select>
          </label>
          {draft.dataMode === "shopee" && (
            <p className="callout warning">
              Musk sẽ xóa toàn bộ giỏ Shopee trước mỗi lần báo giá; nội dung cũ không được khôi
              phục. Mỗi lần chỉ thêm một SKU, kiểm tra giá và phí ship rồi xóa SKU đó, kiểm tra giỏ
              trống trước khi thử phương án tiếp theo. Musk trừ một voucher tiền mặt đủ điều kiện
              vào tổng ước tính. Không chỉnh sửa giỏ trong lúc xử lý. Phí áp dụng cho địa chỉ lưu
              trên tài khoản, không phải khu vực đã nhập. Sau khi bạn duyệt và kiểm tra lại thành
              công, giỏ chỉ giữ SKU với số lượng đã duyệt để tiếp tục thủ công. Cần đăng nhập cùng
              tài khoản Shopee trên trình duyệt. Không đặt hàng hay thanh toán. Nếu không dọn được
              giỏ, Musk sẽ dừng và báo lỗi.
            </p>
          )}
          <label>
            Kịch bản kiểm tra lại
            <select
              value={draft.scenario}
              onChange={(event) => {
                const next = event.target.value;
                if (
                  next === "unchanged" ||
                  next === "price_changed" ||
                  next === "out_of_stock" ||
                  next === "unknown_shipping"
                )
                  setDraft({ ...draft, scenario: next });
              }}
            >
              <option value="unchanged">Điều kiện giữ nguyên</option>
              <option value="price_changed">Giá tăng 100.000đ / máy</option>
              <option value="out_of_stock">Hết hàng</option>
              <option value="unknown_shipping">Không xác nhận phí ship</option>
            </select>
          </label>
          {draft.aiMode === "openai" && (
            <fieldset>
              <legend>OpenAI</legend>
              <p className="small">Endpoint: {openai.endpoint}</p>
              <p className="small">Model: {openai.model}</p>
              <p className={openai.apiKey.trim() ? "callout" : "callout warning"}>
                {openai.apiKey.trim()
                  ? "Đã nạp API key từ cấu hình local."
                  : "Chưa có API key OpenAI."}
              </p>
              <p className="muted small">
                Cấu hình OpenAI chỉ đọc. Đặt VITE_OPENAI_API_KEY và các tùy chọn OpenAI trong
                .env.local, rồi khởi động lại Vite.
              </p>
              <p className="callout warning">
                Khi chạy OpenAI, tin nhắn và bằng chứng sản phẩm sẽ được gửi đến endpoint này. Key
                hiển thị được trong trình duyệt. Chỉ dùng key demo đã xoay vòng.
              </p>
            </fieldset>
          )}
          <button className="button primary full" type="submit">
            Áp dụng cấu hình
          </button>
        </form>
      </section>
    </div>
  );
}
