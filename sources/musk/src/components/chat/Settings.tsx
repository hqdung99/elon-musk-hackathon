import { useState } from "react";
import type { AzureConfig, OpenAIConfig } from "../../providers/ai";
import type { FixtureScenario } from "../../providers/fixtures";
import { parseShopeeCurl } from "../../providers/shopee-headers";
import type { ShopeeHeaders } from "../../providers/shopee-headers";

export interface SettingsValue {
  aiMode: "demo" | "openai" | "azure";
  dataMode: "fixture" | "shopee";
  scenario: FixtureScenario;
  openai: OpenAIConfig;
  azure: AzureConfig;
  shopee: ShopeeHeaders | null;
}

export const aiProviderName = (mode: SettingsValue["aiMode"]) =>
  mode === "openai" ? "OpenAI" : mode === "azure" ? "Azure OpenAI" : "AI demo";

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
  const [curl, setCurl] = useState("");
  const [curlError, setCurlError] = useState<string | null>(null);
  const { azure } = value;

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
          Không backend. Key OpenAI và header Shopee nhập ở đây được lưu trong localStorage của
          trình duyệt này; hội thoại không được lưu.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            let shopee = draft.shopee;
            if (curl.trim())
              try {
                shopee = parseShopeeCurl(curl);
              } catch (error) {
                setCurlError(error instanceof Error ? error.message : "Không đọc được cURL.");

                return;
              }

            onSave({ ...draft, azure, shopee });
          }}
        >
          <label>
            AI xử lý
            <select
              value={draft.aiMode}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "demo" || next === "openai" || next === "azure")
                  setDraft({ ...draft, aiMode: next });
              }}
            >
              <option value="demo">Demo theo kịch bản · không gọi AI</option>
              <option value="openai">OpenAI · LangChain</option>
              <option value="azure">Azure OpenAI · LangChain (.env.local)</option>
            </select>
          </label>
          {draft.aiMode === "openai" && (
            <fieldset>
              <legend>OpenAI</legend>
              <label>
                API key
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-..."
                  value={draft.openai.apiKey}
                  onChange={(event) =>
                    setDraft({ ...draft, openai: { ...draft.openai, apiKey: event.target.value } })
                  }
                />
              </label>
              <label>
                Model
                <input
                  spellCheck={false}
                  value={draft.openai.model}
                  onChange={(event) =>
                    setDraft({ ...draft, openai: { ...draft.openai, model: event.target.value } })
                  }
                />
              </label>
              <p className="callout warning">
                Tin nhắn và bằng chứng sản phẩm được gửi thẳng từ trình duyệt đến api.openai.com.
                Chỉ dùng key demo ngắn hạn và thu hồi sau khi dùng.
              </p>
            </fieldset>
          )}
          {draft.aiMode === "azure" && (
            <fieldset>
              <legend>Azure OpenAI</legend>
              <p className="small">Endpoint: {azure.endpoint}</p>
              <p className="small">Deployment: {azure.deployment}</p>
              <p className="small">API version: {azure.apiVersion}</p>
              <p className={azure.apiKey.trim() ? "callout" : "callout warning"}>
                {azure.apiKey.trim()
                  ? "Đã nạp API key từ cấu hình local."
                  : "Chưa có API key Azure."}
              </p>
              <p className="muted small">
                Cấu hình Azure chỉ đọc. Đặt VITE_AZURE_OPENAI_API_KEY và các tùy chọn Azure trong
                .env.local, rồi khởi động lại Vite.
              </p>
              <p className="callout warning">
                Khi chạy Azure, tin nhắn và bằng chứng sản phẩm sẽ được gửi đến endpoint này. Key
                hiển thị được trong trình duyệt. Chỉ dùng key demo đã xoay vòng. CORS và API version
                cần được hỗ trợ.
              </p>
            </fieldset>
          )}
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
            <fieldset>
              <legend>Phiên Shopee</legend>
              <p className={draft.shopee ? "callout" : "callout warning"}>
                {draft.shopee
                  ? "Đã có header phiên Shopee. Dán cURL mới bên dưới để thay khi phiên hết hạn."
                  : "Chưa có header phiên Shopee."}
              </p>
              <label>
                Dán cURL
                <textarea
                  spellCheck={false}
                  placeholder="curl 'https://shopee.vn/api/v4/...' -H 'Cookie: ...' ..."
                  value={curl}
                  onChange={(event) => {
                    setCurl(event.target.value);
                    setCurlError(null);
                  }}
                />
              </label>
              {curlError && <p className="callout warning">{curlError}</p>}
              <p className="muted small">
                Trong DevTools → Network, chuột phải một request tới shopee.vn/api (đã đăng nhập) →
                Copy as cURL. Musk lấy cookie, CSRF token, af-ac-enc-dat, user-agent và referer;
                proxy Vite cục bộ chuyển chúng tới Shopee.
              </p>
              {draft.shopee && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setDraft({ ...draft, shopee: null })}
                >
                  Xóa header Shopee
                </button>
              )}
              <p className="callout warning">
                Musk sẽ xóa toàn bộ giỏ Shopee trước mỗi lần báo giá; nội dung cũ không được khôi
                phục. Mỗi lần chỉ thêm một SKU, kiểm tra giá và phí ship rồi xóa SKU đó, kiểm tra
                giỏ trống trước khi thử phương án tiếp theo. Giá Shopee đã gồm voucher, Musk không
                trừ thêm. Không chỉnh sửa giỏ trong lúc xử lý. Phí áp dụng cho địa chỉ lưu trên tài
                khoản, không phải khu vực đã nhập. Sau khi bạn duyệt và kiểm tra lại thành công, giỏ
                chỉ giữ SKU với số lượng đã duyệt để tiếp tục thủ công. Cần đăng nhập cùng tài khoản
                Shopee trên trình duyệt. Không đặt hàng hay thanh toán. Nếu không dọn được giỏ, Musk
                sẽ dừng và báo lỗi.
              </p>
            </fieldset>
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
          <button className="button primary full" type="submit">
            Áp dụng cấu hình
          </button>
        </form>
      </section>
    </div>
  );
}
