# Musk — PRD: Decision Engine (so sánh, đánh giá, đưa ra lựa chọn)

Phạm vi: bước 4–10 của pipeline (chuẩn hóa → lọc → làm giàu → giá cuối → thời điểm → xếp hạng → quyết định → duyệt) cho MVP case 1 ("không có thời gian", giỏ nhiều món) và case 2 ("không có kiến thức", một món giá trị cao). Case 3 nằm ngoài phạm vi.

Quy ước trong tài liệu:
- **(giả định, cần kiểm chứng)**: con số hoặc chính sách chưa được xác nhận, dùng tạm cho MVP.
- Mọi điểm số nằm trong thang 0–10. Mọi tiền tệ là VND, làm tròn đến đồng.
- Engine là code tất định (deterministic). LLM chỉ dùng để: hiểu yêu cầu, trích xuất thuộc tính từ tiêu đề/mô tả/ảnh voucher, tóm tắt review và viết câu giải thích theo template. LLM **không** quyết định PASS/FAIL, không tính giá, không xếp hạng.

---

## 1. Chuẩn hóa offer và xác định "cùng một sản phẩm"

### 1.1 Mô hình dữ liệu chung

```
Offer {
  offer_id, source_url, observed_at, snapshot_id
  shop_id, title_raw, images[], price_list, stock
  identity: ProductIdentity        // theo category pack
  attrs: { field: Value }          // mỗi Value có status + evidence_ids
  shipping: { days_min, days_max, ship_fee, from_location }
  vouchers_visible[], return_policy, warranty
}
Value { v, status: verified | claimed_by_shop | inferred | unknown, evidence_ids[] }
Evidence { id, type: listing_field | title | description | review | buyer_photo | shop_page | user_upload | official_lookup,
           source_url, observed_at, excerpt, confidence }
```

Mỗi thuộc tính mang trạng thái riêng. `inferred` (suy ra từ tiêu đề bằng parser) được coi như `claimed_by_shop` khi lọc — tức là chưa phải bằng chứng xác thực.

### 1.2 Product identity theo category

| Category | Khóa định danh (phải khớp tuyệt đối) | Thuộc tính biến thể (khớp theo yêu cầu) | Đơn vị chuẩn hóa giá |
|---|---|---|---|
| Điện thoại | brand, model (gồm hậu tố Plus/Pro/Pro Max), storage | condition, region_code, color, warranty_type, activation_state | giá/máy |
| Tã | brand, product_line (quần/dán), size | pack_count, sub_line (ví dụ Bobby Fresh / Bobby Extra Soft — giả định tên dòng, cần kiểm chứng) | giá/miếng |
| Sữa công thức | brand, product_line, age_stage, net_weight | origin (chính hãng NPP / xách tay), expiry_date, lot | giá/100g |
| Khăn ướt | brand (nếu user chỉ định), scent (không mùi/có mùi), sheet_count | pack_count, ply/độ dày (thường không có dữ liệu) | giá/tờ |

### 1.3 Parse tiêu đề listing

Thứ tự: (1) đọc trường có cấu trúc của listing (variant đã chọn, thuộc tính), (2) regex theo category pack, (3) LLM trích xuất khi regex không ra, (4) đối chiếu ảnh nếu có (ví dụ ảnh vỏ hộp ghi "Growing Up"). Nếu (1) và (2)/(3) mâu thuẫn → giữ giá trị của trường có cấu trúc, gắn cờ `title_conflict` (là red flag nhẹ).

| Thuộc tính | Mẫu nhận diện (không phân biệt hoa thường, bỏ dấu) | Ghi chú |
|---|---|---|
| Model iPhone | `iphone\s*(\d{2})\s*(pro max|pro|plus|e)?` | "16 Plus" ≠ "16". Không có hậu tố = bản thường |
| Storage | `(64|128|256|512)\s*gb?`, `1\s*tb` | Nhiều biến thể trong 1 listing → lấy variant ứng với giá đang xét |
| Condition | `new|moi|nguyen seal|fullbox` → new; `like ?new|99%|cu|da qua su dung|2nd` → used; `cpo|renew|refurb` → refurbished; `active|kich hoat|tbh` → new_activated | "Nguyên seal" là shop tự nói (`claimed`) |
| Region code | `vn/a` → VN/A; `ll/a|za/a|j/a|ch/a|kh/a|x/a` → quốc tế; `xach tay` → imported | VN/A + "chính hãng" vẫn là `claimed` cho tới khi có bằng chứng (shop Mall chính hãng ủy quyền, hoặc review ảnh hộp có VN/A) |
| Xách tay vs chính hãng | `xach tay|hang nhap|noi dia (nhat|my|han)` → imported | Với sữa: xách tay → origin=imported |
| Size tã | `size\s*(nb|s|m|l|xl|xxl)` hoặc `\b(nb|s|m|l|xl|xxl)\s?(\d{2,3})\b` (ví dụ L68) | "L68" → size L, 68 miếng |
| Loại tã | `ta quan|quan` → pants; `ta dan|dan` → tape | Thiếu → unknown, không đoán |
| Pack count | `(\d+)\s*(mieng|mieng/bich)`, `x\s?(\d+)\s*bich`, `combo\s*(\d+)` | Combo 2 bịch L68 = 136 miếng |
| Trọng lượng sữa | `(\d{3,4})\s*g`, `(\d(?:[.,]\d)?)\s*kg` | |
| Giai đoạn sữa | `growing up|so 9|1-3 tuoi|12-36 thang` → 1–3y; `infant|so 0|0-12 thang` → 0–1y | |
| Số tờ khăn | `(\d{2,3})\s*to` | |
| Mùi | `khong mui|unscented` → none | |

### 1.4 Chuẩn hóa đơn giá

```
unit_price = final_line_price / (pack_count × units_per_pack)
  tã:   đ/miếng      sữa: đ/100g = price / net_weight_g × 100      khăn: đ/tờ
```
Dùng đơn giá để: so sánh offer khác quy cách (L68 vs L54 vs combo 2×L68), phát hiện giá bất thường, và gợi ý đổi quy cách khi rẻ hơn ≥ 5% (giả định, cần kiểm chứng). Không tự đổi quy cách khi user đã chỉ định quy cách — chỉ gợi ý.

Ví dụ: Bobby L68 349.000đ → 5.132đ/miếng; 359.000đ → 5.279đ/miếng; XL62 359.000đ → 5.790đ/miếng. Meiji Growing Up 800g 535.000đ → 66.875đ/100g. Khăn 100 tờ 69.000đ → 690đ/tờ.

### 1.5 Quy tắc ghép và xử lý không khớp

| Tình huống | Hành động | Hiển thị |
|---|---|---|
| Khóa định danh khớp, biến thể khớp | Ghép vào nhóm so sánh | — |
| Khóa định danh khác (iPhone 16 Plus vs 16; size XL vs L; Infant vs Growing Up; tã dán vs quần) | **Loại ở bước chuẩn hóa** (`kind=norm`), không chạy lọc | "Sai loại: Size XL, bé đang dùng L" — chỉ trong mục "bị loại" chi tiết |
| Biến thể khác nhưng có thể chấp nhận (condition used khi user nói "mới"; xách tay khi user không nói) | Nếu user đã nói rõ → loại; nếu chưa nói và thuộc tính là decision-relevant → **hỏi** | "Có 1 máy Like New rẻ hơn 1,85 tr. Bạn có cân nhắc máy cũ không?" (chỉ hỏi khi chênh ≥ 10% — giả định) |
| Khóa định danh unknown (tiêu đề "Tã Bobby giá kho", không ghi size) | Không ghép, không hỏi user — loại `kind=norm_unknown` | Không hiện, ghi audit |
| Quy cách khác (L54 thay vì L68) | Ghép, so sánh theo đơn giá, quy đổi số lượng gần nhất ≥ nhu cầu | "2 bịch L54 = 108 miếng (ít hơn 28 miếng)" |
| Nhiều biến thể trong 1 listing | Tách thành nhiều offer ảo, mỗi biến thể 1 offer với giá riêng | — |

Nguyên tắc: **hỏi user chỉ khi câu trả lời có thể đổi kết quả** (có ít nhất một offer sẽ đổi trạng thái PASS/FAIL hoặc đổi thứ hạng top 1). Ngược lại thì tự áp default của category pack.

---

## 2. Điều kiện bắt buộc và ưu tiên mềm

### 2.1 Nguồn và thứ tự ưu tiên

`user_said (lượt này) > user_said (lượt trước trong phiên) > profile > category_default > inferred`. Mỗi constraint lưu `source` để giải thích ("vì bạn đặt quy tắc sữa chỉ mua shop Mall").

Constraint có hai loại:
- **Hard**: vi phạm → FAIL → loại. Đánh giá bằng code, trả PASS/FAIL/UNKNOWN.
- **Soft**: đưa vào điểm số (giá, uy tín, bảo hành, tốc độ giao, đánh giá).

### 2.2 Danh mục constraint

| Constraint | Category | Loại | Nguồn mặc định | PASS | FAIL | UNKNOWN |
|---|---|---|---|---|---|---|
| Đúng sản phẩm (identity) | tất cả | hard | yêu cầu | khớp | khác | không parse được → loại ở chuẩn hóa |
| Ngân sách món | phone | hard | user_said ("~19tr") | final ≤ budget × (1+tol) | final > budget × (1+tol) | giá không đọc được |
| Ngân sách tháng | baby | hard (mức giỏ) | profile | tổng giỏ ≤ budget | vượt → HỎI LẠI bớt món | — |
| Bảo hành Apple chính hãng | phone | hard nếu user bắt buộc, soft nếu không | user_said (hỏi) | warranty=apple & verified | warranty=shop, hoặc region quốc tế | apple & claimed; không ghi |
| Tình trạng máy mới | phone | hard | user_said | new & không có red flag kích hoạt | used/refurb | new_activated chỉ do review nói → xem red flag |
| Thời gian nhận | tất cả | hard nếu user nói hạn ("cần trong 2 ngày"), soft nếu không | user_said | days_max ≤ hạn | days_min > hạn → FAIL; days_min ≤ hạn < days_max → FAIL (MVP thận trọng) | không có ETA |
| Shop Mall | sữa | hard | profile rule | tier=Mall | khác | — |
| Tuổi shop ≥ 6 tháng | tất cả | hard | profile rule | age ≥ 6 | age < 6 | không có dữ liệu tuổi |
| Hạn dùng ≥ 6 tháng | sữa | hard | profile rule | months_left ≥ 6 (verified hoặc claimed có ảnh) | < 6 | không ghi |
| Size theo cân nặng | tã | hard (qua identity) | profile (11 kg → L, bảng size của hãng) | khớp | khác | — |
| Hàng chính hãng (không xách tay) | sữa | hard | category_default | origin=official | imported | không ghi → UNKNOWN |
| Không mùi | khăn | hard | user_said | scent=none | có mùi | không ghi |
| Đổi trả ≥ 7 ngày | phone | soft (category_default) | — | — | — | — |
| Thương hiệu quen | baby | soft → hard nếu profile đánh "chỉ dùng" | profile | | | |

`tol` ngân sách: 0% khi user nói "tối đa", 3% khi nói "khoảng/~" (giả định, cần kiểm chứng). Offer nằm trong vùng tol vẫn PASS nhưng giải thích phải nói "vượt ngân sách X".

### 2.3 Quy tắc đánh giá

```
status(offer) = FAIL     nếu bất kỳ hard check = FAIL
              = UNKNOWN  nếu không FAIL và có ≥1 hard check = UNKNOWN
              = PASS     nếu mọi hard check = PASS
```
- UNKNOWN **không bao giờ** được tính như PASS: không vào bảng xếp hạng chính, không được chọn làm winner, không vào giỏ.
- Field `claimed_by_shop` cho constraint "bắt buộc xác minh" (bảo hành Apple, hạn dùng sữa, chính hãng) → UNKNOWN. Field `claimed_by_shop` cho constraint không đòi xác minh (thời gian giao, số miếng) → PASS.
- Nâng cấp claimed → verified chỉ khi có evidence độc lập: shop Mall ủy quyền (tier Mall + thương hiệu khớp), ≥2 review có ảnh trong 60 ngày xác nhận (ảnh hộp có VN/A, ảnh đáy hộp sữa ghi hạn), hoặc tra cứu chính thức (post-MVP).

### 2.4 UNKNOWN → HỎI LẠI hay loại?

Một offer UNKNOWN chỉ được nêu ra để hỏi khi **đồng thời**:
1. Nó tốt hơn winner hiện tại một cách đáng kể nếu UNKNOWN được coi là PASS (rẻ hơn ≥ 1% với phone, hoặc lọt top 1 theo utility), **và**
2. Câu hỏi có thể trả lời được bởi user (chấp nhận rủi ro, hoặc tự kiểm tra) — không hỏi những thứ user không biết.

Nếu không thỏa → offer nằm trong "Chưa chắc" (detail), không hỏi.

Nếu **không có PASS nào** và có UNKNOWN → quyết định HỎI LẠI (mục 6). Nếu chỉ có FAIL → chạy gợi ý nới điều kiện (2.5).

### 2.5 Gợi ý nới điều kiện khi không có gì đạt

Thuật toán: với mỗi hard constraint c có nguồn khác `identity`, chạy lại lọc với c bị bỏ (hoặc nới một nấc: ngân sách +5%/+10%, hạn giao +1/+2 ngày, tuổi shop 6→3 tháng). Chọn tối đa 2 phương án có (số offer PASS mới ≥ 1) và chi phí thấp nhất theo thứ tự ưu tiên nới:

| Thứ tự nới (dễ trước) | Constraint | Không bao giờ tự nới |
|---|---|---|
| 1 | thời gian nhận (+1, +2 ngày) | identity (đúng sản phẩm, size) |
| 2 | ngân sách (+5%, +10%) | hạn dùng sữa < 3 tháng |
| 3 | ưu tiên mềm → không đổi gì | an toàn (shop có red flag nặng) |
| 4 | bảo hành Apple → chấp nhận "shop tự nói" | |
| 5 | rule profile (Mall, tuổi shop) — chỉ đề xuất, phải user xác nhận rõ | |

Hiển thị: "Không có máy nào giao trong 1 ngày. Nếu chờ 2 ngày: Bến Nghé Mobile, 18,19 tr." — luôn kèm tác động cụ thể (option nào thắng, giá cuối). Không tự áp.

---

## 3. Giá cuối (giá thực trả)

### 3.1 Các thành phần

| Thành phần | Có dữ liệu ở MVP? | Nguồn | Trừ vào giá? |
|---|---|---|---|
| Giá niêm yết (variant) | Có | snapshot | là gốc |
| Voucher shop | Có (công khai trên listing/shop) | snapshot | Có, nếu đạt min spend |
| Voucher Shopee / Mall / Freeship | Một phần (voucher công khai đang chạy) | snapshot trang khuyến mãi | Có, nếu điều kiện rõ |
| Voucher cá nhân | Có, nếu user tải ảnh "Ví voucher" | vision trích xuất: % hoặc số tiền, cap, min spend, phạm vi, hạn | Có, nếu đọc đủ 4 trường; thiếu trường → không trừ, hỏi |
| Khuyến mãi thanh toán (ngân hàng, ví) | Không chắc | — | **Không** (chỉ ghi chú "có thể giảm thêm") |
| Xu Shopee | Không (cần đăng nhập) | — | **Không** |
| Combo / mua kèm deal shop | Có nếu hiển thị trên listing | snapshot | Có, nếu giỏ thực sự chứa combo |
| Phí vận chuyển | Ước lượng | ETA + ngưỡng freeship | Cộng vào |

Nguyên tắc: **chỉ trừ thứ có dữ liệu**. Thứ chưa chắc không làm giá đẹp hơn; có thể nhắc riêng.

### 3.2 Thứ tự cộng dồn (stacking)

Thứ tự tính theo hiểu biết hiện tại về Shopee (giả định, cần kiểm chứng trên trang thanh toán thực):

```
subtotal_shop      = Σ (giá variant × qty) trong đơn của shop
sau_voucher_shop   = subtotal_shop − voucher_shop        (nếu subtotal_shop ≥ min_spend_shop; tối đa 1 voucher shop/đơn)
sau_voucher_san    = sau_voucher_shop − voucher_san       (Shopee/Mall; 1 voucher sàn/lần thanh toán — min spend tính trên phần nào cần kiểm chứng)
ship               = phí ship ước lượng − voucher freeship (nếu đạt điều kiện)
final              = sau_voucher_san + ship
```
- Voucher cá nhân thường là voucher sàn hoặc voucher shop → chiếm slot tương ứng, **không** cộng thêm một slot mới. Khi có nhiều voucher cùng slot, chọn cái giảm nhiều nhất cho giỏ (bài toán nhỏ, duyệt hết).
- Voucher % có cap: `giảm = min(base × pct, cap)`.
- Voucher sàn áp cho cả lần thanh toán nhiều shop: phân bổ theo tỷ lệ subtotal để hiển thị giá từng món (chỉ dùng nội bộ).
- Ghi lại `price_breakdown` đầy đủ trong decision (audit), nhưng UI buyer chỉ hiện giá cuối + một dòng "đã gồm …".

> Prototype hiện tính min spend của voucher sàn và voucher cá nhân trên giá niêm yết (trước voucher shop). Cần kiểm chứng; nếu sai, đổi base thành `sau_voucher_shop`. Engine phải để base là tham số.

### 3.3 Tối ưu giỏ (case 1)

Bài toán: chọn một offer PASS cho mỗi món để cực tiểu `Σ final(đơn theo shop)` + ràng buộc ngân sách tháng.

**Thuật toán MVP (chính xác):** duyệt toàn bộ tổ hợp. Số tổ hợp = Π |PASS_i|. Với giỏ 3–5 món, mỗi món ≤ 5 offer → ≤ 3.125 tổ hợp, mỗi tổ hợp O(n) → tức thì.

**Giới hạn và heuristic khi bùng nổ:** nếu Π |PASS_i| > 20.000 (giả định):
1. Cắt tỉa theo dominance: offer X bị loại khỏi tập ứng viên nếu có offer Y **cùng shop hoặc shop đã có trong giỏ** với giá ≤ X và trust ≥ X.
2. Giữ tối đa k=4 offer mỗi món: 2 rẻ nhất + offer rẻ nhất tại mỗi shop có voucher đơn (vì gom đơn là nguồn tiết kiệm duy nhất mà greedy bỏ lỡ).
3. Nếu vẫn > 20.000: tìm theo shop — liệt kê tập shop S (≤ 2^|shops|, chỉ giữ tập ≤ 3 shop), với mỗi S gán mỗi món vào shop rẻ nhất trong S rồi tính voucher/ship; chọn S tốt nhất.
4. Có thể thay bằng ILP nhỏ (biến nhị phân offer + biến đạt min spend mỗi shop) ở post-MVP.

**Tie-break:** tổng bằng nhau (chênh ≤ 1.000đ) → số shop ít hơn (ít đơn, ít rủi ro giao lệch) → trust trung bình cao hơn → ETA max nhỏ hơn → offer_id (tất định).

**Báo tiết kiệm:** `saving = total(greedy rẻ nhất từng món) − total(best)`. Chỉ hiện khi saving ≥ 10.000đ (giả định). Greedy cũng phải dùng tập PASS và cùng công thức giá để so sánh công bằng.

### 3.4 Gom đơn và món bù min spend

- **Gom đơn:** đã nằm trong tối ưu tổ hợp. Giải thích theo dạng: "Đắt hơn 10k/bịch nhưng gom cùng đơn Mẹ Mây Official để dùng voucher 60k."
- **Món bù (add-on):** nếu giỏ best có một đơn thiếu `gap = min_spend − subtotal` với `gap ≤ voucher_amount` và `gap ≤ 15% subtotal` (giả định), tìm trong shop đó một món **thuộc danh sách mua định kỳ của profile** (ví dụ khăn ướt, tã) có giá ≥ gap. Chỉ đề xuất nếu `voucher − giá món bù ≥ 0` hoặc món bù sẽ cần mua trong ≤ 30 ngày theo tốc độ dùng. Không bao giờ tự thêm vào giỏ: hiện dạng gợi ý có nút "Thêm".
- Không đề xuất món ngoài profile ở MVP (tránh upsell).

### 3.5 Hiển thị giá cho buyer

- Một con số: **giá cuối** (case 2: giá máy; case 1: tổng giỏ + giá từng dòng).
- Một dòng: "Đã gồm voucher shop, voucher Mall và phí ship." Nếu có voucher cá nhân: "đã gồm voucher của bạn (hạn 31/10)".
- Nếu có ưu đãi chưa tính: "Có thể rẻ hơn nếu dùng Xu hoặc ưu đãi thẻ — Musk chưa tính." (một dòng, màu trung tính).
- Breakdown chỉ có trong "Xem so sánh chi tiết" → hàng "Voucher đã tính".

---

## 4. Uy tín và bằng chứng

### 4.1 Tín hiệu shop

| Tín hiệu | Dùng ở đâu | Ghi chú |
|---|---|---|
| Tier (Mall / Yêu thích / Thường) | trust (điểm nền) | Mall = cam kết chính hãng theo chính sách sàn (cần kiểm chứng điều khoản cụ thể) |
| Rating shop | trust | Chỉ có nghĩa khi review count đủ lớn |
| Số đánh giá | trust (độ tin của rating) | log để giảm lợi thế shop cực lớn |
| Đã bán | detail + red flag (tỷ lệ bán/đánh giá) | |
| Tuổi shop (tháng) | hard rule (profile) + trust v2 | |
| Tỷ lệ phản hồi chat | trust v2 | |
| Chính sách đổi trả (ngày) | trust v2 + detail | "Không ghi" bị trừ |
| Vị trí kho | ETA, detail | |

### 4.2 Công thức trust

**Baseline (giữ như prototype để so sánh):**
```
trust_v1 = min(10, tier_pts + max(0, rating − 4) × 4 + min(2, log10(max(1, reviews)) / 2))
tier_pts: Mall 4, Yêu thích 2.5, Thường 1
```
Lý do: tier là tín hiệu do sàn kiểm duyệt (mạnh nhất); rating dưới 4 gần như luôn có vấn đề nên sàn ở 4; mỗi 0,1 sao trên 4 đáng 0,4 điểm; số review có lợi ích giảm dần (100 review → 1, 10.000 → 2).

Edge case v1: rating 5.0 với 3 review được +4 điểm → quá cao. **Đề xuất v2:**
```
rating_adj = (rating × n + 4.5 × 20) / (n + 20)          // Bayesian: kéo về 4.5 khi ít review (prior giả định)
trust_v2 = clamp( tier_pts
                 + max(0, rating_adj − 4) × 4
                 + min(2, log10(max(1, n)) / 2)
                 − 2 × [age < 6 tháng]
                 − 1 × [chat_rate < 80%]
                 − 1 × [đổi trả "không ghi"]
                 − penalty(red_flags) , 0, 10)
penalty: nhẹ 0.5, vừa 1.5, nặng → loại (không chấm)
```
Với dữ liệu mẫu, v2 không đổi thứ tự B/C (cùng Mall, 4.9, review lớn).

| Shop | v1 | Nhận xét |
|---|---|---|
| Bến Nghé Mobile (B) | 9,47 | Mall, 4.9, 5,4k đánh giá |
| Sông Hàn Digital (C) | 9,35 | Mall, 4.9, 3,1k |
| Hải Âu iStore (G) | 7,24 | Yêu thích, 4.8 |
| Phố Táo 247 (A) | 4,86 | Thường, 4.6 |
| Siêu Sale Phone 99 (F) | 4,79 | v2: −2 (3 tháng) −1 (chat 70%) −1 (đổi trả không ghi) − red flag → ~0 |
| Mẹ Mây Official (K) | 9,60 | |
| Sữa Ngon Chính Hãng (Q) | 9,59 | |
| Nhà Cún Con (L) | 7,60 | |

### 4.3 Khai thác review

Pipeline cho mỗi offer (giới hạn 200 review mới nhất ở MVP — giả định):
1. **Aspect extraction** (LLM, output JSON có kiểm schema): mỗi review → danh sách `{aspect, polarity, quote_span}`. Aspect theo category pack:
   - Phone: chính hãng/VN/A, đã kích hoạt, bảo hành, ngoại hình, pin, đóng gói, giao hàng, tư vấn shop, hóa đơn.
   - Tã: seal, date, size chuẩn, thấm hút, hăm, đóng gói.
   - Sữa: tem NPP, hạn dùng, hộp móp, giao hàng.
   - Khăn: độ dày, mùi, độ ẩm/khô, kích ứng.
2. **Trọng số review:**
   ```
   w = recency × media × length × verified_purchase
   recency = 0.5^(age_days / 60)            // half-life 60 ngày (giả định)
   media   = 2.0 nếu có ảnh/video, 1.0 nếu không
   length  = 0.3 nếu < 5 từ ("tốt", "ok"), 1.0 nếu ≥ 5 từ
   ```
3. **Điểm aspect:** `aspect_score = Σ w × polarity / Σ w`, polarity ∈ {−1, 0, +1}; `aspect_conf = min(1, Σ w / 5)`.
4. **Heuristic review giả (đánh dấu, giảm trọng số về 0.2):**
   - Nhiều review 5 sao ngắn, giống nhau (Jaccard ≥ 0.8) trong 48 giờ.
   - Tài khoản review chỉ có 1 review và không ảnh, chiếm > 50% review gần đây.
   - Phân phối sao bất thường: > 95% là 5 sao và < 1% là 1–3 sao với n ≥ 100.
   - Review không nói về sản phẩm (nói về shop chung chung, quà tặng, "đánh giá để nhận xu").
   - Tỷ lệ review/đã bán > 0,8 (người thật hiếm khi review nhiều như vậy) — giả định, cần kiểm chứng.

### 4.4 Chọn review trích dẫn lên UI

Mỗi offer hiển thị **1 quote** ở bảng tóm tắt, tối đa 5 ở chi tiết. Thuật toán chọn quote cho bảng tóm tắt:
```
ứng viên = review thật trong snapshot, không bị cờ giả, ≤ 90 ngày, ≥ 8 từ
ưu tiên:
 1. Nếu offer có cảnh báo (red flag/UNKNOWN): review nói đúng vấn đề đó (để user tự thấy), ưu tiên có ảnh.
 2. Nếu không: review đề cập aspect quyết định của category (phone: chính hãng/IMEI/VN/A; sữa: hạn; tã: seal/date; khăn: mùi/độ dày).
 3. Trong cùng mức: có ảnh > không ảnh; mới hơn > cũ; số sao đại diện cho rating trung bình (không chọn toàn 5 sao nếu có vấn đề lặp lại).
```
Ràng buộc: quote là **trích nguyên văn** (có thể cắt bằng "…" ở ranh giới câu, không sửa chữ), kèm tên đã che (ng***c), số sao, ngày, ảnh. Mỗi quote có `evidence_id`; không có review hợp lệ → hiện "Chưa có đánh giá đủ thông tin", không tự viết.

### 4.5 Red flag

| Mã | Điều kiện | Mức | Hệ quả |
|---|---|---|---|
| RF_ACTIVATED | ≥ 3 review (hoặc ≥ 5% review 60 ngày) nói máy đã kích hoạt khi bán "mới seal" | nặng nếu user yêu cầu mới; vừa nếu không | loại / trừ điểm |
| RF_NEW_SHOP_SPIKE | tuổi shop < 6 tháng và đã bán > 500 (hoặc tăng > 3× trong 30 ngày) | nặng | loại |
| RF_PRICE_TOO_LOW | giá cuối < 85% median giá các offer cùng identity PASS identity (giả định) | vừa; nặng nếu kèm shop Thường + tuổi < 12 tháng | cảnh báo / loại |
| RF_NO_WARRANTY_INFO | phone không ghi bảo hành | vừa | UNKNOWN |
| RF_NEAR_EXPIRY | review nhắc "cận date" ≥ 2 lần trong 60 ngày (tã/sữa) | vừa | trừ điểm, cảnh báo |
| RF_QUALITY_REPEAT | ≥ 3 review hoặc ≥ 10% nói cùng lỗi chất lượng (khăn khô, có mùi) | vừa→nặng | trừ điểm/loại nếu trái constraint |
| RF_OFF_PLATFORM | review/mô tả yêu cầu chuyển khoản ngoài, liên hệ Zalo để giảm giá | nặng | loại |
| RF_TITLE_CONFLICT | tiêu đề và variant mâu thuẫn | nhẹ | ghi chú |
| RF_FAKE_REVIEWS | heuristic 4.3 kích hoạt | vừa | trust −1.5, giảm confidence |

Ngưỡng là giả định, cần kiểm chứng trên tập dữ liệu thật.

### 4.6 Độ tin của bằng chứng (tách khỏi điểm giá trị)

Mỗi offer có `evidence_confidence ∈ {cao, trung bình, thấp}`, tính riêng, không cộng vào utility:
```
cao        : mọi field quyết định là verified, snapshot ≤ 24h, ≥ 20 review hữu ích
trung bình : có field claimed nhưng không phải field hard; snapshot ≤ 72h
thấp       : snapshot > 72h, hoặc < 5 review hữu ích, hoặc có RF_FAKE_REVIEWS
```
Dùng để: (a) quyết định có cần "kiểm tra lại giá trước khi duyệt"; (b) chặn MUA nếu winner có confidence thấp và giá trị cao (> 5 tr — giả định) → HỎI LẠI/cảnh báo; (c) hiển thị nhãn "Musk chắc chắn / chưa chắc".

---

## 5. Chấm điểm và xếp hạng

### 5.1 Sub-score

| Sub-score | Công thức | Lý do | Edge case |
|---|---|---|---|
| Giá (v1, prototype) | `3 + 7 × (hi − p)/(hi − lo)` trên tập PASS; hi = lo → 10 | đơn giản | Phụ thuộc tập so sánh: thêm một offer đắt làm đổi điểm các offer khác; chênh 1,9% bị thổi thành 7 điểm |
| **Giá (v2, đề xuất)** | `clamp(10 − s × Δ%, 0, 10)`, `Δ% = (p − p_min)/p_min × 100`, s = 2,5 cho phone, 1,0 cho hàng tiêu dùng (giả định) | Điểm phản ánh % chênh thực, ổn định khi thêm/bớt offer đắt | p_min là offer PASS rẻ nhất; 1 offer → 10 |
| Uy tín | trust_v1 (MVP), trust_v2 khi có dữ liệu | 4.2 | shop thiếu field → dùng v1 |
| Bảo hành (phone) | Apple verified 10; Apple claimed 6; shop `min(5, tháng/2)`; unknown 0 | Bảo hành hãng giá trị cao hơn hẳn bảo hành shop | Khi user bắt buộc Apple thì chỉ còn offer verified → sub-score không phân biệt; trọng số thực chất dồn sang giá/uy tín/tốc độ |
| Tốc độ giao | `max(0, 10 − (days_max − 1) × 2)` | Dùng days_max (cam kết xấu nhất) cho thận trọng | Không có ETA → 0 và không được thắng nếu user có hạn |
| Hạn dùng (sữa) | `min(10, months_left − 2)` (giả định) | Hạn dài hơn tốt hơn nhưng bão hòa | — |
| Chất lượng review | `5 + 5 × aspect_score_trung_bình` chỉ khi `aspect_conf ≥ 0.5` | Bổ sung, MVP để trọng số 0 | — |

### 5.2 Utility và trọng số

```
U = Σ w_k × s_k / Σ w_k
```
| Preset | Giá | Uy tín | Bảo hành | Giao nhanh |
|---|---|---|---|---|
| Mặc định | 40 | 30 | 20 | 10 |
| Ưu tiên giá | 60 | 20 | 15 | 5 |
| Ưu tiên uy tín | 20 | 50 | 20 | 10 |
| Ưu tiên giao nhanh | 25 | 25 | 15 | 35 |

Case 1 (baby) dùng cost-first: mục tiêu chính là tổng giỏ nhỏ nhất trong tập PASS; uy tín chỉ là tie-break vì các rule profile (Mall, tuổi shop, hạn) đã chặn rủi ro. Lý do: user bận, cần giỏ rẻ và an toàn, không cần cân nhắc.

### 5.3 Map câu chat → trọng số

| Câu user (ví dụ) | Tác động |
|---|---|
| "rẻ nhất", "ưu tiên giá", "tiết kiệm" | preset Ưu tiên giá |
| "an toàn", "uy tín", "sợ hàng giả" | preset Ưu tiên uy tín |
| "cần gấp", "giao nhanh" (không có số ngày) | preset Giao nhanh |
| "cần trong 2 ngày", "trước thứ 6" | **hard** days_max ≤ N (không phải trọng số) |
| "bảo hành shop cũng được" | bỏ hard bảo hành Apple; bảo hành thành soft |
| "bắt buộc bảo hành Apple" | hard |
| "không cần gấp" | speed weight → 5, cho phép CHỜ |
| Kéo slider | ghi đè trọng số, source=user_said |

Parser rule-based trước, LLM fallback trả về đúng enum. Mỗi thay đổi trọng số → phiên bản quyết định mới.

### 5.4 Tất định và tie-break

- Cùng input (snapshot_id, mission, weights, vouchers) → cùng output. Không có random; sort ổn định.
- Làm tròn U đến 0,01 trước khi so sánh.
- Tie-break: U → giá cuối thấp hơn → trust cao hơn → days_max nhỏ hơn → offer_id.

### 5.5 Độ nhạy ("winner có đổi nếu…")

Sau khi xếp hạng, chạy thêm các kịch bản và lưu kết quả:
1. Mỗi preset khác (3 lần chạy).
2. Mỗi trọng số ±10 điểm.
3. Giá mỗi offer ±2% (biến động giá trong ngày).
4. Mỗi offer UNKNOWN coi như PASS.

Nếu winner đổi ở kịch bản nào → lưu `flip_conditions[]` và dùng để sinh câu "Nếu bạn ưu tiên giao nhanh, Bến Nghé Mobile sẽ hợp hơn." (tối đa 1 câu ở UI tóm tắt).

### 5.6 Khi top 2 quá sát → lựa chọn thật

Trình bày là "2 lựa chọn ngang nhau, khác nhau ở X" thay vì một winner nếu:
```
U1 − U2 < 0.5   (giả định)   hoặc   winner đổi ở ≥ 2 kịch bản 5.5 (mục 1–2)
```
và hai lựa chọn khác nhau ở một chiều mà user có thể tự cân (giá vs tốc độ, giá vs bảo hành). UI: hai thẻ cạnh nhau, mỗi thẻ một câu "Chọn cái này nếu bạn…". Pay bar chưa hiện cho đến khi user chọn (quyết định = HỎI LẠI loại "chọn 1 trong 2").

---

## 6. Chính sách quyết định MUA / CHỜ / HỎI LẠI

### 6.1 Thứ tự đánh giá

```
1. Không có offer PASS:
     có UNKNOWN đáng hỏi (2.4)           → HỎI LẠI (xác nhận rủi ro)
     không                                → HỎI LẠI (nới điều kiện, 2.5)
2. Winner vượt ngân sách (ngoài tol) / giỏ vượt ngân sách tháng → HỎI LẠI (bớt món / nới ngân sách)
3. Top 2 quá sát (5.6)                    → HỎI LẠI (chọn 1 trong 2)
4. Winner evidence_confidence thấp & giá trị > 5 tr (giả định) → HỎI LẠI (xác nhận) 
5. Điều kiện CHỜ thỏa (6.2)               → CHỜ
6. Còn lại                                → MUA
```

### 6.2 Điều kiện CHỜ

```
CHỜ khi tất cả đúng:
  a. urgency cho phép: need_by ≥ sale_date + days_max(winner)   (need_by từ user, hoặc từ tốc độ dùng)
  b. expected_saving = expected_pct(category, event) × final(winner) ≥ max(min_abs(category), 2% × final)
  c. confidence_of_expectation ≥ trung bình (có lịch sử giá SKU/shop trong ≥ 2 đợt sale trước)
  d. days_to_sale ≤ D_max(category)
```

| Category | expected_pct đợt ngày đôi | min_abs | D_max | Ghi chú |
|---|---|---|---|---|
| iPhone (Mall) | 2–3% | 300.000đ | 21 ngày | (giả định, cần kiểm chứng) |
| Tã | 5–10% | 30.000đ | 14 ngày | (giả định, cần kiểm chứng) |
| Sữa | 3–8% | 30.000đ | 14 ngày | (giả định, cần kiểm chứng) |
| Khăn ướt | 5–15% | 20.000đ | 14 ngày | (giả định, cần kiểm chứng) |

Lịch sale: ngày đôi (m.m) là sự kiện lớn; ngày 15 và 25 là sự kiện nhỏ (expected_pct × 0,5 — giả định). Ngày 25/10/2026: đợt kế tiếp là 11.11 (còn 17 ngày), 15.11 (21 ngày), 25.11 (31 ngày).

Urgency case 1: `days_of_stock = tồn_kho / tốc_độ_dùng`. Profile chưa có tồn kho → coi như cần ngay (không CHỜ). Tốc độ dùng tã size L ~5–6 miếng/ngày (giả định) → 2 bịch L68 ≈ 23–27 ngày.

**MVP không có lịch sử giá** → điều kiện (c) gần như không thỏa → quyết định là MUA kèm một dòng gợi ý thời điểm ("Không gấp thì có thể chờ 11.11, đợt trước thường giảm thêm khoảng 2–3% (ước tính)"). Đây là hành vi có chủ đích: không hứa giảm giá khi không có dữ liệu.

So với giá tham chiếu: nếu có giá tham chiếu (giá niêm yết hãng, ví dụ 19.490.000đ cho iPhone 16 128GB — số trong prototype, cần kiểm chứng) và `final ≤ 95% ref` → thêm dòng "Đang thấp hơn giá hãng X". Nếu `final > ref` → cảnh báo và nghiêng CHỜ nếu không gấp.

### 6.3 Output của từng quyết định

| Quyết định | Headline (ví dụ) | UI | Stepper "Việc của bạn" |
|---|---|---|---|
| MUA | "Musk chọn Sông Hàn Digital: 17,84 tr, đã gồm voucher." | Thẻ winner + bảng so sánh + pay bar "Duyệt" | 1 Duyệt → 2 Mở Shopee, thanh toán → 3 Kiểm tra khi nhận |
| CHỜ | "Nên chờ 11.11 (còn 17 ngày): dự kiến rẻ hơn ~450k." | Thẻ winner (vẫn hiện), nút "Nhắc tôi" + "Mua luôn" | 1 Bấm nhắc → 2 Musk kiểm tra lại giá ngày sale |
| HỎI LẠI – xác nhận rủi ro | "Có 1 lựa chọn rẻ hơn nhưng bảo hành Apple chỉ do shop tự nói. Bạn chấp nhận không?" | 2 nút trả lời + phương án an toàn | 1 Trả lời câu hỏi |
| HỎI LẠI – nới điều kiện | "Không có máy nào giao trong 1 ngày. Chờ 2 ngày thì có Bến Nghé Mobile, 18,19 tr." | Nút áp gợi ý | 1 Chọn cách nới |
| HỎI LẠI – vượt ngân sách | "Giỏ 1,62 tr, vượt ngân sách tháng 120k. Bớt 1 bịch tã?" | Gợi ý bớt món có tác động | 1 Chọn món bớt |
| HỎI LẠI – chọn 1 trong 2 | "Hai lựa chọn ngang nhau: rẻ hơn 350k hay nhận sớm hơn 2 ngày?" | 2 thẻ cạnh nhau | 1 Chọn một |

Pay bar chỉ xuất hiện khi quyết định = MUA (hoặc CHỜ với "Mua luôn").

---

## 7. Sinh lời giải thích

### 7.1 Grounding

Mỗi câu giải thích là một `Claim {text, evidence_ids[], kind}`. Quy tắc:
- Claim về giá → `price_breakdown_id`. Claim về shop → `shop_snapshot_id`. Claim về review → `review_id`. Claim về bảo hành/hạn → `attr evidence_id` + status.
- Claim không map được evidence → bị bỏ trước khi render (validator code, không phải LLM).
- Field `claimed_by_shop` luôn hiện kèm "shop tự ghi"/"chưa xác minh". Field `unknown` hiện "không ghi".
- LLM chỉ điền vào template từ các slot đã tính; không thêm số liệu. Hậu kiểm: mọi số trong câu phải xuất hiện trong slot.

### 7.2 Template

**Vì sao chọn (case 2):**
```
"Musk chọn {shop} ({tier}): {final}, đã gồm {vouchers}."
+ tối đa 3 lý do theo thứ tự sub-score đóng góp lớn nhất vào khoảng cách với #2:
  "Bảo hành Apple {m} tháng, đã xác minh." | "Giá cuối rẻ nhất trong các lựa chọn đạt yêu cầu." |
  "Shop Mall, {sold} máy đã bán, {rating}★."
```
**Câu đánh đổi (bắt buộc có khi tồn tại option tốt hơn ở một chiều):**
```
"Đổi lại: giao {d1}–{d2} ngày, chậm hơn {shop2} {Δ} ngày. Nếu cần nhận sớm, {shop2} giá {final2} (+{Δp})."
```
**Bị loại vì:**
```
"{shop}: {final} — {lý do ngắn bằng ngôn ngữ thường}"
  FAIL bảo hành:  "chỉ bảo hành shop {m} tháng, bạn cần bảo hành Apple"
  UNKNOWN:        "bảo hành Apple do shop tự nói, chưa có bằng chứng"
  Red flag:       "{n} người mua nói máy đã kích hoạt sẵn"
  Rule profile:   "shop mới mở {n} tháng (bạn đặt: không mua shop dưới 6 tháng)"
```
**Field chưa xác minh:** "Chưa chắc: {field} — {lý do}. Bạn có thể {cách tự kiểm}."

### 7.3 Giọng văn

| | Case 1 (bận) | Case 2 (thiếu kiến thức) |
|---|---|---|
| Độ dài | 1 dòng/món, tổng ≤ 4 dòng + 1 dòng tiết kiệm | Headline + 3 lý do + 1 câu đánh đổi + mẹo kiểm tra |
| Ví dụ | "Tã: Mẹ Mây Official, 2 × 359k — gom đơn để dùng voucher 60k." | Như 7.2 |
| Thuật ngữ | Không | Giải thích ngắn khi lần đầu dùng ("VN/A = hàng phân phối chính hãng tại VN") |
| Không bao giờ | Nói "tốt nhất thị trường", "chắc chắn chính hãng" khi chưa verified, khuyên đầu tư/tài chính | |

---

## 8. Đặc tả UI so sánh

### 8.1 Bảng tóm tắt (case 2)

Cột = lựa chọn, tối đa 4: winner luôn cột 1; tiếp theo các PASS theo U; nếu còn chỗ, 1 cột "rẻ hơn nhưng chưa chắc/bị loại" (xem 8.3). Mỗi cột có ảnh sản phẩm, tên shop đậm, badge tier.

| Hàng | Nội dung | Highlight |
|---|---|---|
| Giá cuối | số lớn + "Rẻ nhất" hoặc "+350k" | xanh: rẻ nhất trong PASS |
| Bảo hành | "Apple 12 tháng, đã xác minh" / "shop tự nói" / "Bảo hành shop 6 tháng" | xanh: verified; vàng: claimed; đỏ nhạt: FAIL |
| Nhận hàng | "1–2 ngày" | xanh: nhanh nhất; vàng nếu vượt hạn user |
| Đánh giá | "★ 4.9 · 5,4k" + "12k đã bán" | — |
| Người mua nói | 1 quote (4.4) + ảnh nhỏ | viền vàng nếu quote là cảnh báo |

### 8.2 Bảng chi tiết ("Xem so sánh chi tiết")

Thêm hàng: Mã vùng (VN/A …, kèm trạng thái), Tình trạng máy, Đổi trả, Tuổi shop, Phản hồi chat, Vị trí kho, Voucher đã tính (breakdown), Lưu ý/red flag, Độ chắc chắn bằng chứng, Tất cả review hữu ích (≤ 5, có ảnh trước), Nguồn dữ liệu + thời điểm quan sát.

### 8.3 Lựa chọn bị loại

- Luôn có mục "Không chọn vì" liệt kê mọi offer FAIL/UNKNOWN/red flag bằng câu ngắn (7.2). Offer loại ở chuẩn hóa (sai model/size) gom thành một dòng "3 sản phẩm không đúng loại bạn cần" (mở ra xem).
- Đưa **một** offer vào bảng tóm tắt dạng cột mờ "Rẻ hơn nhưng bị loại" khi: offer đó rẻ hơn winner ≥ 1% và lý do loại là UNKNOWN hoặc FAIL dễ hiểu (bảo hành shop). Mục đích: trả lời câu hỏi "sao không lấy cái rẻ nhất?". Chọn offer rẻ nhất trong nhóm đó.

### 8.4 Case 1: so sánh theo món

- Mỗi món một dòng trong giỏ (ảnh, tên, quy cách, shop, giá dòng, 1 câu lý do). Nút "So sánh" mở bảng nhỏ: cột = các shop PASS + UNKNOWN (tối đa 4), hàng = Giá/đơn vị, Đơn giá chuẩn hóa (đ/miếng…), Hạn dùng (sữa), Đánh giá shop, Người mua nói, Ghi chú gom đơn.
- Khối tiết kiệm: "Musk gom khăn ướt và tã vào Mẹ Mây Official để đạt mức voucher. Tiết kiệm 20.000đ so với mua rẻ nhất từng nơi."
- Nhóm theo đơn shop chỉ ở chi tiết (user không cần biết là 2 đơn trừ khi ảnh hưởng thời gian nhận).

### 8.5 Trạng thái biên

| Trạng thái | Hiển thị |
|---|---|
| Chỉ 1 offer PASS | Thẻ winner, không bảng; vẫn có "Không chọn vì" |
| Không PASS, có UNKNOWN | Thẻ câu hỏi + phương án nếu chấp nhận |
| Không có gì (kể cả UNKNOWN) | Gợi ý nới (2.5) |
| Snapshot cũ > 72h | Banner vàng "Giá quan sát lúc {time}, có thể đã đổi" + nút cập nhật |
| Một món trong giỏ không tìm được | Giỏ vẫn hiện các món còn lại, món thiếu ở đầu với câu hỏi |
| Không có review | "Chưa có đánh giá đủ thông tin" |
| Ảnh lỗi | Placeholder trung tính, không ảnh minh họa giả |

---

## 9. Đánh giá lại và phiên bản

### 9.1 Trigger tạo phiên bản mới

Đổi ưu tiên/trọng số; đổi ngân sách; thêm/bớt/đổi số lượng món; khóa/đổi một món ("lấy tã ở shop L"); thêm voucher cá nhân; trả lời câu hỏi HỎI LẠI; snapshot mới có giá/tồn kho/voucher khác; voucher hết hạn; user bấm "cập nhật giá".

`Decision {version, parent_version, snapshot_id, mission_hash, inputs_hash, outcome, winner|cart, price_snapshot, created_at}` — bất biến sau khi tạo.

### 9.2 Diff message

So sánh với phiên bản trước, sinh tối đa 2 dòng:
- Winner đổi: "Đổi từ Sông Hàn Digital sang Bến Nghé Mobile vì bạn cần nhận trong 2 ngày (Sông Hàn giao 3–4 ngày)."
- Giá đổi: "Tổng giỏ 1.262.000đ → 1.799.000đ (tã 2 → 3 bịch… )."
- Không đổi: "Vẫn là Sông Hàn Digital; giá cuối giảm còn 17,54 tr nhờ voucher của bạn."
Lý do lấy từ constraint/weight vừa đổi (nguyên nhân trực tiếp), không đoán.

### 9.3 Duyệt

- Approval gắn `(decision_version, price_snapshot_hash)`. Khi bấm Duyệt, server kiểm tra version hiện tại = version được duyệt và snapshot chưa đổi; khác → từ chối "Giỏ vừa thay đổi, xem lại trước khi duyệt" và hiện diff.
- Idempotency key = `decision_version`: double-click trả cùng kết quả, không tạo bản ghi duyệt thứ hai.
- Mọi phiên bản mới → approval cũ vô hiệu, deeplink cũ ẩn.
- Trước khi mở deeplink: nếu snapshot > 24h (giả định) → nhắc "giá trên Shopee có thể khác, kiểm tra giá cuối ở trang thanh toán".

---

## 10. Ví dụ tính toán

### 10.1 Case 2 — iPhone 16 128GB mới, ngân sách ~19 tr, bắt buộc bảo hành Apple

Voucher Mall công khai: giảm 200.000đ cho đơn từ 15 tr (dữ liệu mẫu). Không có voucher cá nhân.

**Bước 4 — chuẩn hóa:**
- D "Like New 99%" → loại (condition used, user cần mới).
- E "iPhone 16 Plus" → loại (sai model).
- Còn A, B, C, F, G.

**Bước 5/6/7 — giá cuối và lọc:**

| Shop | Giá niêm yết | Voucher shop | Voucher Mall | Giá cuối | Bảo hành | Kết quả |
|---|---|---|---|---|---|---|
| A Phố Táo 247 (Thường) | 17.490.000 | −200.000 (≥15tr) | — | 17.290.000 | Shop 6 tháng | FAIL: chỉ bảo hành shop; thêm RF_ACTIVATED (9 review) |
| B Bến Nghé Mobile (Mall) | 18.690.000 | −300.000 (≥18tr) | −200.000 | 18.190.000 | Apple 12, verified | PASS |
| C Sông Hàn Digital (Mall) | 18.190.000 | −150.000 (≥15tr) | −200.000 | 17.840.000 | Apple 12, verified | PASS |
| F Siêu Sale Phone 99 (Thường) | 17.290.000 | — | — | 17.290.000 | Không ghi | UNKNOWN + RF_NEW_SHOP_SPIKE (3 tháng) → loại |
| G Hải Âu iStore (Yêu thích) | 18.390.000 | −100.000 (≥18tr) | — | 18.290.000 | Apple 12, shop tự nói | UNKNOWN |

G có đáng hỏi không (2.4)? G đắt hơn C 450.000đ và không thể thắng C kể cả khi coi là PASS (cùng bảo hành, trust thấp hơn) → **không hỏi**, chỉ liệt kê "Chưa chắc: bảo hành Apple do shop tự nói". Quote chọn cho G: review tr***ng "Shop nói bảo hành hãng nhưng mình chưa kích hoạt nên chưa check được." (đúng vấn đề).

**Bước 9 — chấm điểm (B, C), trọng số mặc định 40/30/20/10:**

| | B | C |
|---|---|---|
| Giá v1 (min-max, hi = 18,19 tr, lo = 17,84 tr) | 3 + 7×(18,19−18,19)/0,35 = 3,00 | 3 + 7×(18,19−17,84)/0,35 = 10,00 |
| Giá v2 (Δ% = 1,96%, s=2,5) | 10 − 4,9 = 5,10 | 10,00 |
| Uy tín v1 | 4 + 0,9×4 + log10(5400)/2 = 4 + 3,6 + 1,87 = 9,47 | 4 + 3,6 + 1,75 = 9,35 |
| Bảo hành | 10 | 10 |
| Tốc độ (days_max 2 vs 4) | 10 − 1×2 = 8 | 10 − 3×2 = 4 |
| **U v1** | (40×3 + 30×9,47 + 20×10 + 10×8)/100 = **6,84** | (400 + 280,4 + 200 + 40)/100 = **9,20** |
| **U v2** | (204 + 284 + 200 + 80)/100 = **7,68** | **9,20** |

→ **C thắng** (khoảng cách 1,52 với v2, > 0,5 → không phải lựa chọn ngang nhau).

Độ nhạy (v2): preset Ưu tiên giao nhanh 25/25/15/35 → B = (127,5 + 236,7 + 150 + 280)/100 = 7,94; C = (250 + 233,7 + 150 + 140)/100 = 7,74 → **B thắng**. Lưu flip_condition; UI thêm câu: "Nếu bạn cần nhận sớm, Bến Nghé Mobile giao 1–2 ngày, đắt hơn 350k." (Với v1, C vẫn thắng ở mọi preset vì min-max thổi phồng chênh 1,96% thành 7 điểm — đây là lý do đề xuất v2.)

**Bước 8 — thời điểm:** hôm nay 25/10/2026, 11.11 còn 17 ngày (≤ D_max 21). Expected 2,5% × 17,84 tr ≈ 446.000đ ≥ 300.000đ, nhưng không có lịch sử giá → confidence thấp → **MUA**, kèm dòng "Không gấp thì có thể chờ 11.11, ước tính rẻ thêm khoảng 2–3% (chưa chắc)."

**Kết quả:** MUA — "Musk chọn Sông Hàn Digital (Mall): 17.840.000đ, đã gồm voucher shop và voucher Mall." Lý do: bảo hành Apple 12 tháng đã xác minh; giá cuối rẻ nhất trong các lựa chọn đạt yêu cầu. Đánh đổi: giao 3–4 ngày. Bảng tóm tắt: C | B | cột mờ A "Rẻ hơn 550k nhưng chỉ bảo hành shop 6 tháng; 9 người mua nói máy đã kích hoạt".

**Biến thể "cần nhận trong 2 ngày":** hard days_max ≤ 2. C (3–4) FAIL, G (2–3) FAIL, B (1–2) PASS → B là PASS duy nhất → MUA B 18.190.000đ. Diff: "Đổi từ Sông Hàn Digital sang Bến Nghé Mobile vì bạn cần nhận trong 2 ngày (Sông Hàn giao 3–4 ngày). Giá cuối +350k." Approval của phiên bản trước vô hiệu.

**Biến thể thêm voucher cá nhân (8%, tối đa 300k, đơn từ 10 tr, shop Mall):** B: 18.690.000 × 8% = 1.495.200 → cap 300.000 → 17.890.000đ; C: 17.540.000đ. Winner không đổi; diff "Vẫn là Sông Hàn Digital; giá cuối giảm còn 17,54 tr nhờ voucher của bạn."

### 10.2 Case 1 — "tã 2 bịch, sữa Meiji 1 hộp, khăn ướt"

Profile: bé 14 tháng, 11 kg → tã quần Bobby size L; sữa Meiji Growing Up 800g (1–3 tuổi); ngân sách tháng 1.500.000đ; rule: sữa chỉ Mall, không shop < 6 tháng, sữa còn hạn ≥ 6 tháng. Hôm nay 10/2026.

Shop: K Mẹ Mây Official (Mall, voucher 60k đơn từ 800k), L Nhà Cún Con (Yêu thích, không voucher), P Kho Sỉ Bé Bi (Thường, 2 tháng), Q Sữa Ngon Chính Hãng (Mall, voucher 20k đơn từ 500k). Ship: miễn phí đơn ≥ 300k, ngược lại 15k (giả định của prototype).

**Chuẩn hóa + lọc:**

| Món | Offer | Giá | Đơn giá | Kết quả |
|---|---|---|---|---|
| Tã | d1 K Bobby quần L68 | 359.000 | 5.279đ/miếng | PASS |
| | d2 L Bobby quần L68 | 349.000 | 5.132đ/miếng | PASS |
| | d3 P Bobby quần L68 giá kho | 289.000 | 4.250đ/miếng | FAIL: shop 2 tháng; review nhắc cận date |
| | d4 L Bobby **tã dán** L68 | 329.000 | — | Loại chuẩn hóa: tã dán |
| | d5 K Bobby quần **XL62** | 359.000 | 5.790đ/miếng | Loại chuẩn hóa: size XL |
| Sữa | m1 Q Meiji GU 800g, hạn 06/2027 | 535.000 | 66.875đ/100g | PASS (còn 8 tháng) |
| | m2 K Meiji GU 800g, không ghi hạn | 549.000 | 68.625đ/100g | UNKNOWN: không ghi hạn ("Chưa chắc") |
| | m3 L Meiji GU 800g, hạn 12/2026 | 499.000 | | FAIL: không phải Mall (và hạn còn 2 tháng) |
| | m4 P Meiji GU xách tay | 459.000 | | FAIL: shop 2 tháng, không Mall, xách tay |
| | m5 Q Meiji Infant | 569.000 | | Loại chuẩn hóa: 0–1 tuổi |
| Khăn | w1 K không mùi 100 tờ | 89.000 | 890đ/tờ | PASS |
| | w2 L không mùi 100 tờ | 69.000 | 690đ/tờ | PASS |
| | w3 P không mùi 100 tờ | 59.000 | | FAIL: shop 2 tháng; RF_QUALITY_REPEAT (14 review khăn khô, có mùi) |

m2 có đáng hỏi không? Nếu coi m2 PASS, tổ hợp tốt nhất với m2 (K: 718 + 89 + 549 = 1.356k − 60k = 1.296.000đ) vẫn đắt hơn phương án dùng m1 (1.262.000đ, xem dưới) → không hỏi; ghi "Chưa chắc: Mẹ Mây Official không ghi hạn sữa".

**Tối ưu giỏ — 2 (tã) × 1 (sữa) × 2 (khăn) = 4 tổ hợp:**

| Tổ hợp | Đơn K | Đơn L | Đơn Q | Tổng |
|---|---|---|---|---|
| Tã L, khăn L (greedy) | — | 2×349 + 69 = 767k, ship 0 | 535 − 20 = 515k | **1.282.000** |
| **Tã K, khăn K** | 2×359 + 89 = 807k ≥ 800k → −60k = **747k** | — | 515k | **1.262.000** |
| Tã K, khăn L | 718k (< 800k, không voucher) | 69 + 15 ship = 84k | 515k | 1.317.000 |
| Tã L, khăn K | 89 + 15 = 104k | 698k | 515k | 1.317.000 |

→ Best = tã K + khăn K + sữa Q: **1.262.000đ**, tiết kiệm 1.282.000 − 1.262.000 = **20.000đ** so với greedy. Giải thích: đổi sang K tốn thêm 2×10k (tã) + 20k (khăn) = 40k, đổi lại voucher 60k → lợi 20k. Ngân sách 1.500.000đ → PASS. Quyết định: **MUA** (hàng tiêu dùng định kỳ, không có tồn kho trong profile → không CHỜ; 11.11 chỉ hiện gợi ý).

Hiển thị (case 1, mỗi món 1 dòng):
- Tã quần Bobby L68 × 2 — Mẹ Mây Official — 718.000đ — "Đắt hơn Nhà Cún Con 10k/bịch nhưng gom cùng đơn để dùng voucher 60k."
- Sữa Meiji Growing Up 800g × 1 — Sữa Ngon Chính Hãng — 535.000đ — "Shop Mall, hạn 06/2027 (người mua chụp tem nhà phân phối)."
- Khăn ướt không mùi 100 tờ × 1 — Mẹ Mây Official — 89.000đ — "Gom cùng đơn tã."
- "Tổng 1.262.000đ, đã gồm voucher và phí ship. Tiết kiệm 20.000đ nhờ gom đơn."

Ghi chú: tổng dòng hàng = 1.342.000đ; giá cuối = 1.342.000 − 60.000 − 20.000 = 1.262.000đ. UI chỉ hiện giá cuối.

---

## 11. Test case cho decision engine

| # | Input | Kỳ vọng |
|---|---|---|
| T1 | Case 2 mặc định, bắt buộc Apple, ngân sách 19tr | MUA C 17.840.000; A ở "bị loại" (bảo hành shop); G "chưa chắc", không hỏi |
| T2 | T1 + "cần nhận trong 2 ngày" | MUA B 18.190.000; diff C→B; approval v trước bị từ chối |
| T3 | T1 + "bảo hành shop cũng được" | A vẫn bị loại nếu user cần "mới" và RF_ACTIVATED nặng; nếu RF chỉ vừa → A vào bảng với trust trừ điểm; winner theo U |
| T4 | T1 + ngân sách 17,5tr tối đa | Không PASS (B, C vượt); HỎI LẠI nới ngân sách: "+5% (18,375 tr) → Sông Hàn 17,84 tr" |
| T5 | T1 + chỉ có G là Apple | HỎI LẠI xác nhận rủi ro về G; không hiện pay bar |
| T6 | T1 + preset Ưu tiên giao nhanh (giá v2) | B thắng (7,94 vs 7,74); vì chênh < 0,5 → HỎI LẠI "chọn 1 trong 2" |
| T7 | T1 + voucher cá nhân 8%/300k/10tr/Mall | C 17.540.000, winner không đổi, version +1 |
| T8 | Voucher ảnh thiếu min spend | Không trừ; hỏi "voucher này áp cho đơn từ bao nhiêu?" |
| T9 | Case 1 mẫu | MUA giỏ K(tã×2, khăn) + Q(sữa) 1.262.000; saving 20.000 |
| T10 | T9 + tã 3 bịch | K: 3×359+89 = 1.166k − 60k = 1.106k; Q 515k → 1.621.000 > 1.500.000 → HỎI LẠI vượt ngân sách |
| T11 | T9 + Q hết hàng | Sữa không có PASS, có m2 UNKNOWN → HỎI LẠI: "Shop Mẹ Mây không ghi hạn sữa. Bạn muốn đợi hay mua và kiểm tra khi nhận?"; các món khác vẫn hiện |
| T12 | Offer có hạn 03/2027 (5 tháng) | FAIL hạn < 6 tháng |
| T13 | Tiêu đề "Bobby L68" variant ghi XL | RF_TITLE_CONFLICT; identity theo variant (XL) → loại chuẩn hóa |
| T14 | Hai tổ hợp giỏ cùng tổng | Chọn tổ hợp ít shop hơn, rồi trust cao hơn |
| T15 | Double-click Duyệt | Một bản ghi duyệt; lần 2 trả cùng kết quả |
| T16 | Duyệt v3 khi hiện tại v4 | Từ chối, hiện diff v3→v4 |
| T17 | Snapshot 80h | Banner cũ; evidence_confidence thấp; giá trị > 5tr → HỎI LẠI xác nhận cập nhật |
| T18 | Cùng input chạy 100 lần | Output byte-identical |
| T19 | 6 món × 8 offer (262.144 tổ hợp) | Kích hoạt cắt tỉa; kết quả trong < 500ms; tổng ≤ greedy |
| T20 | Review quote | Mọi quote khớp nguyên văn một review_id trong snapshot |
| T21 | Shop rating 5.0, 3 review | trust_v2 dùng rating_adj ≈ 4,57, không đạt +4 điểm |
| T22 | Offer rẻ hơn 20% median, shop Thường 4 tháng | RF_PRICE_TOO_LOW nặng + rule tuổi shop → loại |

---

## 12. Câu hỏi mở

1. **Thứ tự cộng dồn voucher trên Shopee** (min spend voucher sàn tính trước hay sau voucher shop; voucher cá nhân chiếm slot nào; số voucher tối đa mỗi lần thanh toán) — cần kiểm chứng trên trang thanh toán thật.
2. **Ngưỡng freeship và phí ship** (prototype: miễn phí ≥ 300k, ngược lại 15k) — phụ thuộc gói freeship của shop và địa chỉ; cần nguồn dữ liệu.
3. **Mức giảm kỳ vọng theo đợt sale** cho từng category — cần lịch sử giá; MVP chưa có nên CHỜ gần như không kích hoạt. Có chấp nhận điều đó cho demo không?
4. **Cách nâng "claimed" lên "verified"** cho bảo hành Apple: shop Mall có đủ để coi là verified không? Có được tra serial trên trang Apple (cần serial — chỉ có sau khi mua)?
5. **Hệ số giá v2** (s = 2,5 cho phone, 1,0 cho hàng tiêu dùng) và ngưỡng "quá sát" 0,5 — cần thử với người dùng; v2 làm T6 chuyển thành lựa chọn ngang nhau.
6. **Tốc độ dùng tã/sữa và tồn kho** — hỏi một lần khi onboarding hay suy từ lịch sử mua (post-MVP)?
7. **Hạn giao "2 ngày"**: tính theo days_max (thận trọng) hay xác suất giao đúng hạn? MVP dùng days_max.
8. **Chính sách Shopee Mall** (cam kết chính hãng, đổi trả 15 ngày) — ghi trong UI như sự thật hay "theo chính sách sàn, cần kiểm chứng"?
9. **Snapshot hợp pháp**: tần suất cập nhật, ai chịu trách nhiệm provenance, và ngưỡng "cũ" (24h/72h) có phù hợp với giá biến động trong ngày sale không.
10. **Món bù min spend**: chỉ từ danh sách định kỳ của profile, hay cho phép gợi ý món khác (rủi ro upsell)?
