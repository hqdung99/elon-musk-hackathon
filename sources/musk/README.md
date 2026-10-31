# Musk local MVP

Shopping assistant built with React, Vite, and TypeScript. Dark theme, no application backend.

## Run

Requires Node.js 22.12+. From the repository root:

```powershell
cd sources\musk
npm install
npm run dev
```

Open the URL printed by Vite. Default mode uses fixture data and scripted demo AI; no credentials needed.

## Enable OpenAI + Shopee

Open **Cấu hình** in the app:

1. **AI xử lý → OpenAI**: paste your OpenAI API key; the model defaults to `gpt-5-mini`.
2. **Dữ liệu sản phẩm → Shopee**: in browser DevTools → Network, right-click a logged-in request to `shopee.vn/api/...` → **Copy as cURL** (bash or cmd), and paste it into **Dán cURL**. Musk keeps the cookie, CSRF token, `af-ac-enc-dat`, user-agent and referer.
3. Click **Áp dụng cấu hình**.

Keys and headers are saved in this browser's localStorage and survive reloads; use **Xóa header Shopee** or clear site data to remove them. Paste a fresh cURL when the Shopee session expires.

Azure OpenAI is still configured through `.env.local` (`VITE_AZURE_OPENAI_API_KEY` and the options in [.env.example](.env.example)); restart Vite after changing it.

## Try it

> Mua 1 máy iPhone 16 128GB mới. Tổng ngân sách tối đa 25 triệu VND. Giao tại TP.HCM. Chỉ mua Shopee Mall. Ưu tiên giá rẻ.

Choose a SKU or skip each listing, inspect the recommendation, then click **Duyệt & kiểm tra lại**.
Expand **Các listing đã xem** to see the search, every returned organic listing, and why each was kept, removed, skipped, or not evaluated due to limits.
The cap is **12 retained offers** (unknowns included), not 12 raw listings; search is bounded to 3 pages.
If revalidation allows continuing, Musk leaves only the approved SKU and quantity in the cart.
Click **Mở giỏ hàng Shopee** to continue manually using the same Shopee account.

## Important

- **Each quote clears the entire real cart. Old contents are not restored.** Musk quotes one SKU, removes it, and verifies the cart is empty before the next option. Do not edit the cart during processing.
- Approval leaves only the approved SKU and quantity. If cleanup fails, empty the cart and reload Musk before retrying.
- Shopee prices already include vouchers; Musk uses them unchanged, without fetching or subtracting more vouchers. Shipping uses the saved account address and remains estimated. Missing pricing and policies stay unknown.
- Known term changes or failed requirements block handoff; unknown checks remain visible warnings. Verify intended items and all final terms on Shopee.
- **Musk never places orders or makes payments.**
- Never commit credentials. **The OpenAI key and Shopee session headers are stored in plain text in this browser profile** and sent to the local Vite proxy (Shopee) or straight to api.openai.com (OpenAI); use short-lived keys and revoke them after demos. **`VITE_` Azure keys are browser-visible and embedded in builds**. Do not share credential-containing builds.
- The Shopee proxy works only during development. API errors never silently switch to demo data. Search is bounded, not market-wide; conversations clear on reload.

## Validate

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Tests use mocked network responses; live use requires valid credentials and API availability.
Architecture details: [specs/plan.md](specs/plan.md).
