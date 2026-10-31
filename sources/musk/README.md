# Musk local MVP

Shopping assistant built with React, Vite, and TypeScript. Dark theme, no application backend.

## Run

Requires Node.js 22.12+. From the repository root:

```powershell
cd sources\musk
npm install
npm run dev
```

Open the URL printed by Vite. Default mode uses OpenAI and live Shopee; configure credentials below. For a credential-free demo, select demo AI and fixture data in **Cấu hình**.

## Enable OpenAI + Shopee

1. In browser DevTools, copy a working Shopee request (e.g. `select_variation_pc`) as
   **cURL (cmd)**, **PowerShell**, or **fetch**, then run:

   ```powershell
   Get-Clipboard -Raw | npm run setup:shopee
   ```

   This saves the five required Shopee headers and adds an empty OpenAI key entry if missing. Existing OpenAI settings are preserved.
   PowerShell copies are parsed as text, never executed; cookies and UserAgent are
   extracted from the captured WebRequestSession. Alternatively read a saved copy:

   ```powershell
   npm run setup:shopee -- .\request.txt
   ```

2. Fill the key in the ignored `.env.local`, keeping the Shopee headers:

   ```dotenv
   VITE_OPENAI_API_KEY="YOUR_ROTATED_DEMO_KEY"
   ```

   Optional model setting (default `gpt-5-mini`): [.env.example](.env.example).

3. Restart Vite. In **Cấu hình**, select **OpenAI** and **Shopee**. OpenAI settings load automatically and are read-only.

Refresh Shopee headers with the same command when the session expires; restart Vite after environment changes.

## Try it

> Mua 1 máy iPhone 16 128GB mới. Tổng ngân sách tối đa 25 triệu VND. Giao tại TP.HCM. Chỉ mua Shopee Mall. Ưu tiên giá rẻ.

Musk automatically chooses a SKU matching explicit requirements. If no variant constraint is stated, it chooses the default or any listed SKU. Clear non-matches are skipped; only unresolved explicit variant constraints need manual selection. Inspect the recommendation, then click **Duyệt & kiểm tra lại**.
Expand **Các listing đã xem** to see the search, every returned organic listing, and why each was kept, removed, skipped, or not evaluated due to limits.
The cap is **12 retained offers** (unknowns included), not 12 raw listings; search is bounded to 3 pages.
If revalidation allows continuing, Musk leaves only the approved SKU and quantity in the cart.
Click **Mở giỏ hàng Shopee** to continue manually using the same Shopee account.

## Important

- **Each quote clears the entire real cart. Old contents are not restored.** Musk quotes one SKU, removes it, and verifies the cart is empty before the next option. Do not edit the cart during processing.
- Approval leaves only the approved SKU and quantity. If cleanup fails, empty the cart and reload Musk before retrying.
- Musk fetches shop and platform vouchers for the selected SKU and subtracts the largest eligible cash voucher once from the reconciled checkout estimate. Vouchers are not stacked; select the displayed code manually at checkout. Shipping uses the saved account address and remains estimated. Missing pricing and policies stay unknown.
- Known term changes or failed requirements block handoff; unknown checks remain visible warnings. Verify intended items and all final terms on Shopee.
- **Musk never places orders or makes payments.**
- Never commit credentials. Shopee headers stay server-side; **`VITE_` OpenAI keys are browser-visible and embedded in builds**. Do not share credential-containing builds.
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
