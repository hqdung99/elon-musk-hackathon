# Musk local MVP

Shopping assistant built with React, Vite, and TypeScript. Warm light theme, no application backend.

The UI follows the supplied Musk redesign: local logo, cream canvas, white cards,
muted chat bubbles, teal selection states and rounded controls. Stronger text,
borders and semantic colors improve clarity. Tested text-color pairs
meet 4.5:1 contrast on their surfaces; control borders and focus indicators meet
3:1. Earlier results and disabled controls remain readable instead of fading.
This is a visual refresh only; shopping logic, real product images, evidence disclosures and
explicit approval/revalidation remain unchanged. The request summary collapses
on mobile, while configuration and data-mode disclosures remain accessible.
Recommendations show the essential product, SKU, seller, total, delivery and
warranty facts. Full reasons, caveats and evidence remain expandable. Comparisons
use side-by-side tables, including within-brand groups; swipe or scroll horizontally
on narrow screens to inspect and select another offer.
Missing optional facts and absent images are omitted from recommendation cards.
Comparison rows with no data across all offers are hidden; isolated missing cells
use a dash, never a passing result. Unknown requirement warnings and unconfirmed
totals remain visible, with full missing-data notes in expandable evidence.
Chat messages, including earlier revalidation messages, collapse optional
missing-field lists into a disclosure with readable labels. Unknown requirements,
essential checkout facts and previously confirmed terms that became unknown
remain visible; stored messages and checkout validation are unchanged.

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

Musk automatically chooses a SKU matching explicit requirements. Known-unavailable SKUs
and SKUs with insufficient reported stock are excluded from automatic and manual selection;
listings with no selectable SKU are skipped. Missing availability stays unknown.
If no variant constraint is stated, it chooses the default or any selectable SKU.
Clear non-matches are skipped; only unresolved explicit variant constraints need manual selection.
Inspect the recommendation, then click **Duyệt & kiểm tra lại**.
Recommendation cards use Shopee's selected-SKU image when available, falling back
to the product image. Missing or failed images are labeled, not replaced with fake artwork.
Expand **Các listing đã xem** to see the search, every returned organic listing, and why each was kept, removed, skipped, or not evaluated due to limits.
For a known brand or product family, Musk analyzes only the **first 3 organic search results** for faster testing (ads excluded; up to 3 pages are read only to make up for ads).

For a clear category without a chosen brand, try this in **OpenAI + Shopee** mode:

> Mua 1 sản phẩm dầu gội trị gàu, giao tại TP.HCM. Tổng tối đa 350 nghìn VND. Ưu tiên giá rẻ.

The turn interpreter decides whether this starts a new shopping task; the intent
interpreter then chooses targeted search or brand discovery. Missing brand alone
does not require clarification. Discovery uses OpenAI's hosted Responses API
`web_search`, then extracts up to **3 source-backed candidate brands**. These are
not asserted market-share leaders. Citations and research limitations appear in
the results. The configured model/account must support `web_search`; research
errors remain explicit, and demo AI does not fabricate web research.

Each discovered brand gets its own Shopee search capped at **3 organic listings**
(up to **9 listings / 9 pages total**). Duplicates are analyzed once. Product API
brand metadata must match a researched name or alias before SKU selection and
quoting; missing or mismatched brands are skipped with reasons. Musk compares
offers within each brand first, then compares each brand's leading offer. Expand
the within-brand groups to inspect or select another offer. Preference-only
updates repeat both comparisons using the existing profiles.

Volumes and explicit pack counts are extracted conservatively from product/SKU
labels; ambiguous or absent values stay unknown. Cost per 100ml includes quoted
shipping/fees/discounts and is rounded to currency minor units. It is calculated
only with sourced volume, pack count and total, and used for ordering only when
explicitly requested. Seller claims and reviews do not prove treatment efficacy.
Web search and the additional AI/Shopee calls increase latency and API costs.

If revalidation allows continuing, Musk leaves only the approved SKU and quantity in the cart.
Click **Mở giỏ hàng Shopee** to continue manually using the same Shopee account.

## Important

- **Each quote clears the entire real cart. Old contents are not restored.** Musk quotes one SKU, removes it, and verifies the cart is empty before the next option. Do not edit the cart during processing.
- Approval leaves only the approved SKU and quantity. If cleanup fails, empty the cart and reload Musk before retrying.
- Musk fetches shop and platform vouchers for the selected SKU and subtracts the largest eligible cash voucher once from the reconciled checkout estimate. Vouchers are not stacked; select the displayed code manually at checkout. Shipping uses the saved account address and remains estimated. Missing pricing and policies stay unknown.
- Known term changes or failed requirements block handoff; unknown checks remain visible warnings. Verify intended items and all final terms on Shopee.
- Product-level stock flags do not guarantee the requested quantity. Quotes check
  current stock and the selected variation's purchase limit; upstream selection
  errors still surface explicitly if availability changes between requests.
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
