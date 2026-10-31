# Musk — PRD: Trợ lý quyết định mua sắm trên Shopee (mọi ngành hàng)

| | |
|---|---|
| Phiên bản | 2.0 (viết lại 26/10/2026) |
| Thay thế | `prd-decision-engine.md`, `prd-buyer-advisory.md` và dàn ý trong Google Doc "SEA Hackathon — Dàn ý" (các file cũ giữ lại làm tư liệu) |
| Phạm vi | Mọi sản phẩm bán trên Shopee. Hành vi riêng của từng ngành hàng nằm trong **Category Pack** (cấu hình), không nằm trong code hay trong phần thân PRD |
| Mockup | Bản web chat dựng để demo cho team. **Chỉ là mẫu**: dùng điện thoại và đồ em bé làm ngành minh họa. Xem mục 17 và Phụ lục |
| Phụ lục | `prd-musk-shopee-phu-luc.md`: pack mẫu, ví dụ tính toán, test case |

Quy ước:
- **PHẢI** = bắt buộc cho MVP. **NÊN** = làm trong MVP nếu kịp. **SAU** = sau MVP.
- **(giả định, cần kiểm chứng)** = con số hoặc chính sách chưa được xác nhận, dùng tạm.
- Điểm số thang 0–10. Tiền tệ VND, làm tròn đến đồng.
- Các ví dụ trong phần thân chỉ để minh họa cơ chế. Số liệu cụ thể của từng ngành nằm ở Phụ lục.

---

## 1. Vấn đề, mục tiêu, nguyên tắc

### 1.1 Vấn đề

Shopee có rất nhiều shop bán cùng một sản phẩm. Để mua đúng, người mua phải tự làm bốn việc:
1. Xác định các listing có thực sự là **cùng một sản phẩm** hay không (đúng phiên bản, quy cách, tình trạng).
2. Tính **giá cuối thật** sau voucher và phí ship.
3. Đánh giá **shop và bằng chứng** (rating có thật không, người mua chê gì, có bảo đảm gì).
4. Cân nhắc **đánh đổi** (rẻ hơn nhưng giao chậm, đắt hơn nhưng chắc chắn hơn) và **thời điểm mua**.

Công cụ so sánh giá hiện có chỉ giải quyết việc 2, và thường chỉ cho thấy giá niêm yết. Người mua cần **sự tự tin rằng mình đang mua đúng**, không cần thêm danh sách gợi ý.

### 1.2 Mục tiêu sản phẩm

Musk giúp người mua đi từ "tôi muốn mua X" đến "tôi tự tin bấm mua ở shop này", với:
- Một đề xuất rõ ràng, có lý do, có đánh đổi, có nguồn dữ liệu.
- Giá cuối thật, tính từ dữ liệu có thật.
- Kiểm soát nằm ở người mua: Musk chỉ đề xuất, người mua tự đặt hàng trên Shopee.

Câu định vị: *Musk là trợ lý quyết định mua sắm dựa trên bằng chứng. Nó biến ưu tiên của người mua và các offer thật trên Shopee thành quyết định có giải thích, tự thích nghi khi thông tin đổi, và luôn để người mua nắm quyền.*

### 1.3 Nguyên tắc (áp dụng cho mọi ngành hàng)

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| P1 | Quyết định bằng code tất định, LLM chỉ hỗ trợ | PASS/FAIL, giá, xếp hạng, quyền duyệt đều do code. LLM chỉ hiểu yêu cầu, trích xuất thuộc tính, tóm tắt review, viết câu giải thích theo template |
| P2 | UNKNOWN không bao giờ là PASS | Thiếu bằng chứng thì hỏi hoặc loại, không đoán |
| P3 | Chỉ tính thứ có dữ liệu | Giá cuối chỉ trừ khoản có dữ liệu. Thứ chưa chắc chỉ được nhắc, không làm giá đẹp hơn |
| P4 | Mọi nhận định có nguồn | Claim không truy ra được evidence thì bị bỏ trước khi hiển thị |
| P5 | Hỏi ít, hỏi đúng | Chỉ hỏi khi câu trả lời có thể đổi kết quả. Mọi câu hỏi có "Chưa biết, Musk gợi ý" |
| P6 | Mỗi màn một việc chính | Mỗi trạng thái đúng một nút chính, tối đa hai hành động phụ |
| P7 | Không hứa quá mức | Không "chắc chắn rẻ hơn", "đảm bảo chính hãng". Dữ liệu thiếu thì nói thiếu |
| P8 | Người mua nắm quyền | Musk không đặt hàng, không giữ tiền, không hỏi mật khẩu |
| P9 | Thêm ngành bằng cấu hình | Ngành mới = thêm Category Pack. Không sửa code lõi |

---

## 2. Phạm vi

### 2.1 Trong phạm vi MVP

- Mọi ngành hàng trên Shopee **về mặt kiến trúc**, qua Category Pack (mục 5). Chất lượng đảm bảo theo **mức sẵn sàng của pack** (mục 2.2).
- Hai kiểu nhu cầu:
  - **Giỏ nhiều món, người mua bận** ("giỏ định kỳ"): cần giỏ rẻ và an toàn, ít phải cân nhắc.
  - **Một món giá trị cao, người mua thiếu kiến thức**: cần giải thích, so sánh và cảnh báo.
- Lấy offer công khai hợp lệ, chuẩn hóa, lọc theo điều kiện, tính giá cuối, đánh giá shop và review, xếp hạng, đề xuất MUA / CHỜ / HỎI LẠI.
- Voucher cá nhân qua ảnh chụp màn hình do người mua tự gửi.
- Duyệt, mở Shopee để người mua tự thanh toán, checklist sau khi nhận.
- Tính lại khi thông tin đổi (phiên bản quyết định).
- Giao diện chat trên web (ưu tiên), responsive xuống điện thoại.

### 2.2 Mức sẵn sàng của ngành hàng

| Mức | Điều kiện | Musk làm được | Giới hạn |
|---|---|---|---|
| **L0 Chung** | Chưa có pack | Hiểu yêu cầu, tìm offer, tính giá cuối, hiển thị rating gốc và 1–3★ theo chủ đề, cảnh báo shop mới | Không chuẩn hóa sâu, không PASS/FAIL theo thuộc tính ngành, mọi kết luận gắn nhãn "độ chắc thấp". **Không** đề xuất MUA cho món trên ngưỡng giá trị cao (mục 12.1) |
| **L1 Cơ bản** | Pack có khóa định danh, câu hỏi, giá trị mặc định | Chuẩn hóa và ghép offer, hỏi làm rõ, hard constraint cơ bản | Chưa có kiểm tra "verified" riêng ngành |
| **L2 Đầy đủ** | Pack có luật xác minh, aspect review, checklist, `consumption_model` nếu là hàng tiêu hao | Toàn bộ pipeline, kể cả xác minh claimed → verified | — |

PHẢI hiển thị mức sẵn sàng cho người mua khi ngành ở L0 ("Musk chưa có hướng dẫn riêng cho ngành này, nên độ chắc chắn thấp hơn").

### 2.3 Ngoài phạm vi MVP

| Ngoài phạm vi | Lý do |
|---|---|
| Truy cập dữ liệu riêng tư trên Shopee (kho voucher, lịch sử mua, xu) | Không có API cho bên thứ ba; Musk không hỏi mật khẩu |
| Vượt CAPTCHA, anti-bot, scraping vượt điều khoản | Tuân thủ nguồn dữ liệu |
| Đặt hàng, thanh toán thay người mua | Người mua tự đặt trên Shopee |
| Xác minh tuyệt đối hàng chính hãng | Chỉ nâng claimed lên verified khi có bằng chứng độc lập (mục 8.4) |
| Khuyên đầu tư, tài chính; dự đoán giá khi thiếu dữ liệu | Rủi ro và không có dữ liệu |
| Tìm sản phẩm phù hợp khi người mua chưa biết cần gì (khám phá) | Giai đoạn sau (mục 18) |
| Hàng dịch vụ, bất động sản, xe cộ, sản phẩm số | Cần luật riêng, chưa có pack |

---

## 3. Người dùng và nhu cầu

| Persona | Mô tả | Việc cần làm (JTBD) | Kiểu nhu cầu |
|---|---|---|---|
| **Người mua bận** | Mua đồ định kỳ, biết mình cần gì, không có thời gian so sánh | "Khi tôi cần mua lại những món quen, hãy cho tôi giỏ rẻ và an toàn để tôi chỉ việc duyệt" | Giỏ nhiều món |
| **Người mua thiếu kiến thức** | Mua món lạ hoặc giá trị cao, sợ mua sai | "Khi tôi mua món mình không rành, hãy hỏi đúng vài câu, giải thích dễ hiểu và nói rõ tôi đang đánh đổi gì" | Một món giá trị cao |
| **Người mua giá nhạy cảm** | Muốn giá thấp nhất nhưng không chấp nhận rủi ro đáng kể | "Cho tôi biết đâu là lựa chọn đáng mua nhất mà không phải tự so từng listing" | Cả hai |

Profile người mua (tùy chọn, **PHẢI** do người mua tự cung cấp hoặc xác nhận): thông tin ảnh hưởng đến lựa chọn (ví dụ kích cỡ, độ tuổi người dùng sản phẩm), thương hiệu quen dùng, **quy tắc riêng** ("chỉ mua shop Mall", "không mua shop dưới 6 tháng"), ngân sách theo tháng, tồn kho đang có (hàng tiêu hao). Musk **PHẢI** đọc profile trước khi hỏi, đã có thì chỉ xác nhận.

---

## 4. Pipeline và ranh giới AI / code

```
1 Hiểu yêu cầu → 2 Hỏi làm rõ → 3 Lấy offer → 4 Chuẩn hóa → 5 Lọc điều kiện
→ 6 Làm giàu (shop, review) → 7 Giá cuối → 8 Thời điểm → 9 Xếp hạng
→ 10 Quyết định (MUA/CHỜ/HỎI LẠI) → 11 Giải thích → 12 Duyệt và mở Shopee → 13 Sau khi nhận
```

| Lớp | Việc | Ai làm |
|---|---|---|
| Intent Interpreter | Chuyển câu chat thành `PurchaseMission` có cấu trúc | LLM, kiểm schema |
| Clarifier | Chọn câu hỏi từ Category Pack | Code |
| Offer Service | Lấy offer có nguồn và thời điểm quan sát | Adapter dữ liệu |
| Normalizer | Parse thuộc tính, ghép cùng sản phẩm | Cấu trúc → regex theo pack → LLM → ảnh |
| Constraint Validator | PASS / FAIL / UNKNOWN | Code |
| Evidence Evaluator | Trust shop, khai thác review, red flag | Code (LLM chỉ trích aspect, trả JSON kiểm schema) |
| Price Engine | Giá cuối, voucher, ship, tối ưu giỏ | Code |
| Timing Advisor | MUA hay CHỜ | Code |
| Trade-off Engine | Utility, xếp hạng, độ nhạy | Code |
| Decision Policy | Chọn kiểu quyết định | Code |
| Explainer | Viết câu theo template từ slot đã tính | LLM, hậu kiểm số liệu |
| Action Controller | Duyệt, phiên bản, idempotency | Code |

LLM **không** được: quyết định PASS/FAIL, tính giá, xếp hạng, thêm số liệu không có trong slot, tự tạo review hay trích dẫn.

---

## 5. Category Pack: cơ chế để hỗ trợ mọi ngành

Mỗi ngành hàng (hoặc nhóm ngành) là một file cấu hình (YAML/JSON). Thêm ngành mới chỉ cần thêm file. Pack là nơi duy nhất chứa kiến thức riêng ngành.

### 5.1 Cấu trúc

| Nhóm | Trường | Ý nghĩa |
|---|---|---|
| Định danh | `category_id`, `match` (từ khóa, ngành Shopee), `readiness` (L1/L2), `valid_as_of`, `source_urls` | Nhận diện ngành, mức sẵn sàng, ngày kiểm chứng và nguồn |
| Danh tính sản phẩm | `identity_keys[]` | Thuộc tính **phải khớp tuyệt đối** (ví dụ thương hiệu, dòng, phiên bản chính). Khác khóa = khác sản phẩm, loại ở bước chuẩn hóa |
| Biến thể | `variant_attrs[]` | Thuộc tính khớp theo yêu cầu (màu, size, quy cách, tình trạng, nguồn gốc…) |
| Thuộc tính quyết định | `attributes[]` kèm `tier` (mandatory / default / conditional), `options[]` có giải thích một dòng, `default_rule`, `ask_if`, `priority`, `maps_to` | Dùng để hỏi, đặt mặc định, sinh constraint |
| Parse | `parsers[]` | Regex và gợi ý trích xuất cho từng thuộc tính (tiêu đề, mô tả, ảnh) |
| Đơn giá | `unit` (đ/đơn vị chuẩn), `units_per_pack` | Chuẩn hóa để so sánh khác quy cách |
| Bảo đảm | `assurance_rules` | Thế nào là "bảo đảm" của ngành (bảo hành, chính hãng, hạn dùng, đổi trả) và khi nào claimed lên verified |
| Review | `review_aspects[]`, `defect_types` (sản phẩm / giao hàng / dịch vụ shop) | Aspect cần khai thác và phân loại lỗi |
| Red flag | `red_flags[]` | Mã, điều kiện, mức (nhẹ/vừa/nặng), hệ quả |
| Chấm điểm | `price_slope` (hệ số s), `sub_scores[]` được bật, `presets` | Hệ số chênh giá và sub-score riêng ngành |
| Thời điểm | `sale_expectation` (% giảm kỳ vọng theo sự kiện), `min_abs_saving`, `wait_window_days` (D_max) | Chỉ dùng khi có lịch sử giá (mục 12.2) |
| Giá trị cao | `high_value_threshold` | Ngưỡng bật các chốt chặn bổ sung (mục 12.1) |
| Hàng tiêu hao | `consumption_model` | Tốc độ dùng hết, để tính urgency và gói đủ dùng |
| Người mới | `beginner_explainers[]` | Giải thích thuật ngữ ≤ 1 dòng |
| Kiểm tra | `buyer_checks[]`, `unboxing_checklist[]` | Việc cần kiểm tra trước khi mua và khi nhận hàng |

### 5.2 Quy tắc

1. **PHẢI** hết hạn pack sau 90 ngày kể từ `valid_as_of` (giả định, cần kiểm chứng). Pack hết hạn thì Musk vẫn chạy nhưng hiển thị "Thông tin ngành này có thể đã cũ".
2. **PHẢI** có bài kiểm thử cho mỗi pack (mục 16).
3. **PHẢI** kiểm thử việc thêm ngành bằng một pack giả, không sửa code.
4. Pack không được chứa thứ không có nguồn. Con số chưa kiểm chứng ghi "(giả định, cần kiểm chứng)".
5. Pack có thể kế thừa pack cha (ví dụ nhóm "thời trang" → "giày") để dùng lại luật chung.

### 5.3 Chế độ chung (L0) khi chưa có pack

Musk dùng **bộ luật chung** (mục 8.2, 10, 11) với các suy ra tự động:
- Khóa định danh: lấy từ trường có cấu trúc của listing (tên sản phẩm, biến thể đã chọn). Không đủ thì không ghép.
- Câu hỏi: tối đa 2, chỉ hỏi biến thể mà các ứng viên **khác nhau thật** (màu, size, quy cách) và ngân sách nếu thiếu.
- Aspect review: dùng bộ chung (đúng mô tả, chất lượng, đóng gói, giao hàng, tư vấn shop).
- Mọi quyết định gắn nhãn "độ chắc thấp"; không có xác minh claimed → verified.

---

## 6. Hỏi đáp làm rõ

### 6.1 Quy tắc chung

- **PHẢI** hỏi trước khi tìm nếu còn thuộc tính `mandatory` chưa rõ.
- **PHẢI** chỉ hỏi câu mà câu trả lời làm thay đổi kết quả. Nếu mọi ứng viên giống nhau ở thuộc tính đó, bỏ qua.
- **PHẢI** tối đa **3 câu mỗi lượt** và **2 lượt** trước đề xuất đầu tiên. Thuộc tính còn lại dùng mặc định, ghi rõ "Musk đã giả định" và cho sửa ngay trên màn đề xuất.
- **PHẢI** có lựa chọn "Chưa biết, Musk gợi ý giúp" ở mọi câu. Khi chọn, Musk dùng `default_rule` và nói rõ đã giả định gì.
- **PHẢI** đọc profile và lịch sử trước. Đã có câu trả lời thì xác nhận, không hỏi lại ("Vẫn size cũ nhé?").
- Với người mua có profile đủ và giỏ định kỳ, **PHẢI** hỏi tối đa 1 câu.
- **NÊN** phát hiện người mới qua câu chữ ("không rành", "mua cho mẹ", thiếu thông số). Khi đó mỗi lựa chọn có một dòng giải thích, và Musk nói ngắn tối đa 3 điểm trước khi đề xuất (khái niệm chính, thứ dễ bị bỏ sót, khác biệt giá giữa các tình trạng).

### 6.2 Chọn câu hỏi

1. Lấy thuộc tính `mandatory` chưa có giá trị, theo `priority`.
2. Thêm thuộc tính `conditional` có `ask_if` đúng trên tập ứng viên hiện tại.
3. Cắt còn tối đa 3 câu. Phần còn lại dùng `default_rule`.
4. Câu hỏi về điều người mua **không thể biết** (ví dụ chi tiết kỹ thuật) thì không hỏi, dùng mặc định và cho sửa.

### 6.3 Mẫu hội thoại

**Không đạt:** hỏi dồn 5 câu, hỏi lại điều đã có trong profile, hoặc tìm ngay mà không hỏi biến thể quan trọng.
**Đạt:** "Musk cần 2 điều để chọn đúng: (1) …; (2) … [Chưa biết, Musk gợi ý giúp]". Sau khi trả lời: "Musk chọn {mặc định} cho an toàn. Lưu ý: {1 điều dễ bỏ sót}. Đang tìm…"

---

## 7. Offer và chuẩn hóa

### 7.1 Mô hình dữ liệu

```
Offer { offer_id, source_url, observed_at, snapshot_id, shop_id, title_raw, images[], price_list, stock,
        identity: ProductIdentity, attrs: { field: Value }, shipping{days_min,days_max,ship_fee,from_location},
        vouchers_visible[], return_policy, assurance }
Value { v, status: verified | claimed_by_shop | inferred | unknown, evidence_ids[] }
Evidence { id, type: listing_field | title | description | review | buyer_photo | shop_page | user_upload | official_lookup,
           source_url, observed_at, excerpt, confidence }
```
`inferred` (suy từ tiêu đề) được coi như `claimed_by_shop` khi lọc. Mỗi thuộc tính mang trạng thái riêng. Trường không thu thập được **PHẢI** để `unknown`, không tự điền.

### 7.2 Thứ tự parse

1. Trường có cấu trúc của listing (biến thể đã chọn, thuộc tính).
2. Regex theo `parsers` của pack.
3. LLM trích xuất khi regex không ra (output JSON kiểm schema).
4. Đối chiếu ảnh nếu có.

Nếu bước 1 mâu thuẫn bước 2/3 → giữ giá trị của trường có cấu trúc, gắn cờ `title_conflict` (red flag nhẹ). Nhiều biến thể trong một listing → tách thành nhiều offer ảo, mỗi biến thể một giá.

### 7.3 Quy tắc ghép

| Tình huống | Hành động | Hiển thị |
|---|---|---|
| Khóa định danh khớp, biến thể khớp | Ghép vào nhóm so sánh | — |
| Khóa định danh khác | **Loại ở chuẩn hóa**, không chạy lọc | Chỉ ở mục "bị loại" chi tiết: "Sai loại: …" |
| Biến thể khác nhưng có thể chấp nhận | Người mua đã nói rõ → loại. Chưa nói và thuộc tính quan trọng → **hỏi** (chỉ khi chênh giá ≥ 10%, giả định) | "Có 1 lựa chọn {biến thể khác} rẻ hơn X. Bạn có cân nhắc không?" |
| Khóa định danh unknown | Không ghép, không hỏi, ghi audit | Không hiện |
| Quy cách khác (gói nhỏ/lớn) | Ghép, so theo đơn giá, quy đổi số lượng gần nhất ≥ nhu cầu | "2 gói A = N đơn vị (ít hơn nhu cầu M)" |

Nguyên tắc: hỏi người mua chỉ khi câu trả lời có thể đổi kết quả (có ít nhất một offer đổi PASS/FAIL hoặc đổi top 1). Ngược lại áp mặc định của pack.

### 7.4 Đơn giá chuẩn hóa

`unit_price = final_line_price / (pack_count × units_per_pack)` theo `unit` của pack. Dùng để so khác quy cách, phát hiện giá bất thường, gợi ý đổi quy cách khi rẻ hơn ≥ 5% (giả định). **Không tự đổi** quy cách khi người mua đã chỉ định, chỉ gợi ý.

---

## 8. Điều kiện bắt buộc và ưu tiên mềm

### 8.1 Nguồn và thứ tự ưu tiên

`user_said (lượt này) > user_said (lượt trước) > profile > category_default > inferred`. Mỗi constraint lưu `source` để giải thích ("vì bạn đặt quy tắc chỉ mua shop Mall").

- **Hard**: vi phạm → FAIL → loại. Đánh giá bằng code.
- **Soft**: đưa vào điểm số.

### 8.2 Danh mục constraint chung

Các loại dưới đây là **khung chung**. Pack quyết định loại nào áp dụng và giá trị cụ thể.

| Constraint | Loại | Nguồn mặc định | PASS | FAIL | UNKNOWN |
|---|---|---|---|---|---|
| Đúng sản phẩm (identity) | hard | yêu cầu | khớp | khác | không parse được → loại ở chuẩn hóa |
| Biến thể đã chọn (màu, size, quy cách…) | hard | user_said / profile | khớp và còn hàng | khác hoặc hết hàng | không rõ tồn kho → hỏi nếu là biến thể bắt buộc |
| Tình trạng (mới / đã dùng / tân trang) | hard nếu người mua nói rõ | user_said | khớp, không red flag | khác | "mới" chỉ do shop tự nói → xét red flag |
| Ngân sách món / giỏ | hard | user_said, profile | `final ≤ ngân sách × (1+tol)` | vượt | không đọc được giá |
| Bảo đảm (bảo hành, chính hãng, nguồn gốc) | hard nếu người mua yêu cầu, ngược lại soft | pack + user_said | verified | không đạt | claimed hoặc không ghi |
| Hạn giao | hard nếu người mua nói hạn, ngược lại soft | user_said | `days_max ≤ hạn` | `days_min > hạn`, hoặc `days_min ≤ hạn < days_max` (MVP thận trọng) | không có ETA |
| Loại shop (Mall / Yêu thích / Thường) | hard nếu là quy tắc profile | profile | đúng loại | khác | — |
| Tuổi shop tối thiểu | hard nếu là quy tắc profile | profile | đủ tuổi | chưa đủ | không có dữ liệu |
| Độ tươi (hạn dùng, ngày sản xuất) | hard nếu pack bật | pack, profile | còn ≥ ngưỡng | dưới ngưỡng | không ghi |
| Kích cỡ / độ tuổi theo hồ sơ | hard (qua identity) | profile | khớp | khác | — |
| Thương hiệu quen | soft; hard nếu profile đánh "chỉ dùng" | profile | — | — | — |
| Đổi trả tối thiểu | soft | pack | — | — | — |
| Ngân sách tháng | hard ở mức giỏ | profile | `tổng giỏ ≤ ngân sách` | vượt → HỎI LẠI bớt món | — |

Tolerance ngân sách: 0% khi người mua nói "tối đa", 3% khi nói "khoảng/~" (giả định). Offer trong vùng tol vẫn PASS nhưng giải thích **PHẢI** nói "vượt ngân sách X".

### 8.3 Quy tắc đánh giá

```
status(offer) = FAIL     nếu bất kỳ hard check = FAIL
              = UNKNOWN  nếu không FAIL và có ≥1 hard check = UNKNOWN
              = PASS     nếu mọi hard check = PASS
```
UNKNOWN **không bao giờ** được tính như PASS: không vào bảng xếp hạng chính, không được chọn làm winner, không vào giỏ.

`claimed_by_shop` cho constraint "bắt buộc xác minh" (bảo đảm, chính hãng, độ tươi) → UNKNOWN. Cho constraint không đòi xác minh (thời gian giao, số lượng) → PASS.

### 8.4 Nâng claimed lên verified

Chỉ khi có bằng chứng độc lập, theo `assurance_rules` của pack. Các loại bằng chứng chung:
- Shop có nhãn đủ điều kiện (ví dụ Mall ủy quyền, thương hiệu khớp).
- ≥ 2 review có ảnh trong 60 ngày xác nhận đúng thuộc tính (ảnh bao bì, ảnh tem).
- Tra cứu chính thức (SAU).

Ngành L0 **không** có nâng cấp này: mọi thuộc tính do shop nói vẫn là claimed.

### 8.5 UNKNOWN: hỏi hay loại?

Offer UNKNOWN chỉ được nêu ra để hỏi khi **đồng thời**:
1. Nó tốt hơn winner hiện tại đáng kể nếu coi là PASS (rẻ hơn ≥ 1% với món giá trị cao, hoặc lọt top 1 theo utility), **và**
2. Câu hỏi có thể trả lời bởi người mua (chấp nhận rủi ro, hoặc tự kiểm tra khi nhận).

Không thỏa → nằm trong "Chưa chắc" (chi tiết), không hỏi. Không có PASS nào mà có UNKNOWN → HỎI LẠI. Chỉ có FAIL → chạy gợi ý nới điều kiện (8.6).

### 8.6 Gợi ý nới điều kiện

Với mỗi hard constraint không thuộc `identity`, chạy lại với constraint bị bỏ hoặc nới một nấc. Chọn tối đa 2 phương án có ≥ 1 offer PASS mới, chi phí thấp nhất.

| Thứ tự nới (dễ trước) | Constraint | Không bao giờ tự nới |
|---|---|---|
| 1 | Hạn nhận (+1, +2 ngày) | identity (đúng sản phẩm, đúng cỡ) |
| 2 | Ngân sách (+5%, +10%) | các ngưỡng an toàn của pack (ví dụ hạn dùng tối thiểu) |
| 3 | Ưu tiên mềm | shop có red flag nặng |
| 4 | Bảo đảm → chấp nhận "shop tự nói" | |
| 5 | Quy tắc profile (loại shop, tuổi shop), chỉ đề xuất, người mua phải xác nhận rõ | |

Hiển thị luôn kèm tác động cụ thể ("Nếu chờ 2 ngày: {shop}, {giá}"). Không tự áp.

---

## 9. Giá cuối (giá thực trả)

### 9.1 Thành phần

| Thành phần | Có dữ liệu ở MVP? | Trừ vào giá? |
|---|---|---|
| Giá niêm yết (theo biến thể) | Có (snapshot) | Là gốc |
| Voucher shop | Có (công khai) | Có, nếu đạt min spend |
| Voucher Shopee / Mall / Freeship | Một phần (voucher công khai đang chạy) | Có, nếu điều kiện rõ |
| Voucher cá nhân | Có nếu người mua gửi ảnh (mục 9.4) | Có nếu đọc đủ 4 trường (mức/%, mức tối đa, đơn tối thiểu, phạm vi, hạn); thiếu trường → không trừ, hỏi |
| Khuyến mãi thanh toán (ngân hàng, ví) | Không chắc | **Không**, chỉ ghi chú "có thể giảm thêm" |
| Xu Shopee | Không (cần đăng nhập) | **Không** |
| Combo / mua kèm của shop | Có nếu hiển thị trên listing | Có nếu giỏ thực sự chứa combo |
| Phí vận chuyển | Ước lượng | Cộng vào |

### 9.2 Thứ tự cộng dồn (giả định, cần kiểm chứng trên trang thanh toán thật)

```
subtotal_shop    = Σ (giá biến thể × số lượng) trong đơn của shop
sau_voucher_shop = subtotal_shop − voucher_shop      (nếu đạt min spend; tối đa 1 voucher shop/đơn)
sau_voucher_san  = sau_voucher_shop − voucher_san    (Shopee/Mall; 1 voucher sàn/lần thanh toán)
ship             = phí ship ước lượng − voucher freeship (nếu đạt điều kiện)
final            = sau_voucher_san + ship
```
- Theo blog Shopee, một đơn dùng tối đa 3 mã: 1 Voucher Shop, 1 Voucher Shopee, 1 Freeship Xtra.
- Voucher cá nhân thường là voucher sàn hoặc voucher shop → chiếm slot tương ứng, **không** thêm slot mới. Nhiều voucher cùng slot thì chọn cái giảm nhiều nhất.
- Voucher % có cap: `giảm = min(base × pct, cap)`.
- Cơ sở tính min spend (trước hay sau voucher shop) là **tham số**, vì chưa kiểm chứng.
- Ghi `price_breakdown` đầy đủ trong decision (audit). UI chỉ hiện giá cuối và một dòng "đã gồm …".

### 9.3 Tối ưu giỏ (giỏ nhiều món)

Chọn một offer PASS cho mỗi món để cực tiểu `Σ final(đơn theo shop)` và thỏa ngân sách tháng.
- **MVP:** duyệt toàn bộ tổ hợp (≤ 3.125 tổ hợp với 5 món × 5 offer).
- Khi `Π|PASS_i| > 20.000` (giả định): cắt tỉa theo dominance; giữ tối đa 4 offer/món (2 rẻ nhất + offer rẻ nhất tại mỗi shop có voucher đơn); nếu vẫn lớn thì tìm theo tập shop (≤ 3 shop).
- **Tie-break:** tổng chênh ≤ 1.000đ → ít shop hơn → trust trung bình cao hơn → ETA max nhỏ hơn → `offer_id`.
- **Báo tiết kiệm:** `saving = total(greedy rẻ nhất từng món) − total(best)`, chỉ hiện khi ≥ 10.000đ (giả định). Greedy dùng cùng tập PASS và cùng công thức giá.
- **Gom đơn** nằm trong tối ưu. Giải thích dạng: "Đắt hơn X/đơn vị nhưng gom cùng đơn để dùng voucher Y."
- **Món bù min spend:** chỉ gợi ý khi đơn thiếu `gap ≤ voucher` và `gap ≤ 15% subtotal` (giả định), món phải thuộc danh sách mua định kỳ của profile. Không tự thêm vào giỏ: hiện nút "Thêm". Không gợi ý món ngoài profile ở MVP (tránh upsell).

### 9.4 Voucher cá nhân (ví voucher)

**Vì sao cần:** kho voucher của mỗi tài khoản khác nhau, Musk chỉ thấy voucher công khai.
**Giải thích cho người mua:** "Kho Voucher" là nơi Shopee lưu mã bạn đã bấm Lưu (app: Tôi → Kho Voucher). Có voucher Shopee, voucher shop, freeship, hoàn xu. Mỗi mã có đơn tối thiểu, mức giảm tối đa, hạn dùng, phạm vi.
**Vì sao Musk không tự xem:** không có API cho bên thứ ba (giả định, cần kiểm chứng). Musk **KHÔNG BAO GIỜ** hỏi mật khẩu, OTP hay yêu cầu đăng nhập Shopee thay người mua.

Luồng MVP:
1. Chỉ gợi ý khi giỏ đã chốt, ở màn Duyệt, một lần (hiện lại chỉ khi giỏ đổi ≥ 20% giá trị, giả định). Bỏ qua thì không nhắc lại trong phiên.
2. Người mua mở Shopee, chụp 1–3 ảnh Kho Voucher, tải lên.
3. Musk đọc ảnh (OCR + phân tích): tên mã, mức giảm, %, mức tối đa, đơn tối thiểu, phạm vi, hạn.
4. Hiển thị danh sách mã đọc được để **người mua xác nhận hoặc sửa** trước khi tính. Mã đọc không chắc ghi "Musk đọc chưa chắc — kiểm tra lại".
5. Engine tính lại giá cuối, tạo **phiên bản mới**, nêu mã cần chọn khi thanh toán.

Quyền riêng tư:
- **PHẢI** xóa ảnh gốc sau khi xử lý, chỉ giữ dữ liệu voucher đã trích. Lưu đến khi mã hết hạn hoặc 30 ngày (giả định, cần pháp chế duyệt).
- **PHẢI** che hoặc bỏ qua thông tin cá nhân trong ảnh (tên, số điện thoại, số dư ví).
- **PHẢI** có nút "Xóa voucher đã lưu".
- **PHẢI** nói rõ: voucher có thể đã hết lượt dù còn hạn; giá cuối thật là giá ở màn thanh toán Shopee.

Copy bắt buộc: "Bạn có mã giảm giá riêng trên Shopee? Musk chỉ thấy mã công khai… [Chụp Kho Voucher để Musk tính lại] [Bỏ qua]. *Musk không cần mật khẩu Shopee. Ảnh được xóa sau khi đọc.*"

**SAU:** tiện ích trình duyệt chỉ đọc trang Kho Voucher khi người mua bấm "Đồng bộ" (cần đánh giá điều khoản Shopee).

### 9.5 Hiển thị giá cho người mua

- Một con số: **giá cuối** (một món: giá món; giỏ: tổng giỏ và giá từng dòng).
- Một dòng: "Đã gồm voucher shop, voucher Mall và phí ship." Có voucher cá nhân: "đã gồm voucher của bạn (hạn …)".
- Ưu đãi chưa tính: "Có thể rẻ hơn nếu dùng Xu hoặc ưu đãi thẻ — Musk chưa tính." (một dòng, màu trung tính).
- Breakdown chỉ ở "Xem so sánh chi tiết".
- Không có lịch sử giá thì **không** hiển thị % giảm của shop như một lợi ích.

---

## 10. Uy tín và bằng chứng

### 10.1 Tín hiệu shop

| Tín hiệu | Dùng ở đâu | Ghi chú |
|---|---|---|
| Loại shop (Mall / Yêu thích / Thường) | trust (điểm nền) | Mall = cam kết theo chính sách sàn (cần kiểm chứng điều khoản) |
| Rating shop, số đánh giá | trust | Chỉ có nghĩa khi đủ nhiều đánh giá |
| Đã bán | chi tiết, red flag (tỷ lệ bán/đánh giá) | |
| Tuổi shop | hard rule (profile), trust v2 | |
| Tỷ lệ phản hồi chat, thời gian phản hồi | trust v2 | |
| Chính sách đổi trả | trust v2, chi tiết | "Không ghi" bị trừ |
| Vị trí kho | ETA, chi tiết | |

### 10.2 Công thức trust

Baseline v1:
```
trust_v1 = min(10, tier_pts + max(0, rating − 4) × 4 + min(2, log10(max(1, n)) / 2))
tier_pts: Mall 4, Yêu thích 2.5, Thường 1
```
Đề xuất v2 (khắc phục rating cao với rất ít đánh giá):
```
rating_adj = (rating × n + 4.5 × 20) / (n + 20)        // kéo về 4.5 khi ít đánh giá (giả định)
trust_v2 = clamp( tier_pts + max(0, rating_adj − 4) × 4 + min(2, log10(max(1, n)) / 2)
                  − 2×[tuổi < 6 tháng] − 1×[chat < 80%] − 1×[đổi trả "không ghi"] − penalty(red_flags), 0, 10)
penalty: nhẹ 0.5, vừa 1.5, nặng → loại
```
Thiếu field thì dùng v1.

### 10.3 Rating đã lọc seeding

Musk **PHẢI** tính và hiển thị **rating gốc** và **rating đã lọc seeding**, kèm số đánh giá bị loại và lý do. Mẫu tối đa 200 đánh giá mới nhất (giả định).

| Tín hiệu | Cách tính | Ngưỡng nghi ngờ (giả định) |
|---|---|---|
| Đợt 5★ ngắn dồn dập | Số review 5★ ≤ 10 ký tự trong cửa sổ 48h so với trung bình | > 3× |
| Nội dung trùng | Độ giống văn bản (n-gram/embedding) | ≥ 0,9 với ≥ 3 review khác |
| Nhắc quà/xu | Từ khóa "tặng", "quà", "xu", "đánh giá 5 sao được", "hoàn tiền" | Có là đánh dấu |
| Tài khoản reviewer | Tên ẩn, không ảnh đại diện, ít lịch sử | Chỉ dùng khi có dữ liệu |
| Tỷ lệ đánh giá / đã bán | `review_count / sold` | > 0,6 hoặc < 0,02 |
| Phân bố sao | 5★ cao, 2–4★ rất thấp | 5★ > 90% và 2–4★ < 3% |
| Đánh giá không nói về sản phẩm | Chỉ khen giao hàng/đóng gói | Hạ trọng số, không loại |

Hiển thị: tóm tắt "4,9★ (gốc) → 4,5★ sau khi loại 212/1.034 đánh giá nghi seeding"; chi tiết: bảng tín hiệu và 2–3 ví dụ. **PHẢI** dùng chữ "nghi", không khẳng định là giả, không gọi shop là lừa đảo. Dưới 30 đánh giá: ghi "Chưa đủ dữ liệu lọc".

### 10.4 Khai thác review (đánh giá 1–3★)

1. **Aspect extraction** (LLM, output JSON kiểm schema): mỗi review → `{aspect, polarity, quote_span}`. Aspect lấy từ `review_aspects` của pack (L0 dùng bộ chung).
2. **Trọng số:** `w = recency × media × length`; `recency = 0.5^(age_days/60)` (giả định); `media = 2.0` nếu có ảnh/video; `length = 0.3` nếu < 5 từ.
3. **Điểm aspect:** `Σ w×polarity / Σ w`, `aspect_conf = min(1, Σ w / 5)`.
4. **Review 1–3★:** ưu tiên mới nhất trong 90 ngày, nhóm theo chủ đề, tách **3 loại nguyên nhân**:

| Loại | Ảnh hưởng quyết định |
|---|---|
| Sản phẩm (lỗi, hàng giả, sai mô tả…) | Mạnh. Có thể đổi MUA thành CHỜ/HỎI LẠI |
| Giao hàng (chậm, móp hộp…) | Vừa. Ghi chú, không chặn |
| Dịch vụ shop (không trả lời, từ chối đổi trả, giao sai) | Mạnh nếu lặp lại |

Mỗi nhóm hiển thị: số lượng, % trên tổng 1–3★, 1 câu trích ngắn, tối đa 3 ảnh. Đánh dấu "mới xuất hiện" nếu ≥ 50% số review nhóm đó nằm trong 30 ngày gần nhất (giả định). Shop trả lời đánh giá xấu: hiển thị "Shop trả lời X/Y".

### 10.5 Chọn review trích lên UI

Mỗi offer **1 quote** ở bảng tóm tắt, tối đa 5 ở chi tiết. Ứng viên: review thật trong snapshot, không bị cờ giả, ≤ 90 ngày, ≥ 8 từ. Ưu tiên: (1) nếu offer có cảnh báo, review nói đúng vấn đề đó (ưu tiên có ảnh); (2) review đề cập aspect quyết định của ngành; (3) có ảnh > không ảnh, mới hơn > cũ, sao đại diện cho trung bình. Quote **PHẢI** là trích nguyên văn (cắt bằng "…" ở ranh giới câu), kèm tên đã che, số sao, ngày. Không có review hợp lệ: "Chưa có đánh giá đủ thông tin", không tự viết.

### 10.6 Red flag (khung chung)

Pack khai báo red flag riêng ngành. Khung chung:

| Mã | Điều kiện | Mức | Hệ quả |
|---|---|---|---|
| RF_NEW_SHOP_SPIKE | Shop < 6 tháng và bán rất nhiều hoặc tăng đột biến | nặng | loại |
| RF_PRICE_TOO_LOW | Giá cuối < 85% trung vị các offer cùng identity PASS (giả định) | vừa; nặng nếu kèm shop Thường mới | cảnh báo / loại |
| RF_NOT_AS_DESCRIBED | ≥ 3 review hoặc ≥ 5% review 60 ngày nói khác mô tả | nặng nếu liên quan tình trạng/chính hãng | loại / trừ điểm |
| RF_QUALITY_REPEAT | ≥ 3 review hoặc ≥ 10% nói cùng lỗi chất lượng | vừa → nặng | trừ điểm / loại nếu trái constraint |
| RF_OFF_PLATFORM | Yêu cầu chuyển khoản ngoài sàn, liên hệ ngoài để giảm giá | nặng | loại |
| RF_TITLE_CONFLICT | Tiêu đề và biến thể mâu thuẫn | nhẹ | ghi chú |
| RF_FAKE_REVIEWS | Heuristic 10.3 kích hoạt | vừa | trust −1.5, giảm confidence |
| RF_NO_ASSURANCE_INFO | Ngành cần thông tin bảo đảm nhưng listing không ghi | vừa | UNKNOWN |

### 10.7 Độ tin của bằng chứng

Mỗi offer có `evidence_confidence ∈ {cao, trung bình, thấp}`, tính riêng, **không cộng** vào utility:
```
cao        : mọi field quyết định verified, snapshot ≤ 24h, ≥ 20 review hữu ích
trung bình : có field claimed nhưng không phải hard, snapshot ≤ 72h
thấp       : snapshot > 72h, hoặc < 5 review hữu ích, hoặc có RF_FAKE_REVIEWS, hoặc ngành L0
```
Dùng để: (a) quyết định có cần kiểm tra lại giá trước khi duyệt; (b) chặn MUA khi winner có confidence thấp và giá trị trên `high_value_threshold` (12.1); (c) hiển thị nhãn "Musk chắc / chưa chắc".

---

## 11. Chấm điểm và xếp hạng

### 11.1 Sub-score

| Sub-score | Công thức | Ghi chú |
|---|---|---|
| Giá (v2) | `clamp(10 − s × Δ%, 0, 10)`, `Δ% = (p − p_min)/p_min × 100`; `s` lấy từ `price_slope` của pack | Điểm phản ánh % chênh thực, ổn định khi thêm/bớt offer đắt. Mặc định s = 2,5 cho món giá trị cao, 1,0 cho hàng tiêu dùng (giả định). v1 (min-max) phụ thuộc tập so sánh, chênh nhỏ bị thổi thành nhiều điểm, không dùng |
| Uy tín | trust_v1 (MVP), trust_v2 khi có dữ liệu | 10.2 |
| Bảo đảm | Do `assurance_rules` của pack: verified 10; claimed 6; shop tự bảo đảm `min(5, tháng/2)`; unknown 0 | Khi người mua bắt buộc một mức bảo đảm, các offer còn lại cùng điểm; trọng số thực chất dồn sang giá, uy tín, tốc độ |
| Tốc độ giao | `max(0, 10 − (days_max − 1) × 2)` | Dùng days_max (cam kết xấu nhất). Không có ETA → 0 và không được thắng nếu người mua có hạn |
| Độ tươi | `min(10, months_left − 2)` (giả định) | Chỉ khi pack bật |
| Chất lượng review | `5 + 5 × aspect_score_tb` khi `aspect_conf ≥ 0.5` | MVP để trọng số 0 |

### 11.2 Utility và trọng số

`U = Σ w_k × s_k / Σ w_k`

| Preset | Giá | Uy tín | Bảo đảm | Giao nhanh |
|---|---|---|---|---|
| Mặc định | 40 | 30 | 20 | 10 |
| Ưu tiên giá | 60 | 20 | 15 | 5 |
| Ưu tiên uy tín | 20 | 50 | 20 | 10 |
| Ưu tiên giao nhanh | 25 | 25 | 15 | 35 |

Pack có thể đổi preset mặc định. **Giỏ nhiều món** dùng cost-first: mục tiêu chính là tổng giỏ nhỏ nhất trong tập PASS; uy tín chỉ là tie-break vì rule profile đã chặn rủi ro.

### 11.3 Map câu chat → trọng số

| Câu người mua (ví dụ) | Tác động |
|---|---|
| "rẻ nhất", "tiết kiệm" | preset Ưu tiên giá |
| "an toàn", "uy tín", "sợ hàng giả" | preset Ưu tiên uy tín |
| "cần gấp", "giao nhanh" (không có số ngày) | preset Giao nhanh |
| "cần trong 2 ngày", "trước thứ 6" | **hard** `days_max ≤ N` (không phải trọng số) |
| "cân bằng giá và tốc độ" | trọng số cân bằng; có thể dẫn tới "hai lựa chọn ngang nhau" (11.5) |
| "{mức bảo đảm} cũng được" | bỏ hard bảo đảm, chuyển thành soft |
| "bắt buộc {mức bảo đảm}" | hard |
| "không cần gấp" | speed weight → 5, cho phép CHỜ |
| Kéo slider | ghi đè trọng số, `source=user_said` |

Parser rule-based trước, LLM fallback trả về đúng enum. Mỗi thay đổi trọng số tạo phiên bản quyết định mới.

### 11.4 Tất định

Cùng input (`snapshot_id`, mission, weights, vouchers) → cùng output. Không random, sort ổn định. Làm tròn U đến 0,01. Tie-break: U → giá cuối thấp hơn → trust cao hơn → `days_max` nhỏ hơn → `offer_id`.

### 11.5 Độ nhạy và "hai lựa chọn ngang nhau"

Sau xếp hạng, chạy: mỗi preset khác; mỗi trọng số ±10; giá mỗi offer ±2%; mỗi offer UNKNOWN coi như PASS. Winner đổi ở kịch bản nào → lưu `flip_conditions[]` và sinh tối đa 1 câu ở UI ("Nếu bạn cần nhận sớm, {shop} hợp hơn").

Trình bày thành **"hai lựa chọn ngang nhau, khác nhau ở X"** thay vì một winner nếu `U1 − U2 < 0.5` (giả định) hoặc winner đổi ở ≥ 2 kịch bản (preset, trọng số), và hai lựa chọn khác nhau ở một chiều người mua tự cân được (giá vs tốc độ, giá vs bảo đảm). UI: hai thẻ cạnh nhau, mỗi thẻ một câu "Chọn cái này nếu bạn…". Chưa hiện nút Duyệt cho đến khi người mua chọn.

---

## 12. Chính sách quyết định MUA / CHỜ / HỎI LẠI

### 12.1 Thứ tự đánh giá

```
1. Không có offer PASS:
     có UNKNOWN đáng hỏi (8.5)             → HỎI LẠI (xác nhận rủi ro)
     không                                  → HỎI LẠI (nới điều kiện, 8.6)
2. Winner vượt ngân sách (ngoài tol) / giỏ vượt ngân sách tháng → HỎI LẠI (bớt món / nới ngân sách)
3. Top 2 quá sát (11.5)                     → HỎI LẠI (chọn 1 trong 2)
4. Một món trong giỏ chưa chốt được (UNKNOWN/FAIL theo hồ sơ) → HỎI LẠI cho riêng món đó, các món khác vẫn hiện
5. Winner có evidence_confidence thấp và giá trị > high_value_threshold của pack (giả định) → HỎI LẠI (xác nhận / cập nhật giá)
6. Điều kiện CHỜ thỏa (12.2)                → CHỜ
7. Còn lại                                  → MUA
```
Ngành L0: không bao giờ ra MUA cho món trên `high_value_threshold` mặc định (giả định, cần kiểm chứng): luôn kèm xác nhận.

### 12.2 Điều kiện CHỜ

```
CHỜ khi tất cả đúng:
  a. Người mua không gấp: need_by ≥ sale_date + days_max(winner); hàng tiêu hao: còn đủ dùng tới ngày sale
  b. expected_saving = expected_pct(category, event) × final(winner) ≥ max(min_abs_saving(category), 2% × final)
  c. confidence_of_expectation ≥ trung bình (có lịch sử giá SKU/shop trong ≥ 2 đợt sale trước)
  d. days_to_sale ≤ wait_window_days(category)
```
`expected_pct`, `min_abs_saving`, `wait_window_days` lấy từ pack. Sự kiện lớn là ngày đôi (m.m); ngày 15 và 25 là sự kiện nhỏ (`expected_pct × 0,5`, giả định).

**MVP không có lịch sử giá** → điều kiện (c) gần như không thỏa → quyết định là **MUA** kèm một dòng gợi ý thời điểm. Đây là hành vi có chủ đích: không hứa giảm giá khi không có dữ liệu.

- Hàng tiêu hao: nếu profile không có tồn kho, coi như cần ngay → không CHỜ. Hàng sắp hết (< 5 ngày) **không bao giờ** nhận lời khuyên chờ; có thể gợi ý "Mua đủ dùng tới ngày sale, mua gói lớn vào ngày sale".
- So với giá tham chiếu (nếu có): `final ≤ 95% ref` → thêm dòng "Đang thấp hơn giá hãng X"; `final > ref` → cảnh báo và nghiêng CHỜ nếu không gấp.

### 12.3 Ghi chú thời điểm trên giao diện

- **KHÔNG** đặt ở đầu màn hình. **PHẢI** đặt ở màn Duyệt, ngay trên hai nút hành động.
- Chỉ hiện khi sự kiện nằm trong `wait_window_days` của ngành **và** người mua không gấp.
- Mẫu: "{Sự kiện} còn N ngày. Các năm trước, sản phẩm tương tự thường có thêm mã giảm vào ngày này, nhưng Musk không chắc giá sẽ thấp hơn. {Dữ liệu đang dùng: có/không có lịch sử giá}."
- Không có lịch sử giá: "Musk chưa có dữ liệu giá để so sánh. Nếu không gấp, bạn có thể chờ xem."
- **KHÔNG** dùng "chắc chắn rẻ hơn", "giảm tới X%" khi không có dữ liệu.
- Hai nút: **Mua ngay** (chính, sang thanh toán) và **Nhắc tôi trước {sự kiện}** (phụ: lưu giỏ, nhắc 1 ngày trước và sáng ngày sale, tính lại giá khi nhắc).

### 12.4 Output của từng quyết định

| Quyết định | Headline (mẫu) | UI | Việc của người mua |
|---|---|---|---|
| MUA | "Musk chọn {shop}: {giá}, đã gồm voucher." | Thẻ winner + so sánh + nút Duyệt | Duyệt → mở Shopee → kiểm tra khi nhận |
| CHỜ | "Nên chờ {sự kiện} ({N} ngày): dự kiến rẻ hơn ~{X}." | Thẻ winner, nút "Nhắc tôi" + "Mua luôn" | Bấm nhắc → Musk kiểm tra lại giá ngày sale |
| HỎI LẠI — xác nhận rủi ro | "Có 1 lựa chọn rẻ hơn nhưng {điều chưa chắc}. Bạn chấp nhận không?" | 2 nút trả lời + phương án an toàn | Trả lời câu hỏi |
| HỎI LẠI — nới điều kiện | "Không có offer nào {điều kiện}. Nếu {nới}: {shop}, {giá}." | Nút áp gợi ý | Chọn cách nới |
| HỎI LẠI — vượt ngân sách | "Giỏ {X}, vượt ngân sách tháng {Y}. Bớt {món}?" | Gợi ý bớt món có tác động | Chọn món bớt |
| HỎI LẠI — một món chưa chốt | "Món {A} chưa chốt: {lý do}. Bạn muốn {phương án 1} hay {phương án 2}?" | Hàng cảnh báo trong giỏ, nút Duyệt khóa | Quyết định món đó |
| HỎI LẠI — chọn 1 trong 2 | "Hai lựa chọn ngang nhau: {khác biệt}?" | 2 thẻ cạnh nhau | Chọn một |
| HỎI LẠI — dữ liệu cũ | "Giá quan sát lúc {thời điểm}, có thể đã đổi" | Banner vàng + nút Cập nhật giá | Cập nhật giá |

Nút Duyệt chỉ xuất hiện khi quyết định là MUA (hoặc CHỜ với "Mua luôn").

---

## 13. Giải thích và ngôn ngữ

### 13.1 Grounding

Mỗi câu giải thích là một `Claim {text, evidence_ids[], kind}`:
- Claim về giá → `price_breakdown_id`; về shop → `shop_snapshot_id`; về review → `review_id`; về bảo đảm/hạn → `attr evidence_id` + status.
- Claim không truy được evidence → **bị bỏ trước khi hiển thị** (validator bằng code, không phải LLM).
- Field `claimed_by_shop` luôn kèm "shop tự ghi / chưa xác minh". Field `unknown` hiện "không ghi".
- LLM chỉ điền template từ slot đã tính; hậu kiểm: mọi số trong câu phải có trong slot.

### 13.2 Template

**Vì sao chọn:** "Musk chọn {shop} ({loại shop}): {giá cuối}, đã gồm {voucher}." + tối đa 3 lý do xếp theo sub-score đóng góp lớn nhất vào khoảng cách với #2.
**Câu đánh đổi (bắt buộc khi tồn tại offer tốt hơn ở một chiều):** "Đổi lại: {điểm yếu}. Nếu {nhu cầu khác}, {shop 2} {giá 2} (+{Δ})."
**Bị loại vì:** "{shop}: {giá} — {lý do ngắn bằng ngôn ngữ thường}".
**Chưa chắc:** "Chưa chắc: {field} — {lý do}. Bạn có thể {cách tự kiểm}."
**Diff giữa phiên bản:** tối đa 2 dòng, lý do lấy từ constraint/weight vừa đổi, không đoán.

### 13.3 Giọng văn

| | Người mua bận | Người mua thiếu kiến thức |
|---|---|---|
| Độ dài | 1 dòng/món, ≤ 4 dòng + 1 dòng tiết kiệm | Headline + 3 lý do + 1 câu đánh đổi + mẹo kiểm tra |
| Thuật ngữ | Không | Giải thích ngắn lần đầu |
| Không bao giờ | "tốt nhất thị trường", "chắc chắn chính hãng" khi chưa verified, khuyên đầu tư | |

Từ cấm: "chắc chắn", "đảm bảo rẻ hơn", "giảm tới X%" khi không có dữ liệu. Dùng "nghi seeding", không dùng "giả".

---

## 14. Trải nghiệm người dùng

### 14.1 Nền tảng và hình thức

- **Web chat là bề mặt chính.** Mọi bước (hỏi, đề xuất, so sánh, duyệt, thanh toán, sau nhận) nằm **trong luồng chat dưới dạng card**. Desktop có rail "Yêu cầu của bạn" chỉ đọc; điện thoại xếp dọc.
- Mỗi lượt Musk có thể kèm **chip trả lời nhanh** (câu hỏi thường gặp, đổi ưu tiên). Người mua luôn có thể gõ tự do.

### 14.2 Các trạng thái

Dòng trạng thái trên cùng: "Bước N/5 · Tên bước" (**PHẢI**).

| # | Bước | Mục tiêu người mua | Hiển thị | Nút chính | Hành động phụ | Ẩn / để sau |
|---|---|---|---|---|---|---|
| 1 | Hỏi | Trả lời nhanh | ≤ 3 câu bấm được, "Chưa biết, Musk gợi ý" | **Tiếp tục** | Bỏ qua, dùng mặc định | Kết quả, giá |
| 2 | Đề xuất | Thấy lựa chọn tốt nhất | Một đề xuất (hoặc giỏ): ảnh, giá cuối, MUA/CHỜ/HỎI LẠI, lý do, đánh đổi, rating gốc và đã lọc, vấn đề hay gặp, giả định có thể sửa | **Duyệt giỏ này** | So sánh · Sửa yêu cầu | Lịch sử giá, review chi tiết, voucher cá nhân, ghi chú sale |
| 2b | So sánh (tùy chọn) | Hiểu vì sao chọn A | Bảng ≤ 4 cột: giá cuối, bảo đảm, giao hàng, rating đã lọc, quote, cột mờ "rẻ hơn nhưng bị loại" | **Chọn {shop}** | Quay lại đề xuất | Review đầy đủ, bảng chi tiết |
| 3 | Duyệt | Chốt một lần | Giỏ, giá cuối, voucher đã áp, **khối voucher cá nhân**, **khối thời điểm**, ghi chú phụ kiện/lưu ý của ngành | **Mua ngay** | Nhắc tôi trước {sự kiện} | Chi tiết trust score |
| 4 | Thanh toán | Đặt hàng trên Shopee | Mỗi đơn có link mở Shopee, mã cần chọn, checklist trước khi đặt | **Mở trên Shopee** | Đánh dấu đã đặt | Mọi thứ khác |
| 5 | Sau khi nhận | Kiểm tra hàng | Checklist theo ngành, nhắc chưa bấm "Đã nhận hàng" trước khi kiểm tra, lịch mua lại (hàng tiêu hao) | **Đã kiểm tra xong** | Báo vấn đề | — |

Musk không đặt hàng thay người mua. Giỏ nhiều shop mở thành nhiều đơn; hiển thị chi tiết đơn ở bước Thanh toán.

### 14.3 Quy tắc hiển thị

- **Tầng thông tin:** tóm tắt trước (≤ 3 dòng mỗi sản phẩm), chi tiết khi bấm "Vì sao?".
- **Cảnh báo** (FAIL/UNKNOWN quan trọng) nằm **ngay trong thẻ sản phẩm**, không gom ở cuối.
- Giỏ nhiều món: mỗi món một dòng (ảnh, tên, quy cách, shop, giá dòng, 1 câu lý do), nút "So sánh các shop" mở bảng nhỏ (cột = shop PASS + UNKNOWN, tối đa 4). Có thanh ngân sách tháng. Nhóm theo đơn shop chỉ ở chi tiết.
- **Lựa chọn bị loại:** mục "Không chọn vì" liệt kê offer FAIL/UNKNOWN/red flag bằng câu ngắn. Offer sai loại gom một dòng "N sản phẩm không đúng loại bạn cần". Đưa **một** offer vào bảng tóm tắt dạng cột mờ khi nó rẻ hơn winner ≥ 1% và lý do loại dễ hiểu, để trả lời "sao không lấy cái rẻ nhất?".
- **Hàng thiếu dữ liệu** luôn hiển thị câu fallback (bảng 15.3), không để trống.

### 14.4 Trạng thái biên

| Trạng thái | Hiển thị |
|---|---|
| Chỉ 1 offer PASS | Thẻ winner, không bảng; vẫn có "Không chọn vì" |
| Không PASS, có UNKNOWN | Thẻ câu hỏi + phương án nếu chấp nhận |
| Không có gì (kể cả UNKNOWN) | Gợi ý nới điều kiện; hoặc `INSUFFICIENT_EVIDENCE` nếu thiếu dữ liệu |
| Snapshot > 72h | Banner vàng "Giá quan sát lúc {time}, có thể đã đổi" + nút Cập nhật giá. Giá trị trên ngưỡng cao: chặn Duyệt cho tới khi cập nhật; dưới ngưỡng: vẫn duyệt được, khuyên cập nhật |
| Snapshot > 24h trước khi mở Shopee | Nhắc "Giá trên Shopee có thể khác, kiểm tra giá cuối ở trang thanh toán" |
| Một món trong giỏ không tìm được / chưa chốt | Giỏ vẫn hiện các món còn lại, món thiếu ở đầu kèm câu hỏi, nút Duyệt khóa |
| Không có review | "Chưa có đánh giá đủ thông tin" |
| Ảnh lỗi | Placeholder trung tính, không dùng ảnh minh họa giả |
| Ngành L0 | Nhãn "Musk chưa có hướng dẫn riêng cho ngành này" |
| Pack hết hạn | "Thông tin ngành này có thể đã cũ" |

### 14.5 Khả năng tiếp cận và đa nền tảng

NÊN: tương phản đạt WCAG AA, điều khiển bàn phím, nhãn cho nút chỉ có icon, hỗ trợ chế độ tối, tôn trọng `prefers-reduced-motion`. Điện thoại: không tràn ngang, nút xếp dọc, bảng cuộn ngang trong khung riêng.

---

## 15. Phiên bản, duyệt và dữ liệu

### 15.1 Phiên bản quyết định

Trigger tạo phiên bản mới: đổi ưu tiên/trọng số; đổi ngân sách; thêm/bớt/đổi số lượng món; khóa hoặc đổi một món; thêm voucher cá nhân; trả lời câu HỎI LẠI; snapshot mới có giá/tồn kho/voucher khác; voucher hết hạn; người mua bấm "cập nhật giá"; đổi hồ sơ (kích cỡ, độ tuổi…).

`Decision {version, parent_version, snapshot_id, mission_hash, inputs_hash, outcome, winner|cart, price_snapshot, created_at}` bất biến sau khi tạo. Diff message so với phiên bản trước, tối đa 2 dòng.

### 15.2 Duyệt

- Approval gắn `(decision_version, price_snapshot_hash)`. Khi bấm Duyệt, server kiểm tra version hiện tại = version được duyệt và snapshot chưa đổi; khác → từ chối "Giỏ vừa thay đổi, xem lại trước khi duyệt" và hiện diff.
- **Idempotency** theo `decision_version`: bấm hai lần không tạo hai bản ghi duyệt.
- Phiên bản mới → approval cũ vô hiệu; card cũ hiện "Phiên bản cũ, không còn dùng để duyệt".
- Mọi hành động có `AuditEvent`.

### 15.3 Fallback dữ liệu thiếu (bảng dùng chung)

| Mục | Nguồn | Khi thiếu |
|---|---|---|
| Rating, số đánh giá, đã bán | Trang sản phẩm | UNKNOWN, không cộng điểm tin cậy |
| Rating đã lọc seeding | Tính từ review | "Chưa đủ dữ liệu lọc (dưới 30 review)" |
| Khiếu nại 1–3★ theo chủ đề | Trang đánh giá | "Chưa có đánh giá thấp" (không coi là tốt tuyệt đối khi review ít) |
| Ảnh/video người mua | Bộ lọc "Có hình ảnh/video" | Ẩn khối |
| Shop trả lời đánh giá xấu | Phản hồi người bán | "Không thấy phản hồi" |
| Tỷ lệ đổi trả/khiếu nại | Shopee không công bố | "Shopee không công bố"; dùng nhóm "dịch vụ shop" làm proxy |
| Tồn kho theo biến thể | Trang sản phẩm | "Chưa xác định tồn kho"; HỎI LẠI nếu là biến thể bắt buộc |
| Thời gian giao | Ước tính theo vị trí | "Theo vị trí kho: {tỉnh}", không hứa ngày |
| Lịch sử giá | API hoặc tự lưu snapshot | "Chưa có lịch sử giá. Không đánh giá được mức giảm." Không nhắc % giảm của shop |
| Giảm giá ảo | Tính từ lịch sử giá | Không gắn nhãn |
| Tuổi shop, phản hồi chat, Mall | Trang shop | UNKNOWN (Mall: "Không phải Mall", trung tính) |
| Hóa đơn VAT | Mô tả listing | "Chưa rõ — hỏi shop trước khi mua" (nút soạn sẵn tin nhắn, người mua tự gửi) |
| Trung tâm bảo hành gần nhất | Pack + địa chỉ | Ẩn, ghi "Bảo hành theo shop" |

### 15.4 Chiến lược dữ liệu công khai

Nguồn công khai không mặc nhiên cho phép scraping hay tái sử dụng. Ưu tiên API được cấp quyền và trang có điều khoản cho phép; không vượt CAPTCHA hay hạn chế truy cập. Hai chế độ:
- **Live:** lấy từ nguồn được phép.
- **Snapshot:** dữ liệu đã thu thập hợp lệ, giữ provenance, dùng để demo ổn định khi nguồn live không truy cập được; **PHẢI** công khai chế độ dữ liệu đang dùng.

**Data readiness gate:** ≥ 1 nguồn hợp lệ; ≥ 3 offer cùng identity (hoặc báo "chỉ có N lựa chọn"); đọc được giá, tình trạng, shop; mỗi field quan trọng có provenance hoặc `unknown`. Không đạt → `INSUFFICIENT_EVIDENCE`, không bịa giá, huy hiệu shop hay chính sách. Phân biệt thông tin chung của nhà sản xuất với chính sách và tính hợp lệ của từng offer.

### 15.5 Quyền riêng tư

- Musk không hỏi, không lưu mật khẩu, OTP, cookie Shopee.
- Ảnh voucher xóa sau khi đọc; dữ liệu trích xuất có thời hạn lưu, có nút xóa.
- Hồ sơ người mua (cỡ, độ tuổi, quy tắc riêng) do người mua tự cung cấp, xem và xóa được. Pháp chế duyệt theo Nghị định 13/2023 về bảo vệ dữ liệu cá nhân.

### 15.6 Mô hình dữ liệu và API (tham chiếu)

| Entity | Trường chính |
|---|---|
| `PurchaseMission` | id, intent, items[], constraints, preferences, profile_ref, category_ids, status |
| `CategoryPack` | category_id, version, readiness, valid_as_of, schema (mục 5.1) |
| `Offer`, `Evidence` | mục 7.1 |
| `Decision` | mục 15.1 |
| `Approval` | decision_id, decision_version, price_snapshot_hash, status, expiry |
| `HandoffRecord` | approval_id, orders[] (link Shopee, mã cần chọn), trạng thái từng đơn |
| `AuditEvent` | type, entity_id, timestamp, payload |

| Endpoint | Việc |
|---|---|
| `POST /missions` | Parse và tạo mission |
| `POST /missions/{id}/answers` | Gửi câu trả lời làm rõ |
| `POST /missions/{id}/offers/refresh` | Tải lại offer có provenance |
| `POST /missions/{id}/evaluate` | Tạo phiên bản quyết định |
| `PATCH /missions/{id}/preferences` | Đổi ưu tiên, hồ sơ |
| `POST /missions/{id}/vouchers` | Tải ảnh voucher, trả danh sách mã để xác nhận |
| `GET /missions/{id}/decisions/latest` | Lấy đề xuất và evidence |
| `POST /decisions/{id}/approve` | Duyệt phiên bản cụ thể (idempotent) |
| `GET /missions/{id}/audit` | Nhật ký quyết định và hành động |
| `GET/PUT /packs/{category_id}` | Quản lý Category Pack (nội bộ) |

---

## 16. Chỉ số và kiểm thử

### 16.1 Chỉ số thành công (đề xuất, cần PO chốt ngưỡng)

| Nhóm | Chỉ số | Cách đo |
|---|---|---|
| Hiểu | Tỷ lệ phiên có ≤ 3 câu hỏi trước đề xuất đầu | Log |
| Tin tưởng | Tỷ lệ người dùng nói đúng "bước tiếp theo" ở mỗi màn (mục tiêu ≥ 4/5 phiên thử) | Usability test |
| Quyết định | Tỷ lệ phiên đến bước Duyệt; thời gian từ yêu cầu đến Duyệt | Log |
| Chất lượng | Tỷ lệ đề xuất bị người mua đổi sang lựa chọn khác; số lần phải sửa giả định | Log |
| An toàn | Số offer UNKNOWN/FAIL lọt vào đề xuất MUA (mục tiêu 0); số claim không có evidence được hiển thị (mục tiêu 0) | Test + audit |
| Tiết kiệm | `saving` trung bình nhờ tối ưu giỏ; mức chênh so với giá niêm yết thấp nhất | Log |
| Phủ ngành | Số ngành ở L1/L2; thời gian thêm một ngành mới | Quản trị |

### 16.2 Kiểm thử lõi (độc lập ngành)

| # | Input | Kỳ vọng |
|---|---|---|
| G1 | Offer shop rẻ nhất nhưng FAIL một hard constraint | Không được chọn; có trong "Không chọn vì" với lý do |
| G2 | Offer UNKNOWN rẻ hơn nhưng không thể thắng | Không hỏi; ghi "Chưa chắc" |
| G3 | Chỉ có offer UNKNOWN | HỎI LẠI xác nhận rủi ro; không hiện nút Duyệt |
| G4 | Người mua thêm hard constraint về hạn giao | Re-evaluate, phiên bản mới, diff message, approval cũ bị từ chối |
| G5 | Ngân sách quá thấp | HỎI LẠI nới ngân sách, nêu tác động cụ thể |
| G6 | Hai offer U chênh < 0,5 | "Hai lựa chọn ngang nhau", chưa có Duyệt |
| G7 | Voucher cá nhân thiếu min spend | Không trừ; hỏi lại |
| G8 | Voucher cá nhân hợp lệ | Giá cuối đổi, phiên bản +1, winner có thể giữ nguyên |
| G9 | Giỏ vượt ngân sách tháng | HỎI LẠI bớt món có tác động |
| G10 | Một món trong giỏ thiếu offer PASS nhưng có UNKNOWN | HỎI LẠI riêng món đó; các món khác vẫn hiện; Duyệt khóa |
| G11 | Snapshot > 72h, giá trị trên ngưỡng cao | Banner, evidence thấp, HỎI LẠI cập nhật giá |
| G12 | Bấm Duyệt hai lần | Một bản ghi duyệt |
| G13 | Duyệt v3 khi hiện tại v4 | Từ chối, hiện diff v3→v4 |
| G14 | Cùng input chạy 100 lần | Output byte-identical |
| G15 | 6 món × 8 offer | Cắt tỉa kích hoạt, < 500ms, tổng ≤ greedy |
| G16 | Mọi quote hiển thị | Khớp nguyên văn một `review_id` trong snapshot |
| G17 | Shop rating 5.0 với 3 review | `rating_adj ≈ 4,57`, không được +4 điểm |
| G18 | Offer rẻ hơn 20% trung vị, shop Thường mới | RF_PRICE_TOO_LOW nặng, loại |
| G19 | Sale ≤ wait_window, không có lịch sử giá | MUA kèm dòng gợi ý, không hứa giảm |
| G20 | Hàng tiêu hao sắp hết, có sale gần | Không khuyên chờ |
| G21 | Ngành L0 | Có nhãn "chưa có hướng dẫn riêng"; không MUA trên ngưỡng cao |
| G22 | Thêm một ngành bằng pack giả, không sửa code | Hỏi đáp, chuẩn hóa, lọc chạy đúng |
| G23 | Claim trong lời giải thích không có evidence | Bị bỏ trước khi hiển thị |
| G24 | Câu hỏi người mua đã trả lời trong profile | Không hỏi lại, chỉ xác nhận |

Mỗi pack **PHẢI** có thêm bộ test riêng (ví dụ: nhận đúng identity, loại đúng biến thể sai, áp đúng mặc định). Các test mẫu cho hai ngành minh họa nằm ở Phụ lục.

### 16.3 Release gate đề xuất

- 100% test an toàn hard constraint đạt.
- 100% test ủy quyền duyệt (phiên bản, idempotency) đạt.
- ≥ 90% tổng test đạt.
- Ít nhất 1 hành trình trọn vẹn từ yêu cầu đến mở Shopee ở **mỗi ngành pilot**.
- Ít nhất 1 kịch bản thích nghi được kiểm chứng (đổi điều kiện → winner đổi → approval cũ bị từ chối).
- Kiểm thử thêm ngành bằng pack giả đạt.

---

## 17. Mockup mẫu

Mockup web chat là **sản phẩm mẫu để demo cho team**, không phải phạm vi sản phẩm.

- Dùng hai ngành làm minh họa: **điện thoại** (một món giá trị cao, người mua thiếu kiến thức) và **đồ em bé** (giỏ nhiều món, người mua bận). Shop, giá, đánh giá là dữ liệu giả lập.
- Mockup chỉ chứng minh trải nghiệm và luồng. Dữ liệu và luật của hai ngành mẫu được viết cứng trong trang demo; sản phẩm thật đọc chúng từ Category Pack (mục 5), và các hằng số ngành (cỡ, hạn dùng, bảo hành hãng…) chỉ có mặt trong mockup vì đó là pack mẫu.
- Bảng đối chiếu mockup với PRD:

| Khái niệm chung trong PRD | Cách mockup minh họa |
|---|---|
| Category Pack (mục 5) | Pack điện thoại và pack đồ em bé (Phụ lục A, B) |
| Hỏi làm rõ có "Musk gợi ý" (6) | Câu về màu và loại máy; câu về da bé |
| Bảo đảm / claimed → verified (8.4) | Bảo hành hãng "đã xác minh" vs "shop tự nói" |
| Độ tươi (8.2) | Hạn dùng sữa ≥ 6 tháng |
| Kích cỡ theo hồ sơ (8.2) | Size tã theo cân nặng của bé |
| Voucher cá nhân (9.4) | Chụp Kho Voucher, xác nhận mã, tính lại |
| Rating đã lọc, vấn đề hay gặp (10) | Thẻ đề xuất |
| Hai lựa chọn ngang nhau (11.5) | Chip "cân bằng giá và tốc độ" |
| HỎI LẠI một món chưa chốt (12.1–12.4) | Sữa không hợp độ tuổi, sữa hết hàng |
| Snapshot cũ (14.4) | Chip "giá quan sát 3 ngày trước" |
| Phiên bản, duyệt (15) | Thẻ cũ làm mờ, dòng diff |

Các quyết định thiết kế đã chốt cho mockup nằm ở `musk-ui-decisions.md`.

---

## 18. Lộ trình

| Giai đoạn | Mục tiêu | Kết quả |
|---|---|---|
| **1. Best Deal Agent (MVP)** | Người mua đã biết cần gì, chọn đúng deal và shop. Khung Category Pack + L0 chung + ngành pilot | Best-fit deal và shop, có giải thích và bằng chứng |
| **2. Khám phá và phù hợp** | Người mua biết nhu cầu nhưng chưa chọn sản phẩm | Sản phẩm phù hợp + deal phù hợp |
| **3. Trợ lý mua sắm cá nhân** | Mua lặp lại, theo dõi sản phẩm, mua theo dịp | Đúng sản phẩm, đúng deal, đúng thời điểm (cần lịch sử giá) |
| **4. Nền tảng quyết định thương mại** | Mở năng lực cho hệ sinh thái | Hạ tầng quyết định có thể nhúng và mở rộng |

Mở rộng ngành trong giai đoạn 1: thêm pack theo thứ tự ưu tiên do PO chốt; mỗi pack đi từ L1 lên L2 khi đủ dữ liệu và test.

Hướng phân phối: ứng dụng độc lập (B2C) trước để kiểm chứng chất lượng quyết định; nhúng vào ứng dụng đối tác (B2B2C) sau, cần bảo đảm minh bạch khi lợi ích người mua khác mục tiêu thương mại của đối tác; API (`evaluateOffers`, `matchProducts`, `explainDecision`, `monitorMission`) là năng lực kiến trúc, chưa là sản phẩm độc lập.

---

## 19. Câu hỏi mở

| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| 1 | Đội có truy cập được Shopee Affiliate / Open Platform API không? | Lịch sử giá, tồn kho theo biến thể, độ phủ ngành |
| 2 | **Ngành pilot cho MVP là gì và thứ tự mở rộng pack?** | Phạm vi triển khai; mockup chỉ là mẫu |
| 3 | Mức L0 có nên hiển thị đề xuất cho món giá trị cao không, hay chỉ trả "danh sách có giải thích"? | An toàn của ngành chưa có pack |
| 4 | Thứ tự cộng dồn voucher trên Shopee (min spend tính trước/sau voucher shop; voucher cá nhân chiếm slot nào; số mã tối đa/lần thanh toán) | Giá cuối |
| 5 | Ngưỡng freeship và phí ship (mẫu: miễn phí từ 300k, ngược lại 15k) | Giá cuối, tối ưu giỏ |
| 6 | Mức giảm kỳ vọng theo sự kiện sale cho từng ngành; chấp nhận CHỜ gần như không kích hoạt khi chưa có lịch sử giá? | Chính sách CHỜ |
| 7 | Cách nâng claimed → verified cho từng loại bảo đảm; shop Mall có đủ coi là verified không? | Constraint bảo đảm |
| 8 | Hệ số giá `s` và ngưỡng "quá sát" 0,5; `high_value_threshold` | Chấm điểm, HỎI LẠI |
| 9 | Tốc độ dùng và tồn kho hàng tiêu hao: hỏi một lần khi onboarding hay suy từ lịch sử mua (SAU)? | Urgency, CHỜ |
| 10 | Hạn giao: tính theo `days_max` (thận trọng) hay xác suất giao đúng hạn? | Constraint hạn giao |
| 11 | Chính sách Shopee Mall (cam kết chính hãng, đổi trả): ghi như sự thật hay "theo chính sách sàn, cần kiểm chứng"? | Nội dung UI |
| 12 | Snapshot hợp pháp: tần suất cập nhật, người chịu trách nhiệm provenance, ngưỡng "cũ" 24h/72h có phù hợp ngày sale? | Dữ liệu, độ tin |
| 13 | Món bù min spend: chỉ từ danh sách định kỳ của profile hay cho phép gợi ý món khác (rủi ro upsell)? | Tối ưu giỏ |
| 14 | Chính sách lưu dữ liệu voucher và ảnh (Nghị định 13/2023) | Pháp lý |
| 15 | Ngưỡng tín hiệu seeding cần hiệu chỉnh trên mẫu listing có gắn nhãn thủ công | Chất lượng rating lọc |
| 16 | Ai bảo trì Category Pack (PM ngành, data, vận hành) và quy trình kiểm duyệt pack? | Vận hành, chất lượng |
| 17 | Ngành mà sản phẩm đã ngừng bán chính hãng (đời cũ): Musk có chủ động gợi ý đời mới không? | Hành vi "model" trong pack |
