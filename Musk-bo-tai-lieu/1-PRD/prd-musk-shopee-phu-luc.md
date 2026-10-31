# Musk — PRD: Phụ lục (ngành minh họa)

Phụ lục của `prd-musk-shopee.md`. Nội dung ở đây là **ví dụ cho hai ngành dùng trong mockup** (điện thoại, đồ em bé). Đây không phải phạm vi sản phẩm. Hai pack dưới đây minh họa cách điền Category Pack (mục 5 của PRD) và là pack mẫu để kiểm thử.

Mọi con số có nhãn **(giả định, cần kiểm chứng)** chưa được xác nhận. Dữ liệu shop, giá, đánh giá là dữ liệu mẫu.

---

## A. Pack mẫu: điện thoại (iPhone 16)

### A.1 Hồ sơ pack

| Trường | Giá trị |
|---|---|
| `category_id`, `match` | `phone.iphone`; "iphone", "ip 16" |
| `readiness` | L2 (có luật xác minh bảo hành) |
| `valid_as_of`, `source_urls` | 2026-10-25; apple.com/vn (trang iPhone và thông số iPhone 16) |
| `identity_keys` | thương hiệu, model (gồm hậu tố Plus/Pro/Pro Max/e), dung lượng |
| `variant_attrs` | màu, tình trạng, mã vùng, bảo hành, trạng thái kích hoạt |
| `unit` | đ/máy |
| `price_slope` (s) | 2,5 (giả định) |
| `high_value_threshold` | 5.000.000đ (giả định) |
| `sale_expectation` | ngày đôi 2–3% (shop Mall) (giả định); `min_abs_saving` 300.000đ; `wait_window_days` 21 |
| `consumption_model` | không (không phải hàng tiêu hao) |

Lưu ý thời điểm (apple.com/vn, mở 25/10/2026): Apple VN đang liệt kê iPhone Duo, 18 Pro, Air, 17, 17e và 16. iPhone 16 Plus, 16 Pro và 15 không còn trên trang này, nhưng Shopee vẫn có thể bán hàng tồn hoặc hàng cũ. Pack **PHẢI** gắn mỗi model với trạng thái `đang bán chính hãng` / `chỉ còn hàng tồn/cũ`.

### A.2 Thuộc tính

| Thuộc tính | Tier | Lựa chọn (giải thích cho người mới) | Mặc định khi "chưa biết" | Hỏi khi |
|---|---|---|---|---|
| Model | mandatory nếu chưa nêu; conditional nếu đã nêu | 16 (cân bằng), 16 Plus (màn to, pin lâu), 16 Pro (camera zoom, màn 120Hz), 17 (đời mới), 17e/16e (rẻ nhất), 15 (rẻ hơn, đời cũ) | Giữ model đã nêu; gợi ý model khác chỉ khi chênh giá nhỏ và lợi rõ | Người mua nói "iPhone" chung chung, hoặc có model khác rẻ hơn/ngang giá mà tốt hơn |
| Dung lượng | mandatory | 128GB (chat, mạng xã hội, ít quay video), 256GB (chụp nhiều, quay 4K, giữ máy 3–4 năm), 512GB+ (quay nhiều, không dùng iCloud) | 128GB, hoặc theo câu "Bạn có hay quay video không?" | Luôn hỏi nếu chưa nêu |
| Màu | mandatory | iPhone 16: Đen, Trắng, Hồng, Xanh mòng két, Xanh lưu ly | Không có. Cho chọn "Màu nào cũng được, ưu tiên giá rẻ nhất" | Luôn hỏi. Màu ảnh hưởng giá và tồn kho |
| Nguồn gốc | mandatory | VN/A (chính hãng VN, bảo hành Apple VN), quốc tế/LL/ZA… (hàng nhập, bảo hành tùy shop), xách tay (rủi ro cao hơn) | VN/A | Luôn hỏi người mới; người có kinh nghiệm thì xác nhận |
| Tình trạng | mandatory | Mới nguyên seal, like-new/99% (đã dùng), CPO/refurbished (hãng tân trang) | Mới nguyên seal | Luôn hỏi; ngân sách thấp hơn giá máy mới thì gợi ý like-new kèm cảnh báo |
| SIM/eSIM | conditional | Bản VN iPhone 16 (A3287): 1 nano-SIM + eSIM | Theo bản VN/A | Chỉ khi có bản quốc tế chỉ eSIM trong ứng viên |
| Bảo hành | default | 12 tháng Apple (VN/A mới), bảo hành shop (nhập/cũ) | Yêu cầu bảo hành Apple | Hỏi nếu chọn hàng không phải VN/A |
| Phụ kiện trong hộp | default (thông tin) | Hộp có cáp USB-C 1m, không có củ sạc | Hỏi "Bạn đã có củ sạc USB-C chưa?" | Một lần ở bước Duyệt |
| Thu cũ đổi mới | conditional | Có máy cũ để đổi / Không | Không | Khi người mua nhắc "máy cũ" hoặc profile có iPhone 13+ |
| Trả góp | conditional | Trả thẳng / thẻ tín dụng 0% / ví | Trả thẳng | Khi người mua nhắc "góp" hoặc giá > ngân sách |
| AppleCare+ | conditional | Có / Không | Không | Chỉ nhắc một dòng ở bước Duyệt |
| Ngân sách | mandatory nếu chưa có | Nhập số hoặc khoảng | Không | Cùng lượt 1 |

Thứ tự hỏi: **Lượt 1** (tối đa 3 câu): Dung lượng → Màu → Nguồn gốc/Tình trạng (gộp 1 câu: "Máy mới chính hãng VN/A, hay chấp nhận máy cũ/nhập để rẻ hơn?"). **Lượt 2** (chỉ nếu cần): Ngân sách, Trả góp/Thu cũ. Người mới: nói ngắn 3 điểm (VN/A là gì; hộp không có củ sạc; chênh giá giữa mới và like-new).

### A.3 Parser và đơn vị

| Thuộc tính | Mẫu nhận diện (không phân biệt hoa thường, bỏ dấu) | Ghi chú |
|---|---|---|
| Model | `iphone\s*(\d{2})\s*(pro max\|pro\|plus\|e)?` | "16 Plus" ≠ "16"; không có hậu tố = bản thường |
| Storage | `(64\|128\|256\|512)\s*gb?`, `1\s*tb` | Nhiều biến thể trong listing → lấy biến thể ứng với giá đang xét |
| Tình trạng | `new\|moi\|nguyen seal\|fullbox` → mới; `like ?new\|99%\|cu\|2nd` → đã dùng; `cpo\|renew\|refurb` → tân trang; `active\|kich hoat\|tbh` → mới đã kích hoạt | "Nguyên seal" là shop tự nói |
| Mã vùng | `vn/a` → VN/A; `ll/a\|za/a\|j/a\|ch/a\|kh/a\|x/a` → quốc tế; `xach tay` → nhập | VN/A + "chính hãng" vẫn là claimed cho tới khi có bằng chứng |

### A.4 Luật bảo đảm (assurance)

- Bảo hành Apple **verified** khi: shop Mall ủy quyền có thương hiệu khớp, **hoặc** ≥ 2 review có ảnh trong 60 ngày xác nhận ảnh hộp có VN/A.
- `claimed_by_shop` cho bảo hành Apple → UNKNOWN khi người mua bắt buộc bảo hành Apple.
- Sub-score bảo đảm: Apple verified 10; Apple claimed 6; shop `min(5, tháng/2)`; unknown 0.
- Hạn giao hàng và các luật chung dùng bảng 8.2 của PRD.

### A.5 Review và red flag

Aspect: chính hãng/VN/A, đã kích hoạt, bảo hành, ngoại hình, pin, đóng gói, giao hàng, tư vấn shop, hóa đơn.

| Mã | Điều kiện | Mức | Hệ quả |
|---|---|---|---|
| RF_ACTIVATED | ≥ 3 review (hoặc ≥ 5% review 60 ngày) nói máy đã kích hoạt khi bán "mới seal" | nặng nếu người mua cần máy mới; vừa nếu không | loại / trừ điểm |
| RF_NO_WARRANTY_INFO | Listing không ghi bảo hành | vừa | UNKNOWN |

### A.6 Kiểm tra trước khi mua và khi nhận

- Trước khi mua: VN/A trong mô tả; bảo hành Apple; nhãn Mall/đại lý ủy quyền; review nhắc "máy kích hoạt sẵn", "không phải hàng mới"; VAT; kho gửi.
- Khi nhận (`unboxing_checklist`): quay video mở hộp; kiểm tra seal; so IMEI trên hộp với trong Cài đặt (hoặc `*#06#`); kiểm tra bảo hành trên trang Apple; **chưa** bấm "Đã nhận hàng" trước khi kiểm tra.

---

## B. Pack mẫu: đồ em bé (tã, sữa, khăn ướt)

### B.1 Hồ sơ pack

Nhóm gồm ba pack con (tã, sữa công thức, khăn ướt) dùng chung profile bé. Chế độ nhu cầu: **giỏ nhiều món, người mua bận**.

| Trường | Giá trị |
|---|---|
| `readiness` | L2 (có luật hạn dùng và kích cỡ theo cân nặng) |
| `price_slope` (s) | 1,0 (hàng tiêu dùng, giả định) |
| `sale_expectation` | tã 5–10% (min 30.000đ, D_max 14); sữa 3–8% (min 30.000đ, D_max 14); khăn 5–15% (min 20.000đ, D_max 14) (giả định) |
| Profile cần | tuổi (tháng), cân nặng, thương hiệu quen, quy tắc riêng, ngân sách tháng, tồn kho (tùy chọn) |
| Quy tắc profile mẫu | Sữa chỉ mua shop Mall; không mua shop dưới 6 tháng; sữa còn hạn ≥ 6 tháng |

### B.2 Khóa định danh và đơn vị

| Ngành | Khóa định danh | Biến thể | Đơn vị giá |
|---|---|---|---|
| Tã | thương hiệu, dòng (quần/dán), size | số miếng/gói, dòng phụ | đ/miếng |
| Sữa công thức | thương hiệu, dòng, giai đoạn tuổi, khối lượng tịnh | nguồn gốc (chính hãng NPP / xách tay), hạn dùng, lô | đ/100g |
| Khăn ướt | thương hiệu (nếu chỉ định), mùi (không mùi/có mùi), số tờ | số gói, độ dày | đ/tờ |

### B.3 Tã

| Thuộc tính | Tier | Logic |
|---|---|---|
| Cân nặng bé | mandatory (profile) | Size chọn theo cân nặng, không theo tuổi |
| Size | derived | Tra bảng theo cân nặng. Cân nặng nằm ở vùng giao giữa 2 size → chọn size lớn hơn và hỏi xác nhận (nút "Đổi sang size kia") |
| Dạng tã | mandatory nếu profile chưa có | Tã dán (bé nằm nhiều) / tã quần (bé đã lẫy, bò, đi) |
| Dòng sản phẩm | default | Theo thương hiệu quen trong profile; không tự đổi dòng nếu không hỏi |
| Da nhạy cảm / hăm | conditional | Nếu có, ưu tiên dòng "không mùi", "organic"; không chọn dòng mới chưa dùng thử với gói lớn |
| Ngày/đêm | conditional | Hỏi nếu dòng có bản Sleep riêng |
| Kích thước gói | default | Theo `consumption_model` |

Bảng size tã quần Bobby (nguồn bên thứ ba, chưa phải bảng chính thức của hãng — **giả định, cần kiểm chứng trên bao bì/trang Unicharm**):

| Size | Cân nặng (kg) | Nguồn |
|---|---|---|
| S | 4–7 | mytour.vn |
| M | 7–10 | mytour.vn |
| L | 8–15 (nguồn khác ghi 9–13) | mytour.vn |
| XL | 12–17 | mytour.vn |
| XXL | từ 16 | mytour.vn |
| 3XL | 19–26 | tienphong.vn |
| 4XL | 24–31 | tienphong.vn |
| 5XL | 29–36 | tienphong.vn |

Quy tắc:
- **PHẢI** đọc bảng size trong ảnh/mô tả của chính listing nếu có, ưu tiên hơn bảng trong pack.
- **PHẢI** cảnh báo khi bé gần mốc trên của size (còn ≤ 1 kg) và gói lớn: "Bé 12,5 kg, size L đến ~13–15 kg. Gói 68 miếng có thể dùng hết trước khi bé lên size. Vẫn mua gói lớn?"
- Tiêu thụ: 5–7 miếng/ngày cho bé 9–15 kg (giả định). Gói 68 miếng ≈ 10–14 ngày.

### B.4 Sữa công thức (ví dụ Meiji Growing Up 800g)

| Thuộc tính | Tier | Logic |
|---|---|---|
| Tuổi bé | mandatory (profile) | Growing Up = 12–36 tháng (pharmacity.vn). Bé dưới 12 tháng → FAIL, **HỎI LẠI**, không MUA; Musk không tự đổi sữa |
| Nguồn gốc | mandatory | Bản nội địa Nhật và bản bán tại VN có thể khác nhãn, công thức (giả định). Mặc định: bản bán chính thức tại VN có số đăng ký |
| Dị ứng đạm sữa bò / tiêu hóa | conditional | Nếu có, Musk không tự đổi sữa; HỎI LẠI và khuyên hỏi bác sĩ |
| Hạn sử dụng tối thiểu | default | ≥ 6 tháng tại thời điểm giao (giả định) |
| Số hộp | default | Theo tiêu thụ |

Tiêu thụ: 1 bình = 5 muỗng gạt ≈ 28 g, 2–3 bình/ngày → 56–84 g/ngày → hộp 800g dùng ~10–14 ngày. **PHẢI** tính lại theo số bình thực tế trong profile nếu có.

Hạn dùng: `months_left ≥ 6` (verified hoặc claimed có ảnh) → PASS; `< 6` → FAIL; không ghi → UNKNOWN.

### B.5 Khăn ướt

| Thuộc tính | Tier | Logic |
|---|---|---|
| Không mùi / không cồn | default = có | Mặc định cho trẻ em; chỉ hỏi nếu profile ghi khác |
| Thương hiệu quen | default | Theo profile |
| Số gói | default | 1 gói 80–100 tờ ≈ 3–5 ngày (giả định) |

### B.6 Aspect review, red flag, checklist

| Ngành | Aspect review | Red flag riêng | Checklist khi nhận |
|---|---|---|---|
| Tã | seal, date, size chuẩn, thấm hút, hăm, đóng gói | RF_NEAR_EXPIRY: ≥ 2 review "cận date" trong 60 ngày | Kiểm tra bao bì, ngày sản xuất, mã lô |
| Sữa | tem NPP, hạn dùng, hộp móp, giao hàng | RF_NEAR_EXPIRY | Kiểm tra hạn, tem niêm phong, lon không móp |
| Khăn | độ dày, mùi, độ ẩm/khô, kích ứng | RF_QUALITY_REPEAT (khăn khô, có mùi) | Kiểm tra seal từng gói |

### B.7 Hội thoại mẫu

**Không đạt:** "Size nào? Sữa loại nào? Khăn hãng nào? Ngân sách? Bé mấy tuổi?" (5 câu, hỏi lại điều đã có trong profile).
**Đạt:** "Theo hồ sơ, bé 20 tháng, 12,5 kg. Musk sẽ lấy: tã quần Bobby **size XL** (12–17 kg), bé vừa qua mốc size L nên lên XL để dùng lâu [Đổi sang L]; sữa Meiji Growing Up 800g (12–36 tháng), 2 hộp ≈ 3–4 tuần; khăn ướt không mùi. Chỉ một câu: **Bé có đang bị hăm không?** Có · Không · Chưa biết, Musk gợi ý giúp."

---

## C. Ví dụ tính toán

### C.1 Một món giá trị cao (điện thoại iPhone 16 128GB mới, ngân sách ~19 triệu, bắt buộc bảo hành Apple)

Voucher Mall công khai: giảm 200.000đ cho đơn từ 15 triệu (dữ liệu mẫu). Không có voucher cá nhân.

**Chuẩn hóa:** máy "Like New 99%" bị loại (đã dùng, người mua cần mới); "iPhone 16 Plus" bị loại (sai model). Còn 5 offer.

| Shop | Giá niêm yết | Voucher shop | Voucher Mall | Giá cuối | Bảo hành | Kết quả |
|---|---|---|---|---|---|---|
| A Phố Táo 247 (Thường) | 17.490.000 | −200.000 (≥15tr) | — | 17.290.000 | Shop 6 tháng | FAIL: chỉ bảo hành shop; có RF_ACTIVATED (9 review) |
| B Bến Nghé Mobile (Mall) | 18.690.000 | −300.000 (≥18tr) | −200.000 | 18.190.000 | Apple 12 tháng, verified | PASS |
| C Sông Hàn Digital (Mall) | 18.190.000 | −150.000 (≥15tr) | −200.000 | 17.840.000 | Apple 12 tháng, verified | PASS |
| F Siêu Sale Phone 99 (Thường) | 17.290.000 | — | — | 17.290.000 | Không ghi | UNKNOWN + RF_NEW_SHOP_SPIKE (3 tháng) → loại |
| G Hải Âu iStore (Yêu thích) | 18.390.000 | −100.000 (≥18tr) | — | 18.290.000 | Apple 12, shop tự nói | UNKNOWN |

G không đáng hỏi (8.5): đắt hơn C 450.000đ, không thể thắng C dù coi là PASS → chỉ liệt kê "Chưa chắc".

**Chấm điểm** (B, C; trọng số mặc định 40/30/20/10; giá v2, s = 2,5):

| | B | C |
|---|---|---|
| Giá v2 (Δ% = 1,96%) | 5,10 | 10,00 |
| Uy tín (trust_v1) | 9,47 | 9,35 |
| Bảo đảm | 10 | 10 |
| Tốc độ (days_max 2 vs 4) | 8 | 4 |
| **U** | **7,68** | **9,20** |

C thắng (khoảng cách 1,52 > 0,5, không phải "ngang nhau"). Độ nhạy: preset Ưu tiên giao nhanh (25/25/15/35) → B = 7,94, C = 7,74, **B thắng** → lưu `flip_condition` và sinh câu "Nếu bạn cần nhận sớm, Bến Nghé Mobile giao 1–2 ngày, đắt hơn 350k."

**Thời điểm:** hôm nay 25/10/2026, 11.11 còn 17 ngày (≤ wait_window 21). Kỳ vọng 2,5% × 17,84 tr ≈ 446.000đ ≥ 300.000đ, nhưng chưa có lịch sử giá → confidence thấp → **MUA**, kèm dòng gợi ý thời điểm không hứa giảm.

**Kết quả:** MUA "Musk chọn Sông Hàn Digital (Mall): 17.840.000đ, đã gồm voucher shop và voucher Mall." Đánh đổi: giao 3–4 ngày. Bảng so sánh: C | B | cột mờ A ("Rẻ hơn 550k nhưng chỉ bảo hành shop 6 tháng; 9 người mua nói máy đã kích hoạt").

Biến thể:
- **Cần nhận trong 2 ngày** (hard `days_max ≤ 2`): C (3–4) và G (2–3) FAIL; B là PASS duy nhất → MUA B 18.190.000đ (+350k). Diff: "Đổi từ Sông Hàn Digital sang Bến Nghé Mobile vì bạn cần nhận trong 2 ngày." Approval cũ vô hiệu.
- **Voucher cá nhân 8%, tối đa 300k, đơn từ 10 triệu, shop Mall:** B 17.890.000đ; C 17.540.000đ. Winner không đổi, phiên bản +1.

### C.2 Giỏ nhiều món (đồ em bé)

Profile: bé 14 tháng, 11 kg → tã quần Bobby size L; sữa Meiji Growing Up 800g; ngân sách tháng 1.500.000đ. Yêu cầu: "tã 2 bịch, sữa Meiji 1 hộp, khăn ướt". Ship: miễn phí đơn ≥ 300k, ngược lại 15k (giả định).

Shop: K Mẹ Mây Official (Mall, voucher 60k đơn từ 800k); L Nhà Cún Con (Yêu thích, không voucher); P Kho Sỉ Bé Bi (Thường, 2 tháng); Q Sữa Ngon Chính Hãng (Mall, voucher 20k đơn từ 500k).

| Món | Offer | Giá | Đơn giá | Kết quả |
|---|---|---|---|---|
| Tã | K Bobby quần L68 | 359.000 | 5.279đ/miếng | PASS |
| | L Bobby quần L68 | 349.000 | 5.132đ/miếng | PASS |
| | P Bobby quần L68 giá kho | 289.000 | 4.250đ/miếng | FAIL: shop 2 tháng; review nhắc cận date |
| | L Bobby **tã dán** L68 | 329.000 | — | Loại chuẩn hóa: tã dán |
| | K Bobby quần **XL62** | 359.000 | 5.790đ/miếng | Loại chuẩn hóa: size XL |
| Sữa | Q Meiji GU 800g, hạn 06/2027 | 535.000 | 66.875đ/100g | PASS (còn 8 tháng) |
| | K Meiji GU 800g, không ghi hạn | 549.000 | 68.625đ/100g | UNKNOWN: "Chưa chắc" |
| | L Meiji GU 800g, hạn 12/2026 | 499.000 | | FAIL: không Mall; hạn còn 2 tháng |
| | P Meiji GU xách tay | 459.000 | | FAIL: shop 2 tháng, không Mall, xách tay |
| | Q Meiji Infant | 569.000 | | Loại chuẩn hóa: 0–1 tuổi |
| Khăn | K không mùi 100 tờ | 89.000 | 890đ/tờ | PASS |
| | L không mùi 100 tờ | 69.000 | 690đ/tờ | PASS |
| | P không mùi 100 tờ | 59.000 | | FAIL: shop 2 tháng; RF_QUALITY_REPEAT (14 review khăn khô, có mùi) |

K sữa (UNKNOWN) có đáng hỏi không? Với K sữa: tổ hợp tốt nhất 1.356k − 60k = 1.296.000đ, đắt hơn phương án dùng Q (1.262.000đ) → không hỏi, ghi "Chưa chắc: Mẹ Mây Official không ghi hạn sữa".

**Tối ưu giỏ (2 × 1 × 2 = 4 tổ hợp):**

| Tổ hợp | Đơn K | Đơn L | Đơn Q | Tổng |
|---|---|---|---|---|
| Tã L, khăn L (greedy) | — | 2×349 + 69 = 767k, ship 0 | 535 − 20 = 515k | **1.282.000** |
| **Tã K, khăn K** | 2×359 + 89 = 807k ≥ 800k → −60k = **747k** | — | 515k | **1.262.000** |
| Tã K, khăn L | 718k (< 800k, không voucher) | 69 + 15 ship = 84k | 515k | 1.317.000 |
| Tã L, khăn K | 89 + 15 = 104k | 698k | 515k | 1.317.000 |

Best = tã K + khăn K + sữa Q: **1.262.000đ**, tiết kiệm **20.000đ** so với greedy (đổi sang K tốn thêm 40k, đổi lại voucher 60k). Trong ngân sách 1.500.000đ → **MUA**.

Hiển thị (mỗi món một dòng): "Tã quần Bobby L68 × 2 — Mẹ Mây Official — 718.000đ — Đắt hơn Nhà Cún Con 10k/bịch nhưng gom cùng đơn để dùng voucher 60k." / "Sữa Meiji Growing Up 800g × 1 — Sữa Ngon Chính Hãng — 535.000đ — Shop Mall, hạn 06/2027." / "Khăn ướt không mùi 100 tờ × 1 — Mẹ Mây Official — 89.000đ — Gom cùng đơn tã." / "Tổng 1.262.000đ, đã gồm voucher và phí ship. Tiết kiệm 20.000đ nhờ gom đơn."

**Lưu ý (kết quả mockup so với ví dụ):** khi mockup mở rộng thành nhiều tổ hợp (ví dụ 3 bịch tã, hoặc mua sữa của shop K) solver duyệt hết tổ hợp nên có thể ra tổng thấp hơn các con số cố định trong ví dụ gốc (ví dụ 3 bịch tã: 1.616.000đ thay vì 1.621.000đ; sữa mua của K: 1.291.000đ thay vì 1.296.000đ). Solver đúng, ví dụ gốc đã giới hạn tổ hợp. Cần đội engine xác nhận.

---

## D. Test mẫu theo pack

### D.1 Pack điện thoại

| # | Input | Kỳ vọng |
|---|---|---|
| P1 | Case C.1 mặc định, bắt buộc bảo hành Apple, ngân sách 19tr | MUA C 17.840.000; A ở "bị loại"; G "chưa chắc", không hỏi |
| P2 | P1 + "cần nhận trong 2 ngày" | MUA B 18.190.000; diff C→B; approval v trước bị từ chối |
| P3 | P1 + "bảo hành shop cũng được" | A vẫn bị loại nếu người mua cần "mới" và RF_ACTIVATED nặng; nếu RF chỉ vừa → A vào bảng với trust trừ điểm |
| P4 | P1 + ngân sách tối đa 17,5tr | Không PASS (B, C vượt); HỎI LẠI nới ngân sách: "+5% (18,375 tr) → Sông Hàn 17,84 tr" |
| P5 | P1 + chỉ có G là Apple | HỎI LẠI xác nhận rủi ro về G; không hiện nút Duyệt |
| P6 | P1 + preset Ưu tiên giao nhanh (giá v2) | B thắng (7,94 vs 7,74); chênh < 0,5 → HỎI LẠI "chọn 1 trong 2" |
| P7 | P1 + voucher cá nhân 8%/300k/10tr/Mall | C 17.540.000, winner không đổi, version +1 |
| P8 | Voucher ảnh thiếu min spend | Không trừ; hỏi "voucher này áp cho đơn từ bao nhiêu?" |
| P9 | Snapshot 80h | Banner cũ; evidence_confidence thấp; giá trị > 5tr → HỎI LẠI xác nhận cập nhật |
| P10 | Offer rẻ hơn 20% median, shop Thường 4 tháng | RF_PRICE_TOO_LOW nặng + rule tuổi shop → loại |

### D.2 Pack đồ em bé

| # | Input | Kỳ vọng |
|---|---|---|
| B1 | Giỏ mẫu C.2 | MUA giỏ K(tã×2, khăn) + Q(sữa) 1.262.000; saving 20.000 |
| B2 | B1 + tã 3 bịch | Vượt ngân sách tháng → HỎI LẠI bớt món |
| B3 | B1 + Q hết hàng | Sữa không có PASS, có K UNKNOWN → HỎI LẠI: "Shop Mẹ Mây không ghi hạn sữa. Bạn muốn đợi hay mua và kiểm tra khi nhận?"; các món khác vẫn hiện |
| B4 | Offer sữa hạn 03/2027 (5 tháng) | FAIL hạn < 6 tháng |
| B5 | Tiêu đề "Bobby L68" nhưng biến thể ghi XL | RF_TITLE_CONFLICT; identity theo biến thể → loại chuẩn hóa |
| B6 | Hai tổ hợp giỏ cùng tổng | Chọn tổ hợp ít shop hơn, rồi trust cao hơn |
| B7 | Bé 12,5 kg | Tã quần XL kèm giải thích và nút đổi size |
| B8 | Bé dưới 12 tháng + Meiji Growing Up | HỎI LẠI, không MUA |
| B9 | Profile đủ | Hỏi tối đa 1 câu |

---

## E. Mockup: những điểm đặc thù ngành cần hiểu là mẫu

| Điểm trong mockup | Là mẫu vì | Cái chung phía sau |
|---|---|---|
| Hỏi màu và loại máy VN/A | Thuộc tính của pack điện thoại | Câu hỏi sinh từ `attributes` của pack |
| "Bảo hành Apple 12 tháng, đã xác minh" | Luật bảo đảm riêng ngành | `assurance_rules` + claimed → verified |
| Ghi chú củ sạc, AppleCare+ | Khối "lưu ý của ngành" ở màn Duyệt | `buyer_checks` của pack |
| Checklist IMEI, VN/A | Checklist khi nhận của ngành | `unboxing_checklist` |
| Câu hỏi "bé có đang bị hăm không?" | Thuộc tính `conditional` của pack tã | `ask_if` trong pack |
| Size theo cân nặng, hạn sữa ≥ 6 tháng | Luật theo profile | Constraint "kích cỡ/độ tuổi theo hồ sơ", "độ tươi" |
| Sale 11.11 còn 17 ngày | Lịch sự kiện mẫu | `wait_window_days` + lịch sale |
| Voucher mẫu SHOPEE8, SANBE30 | Dữ liệu mẫu | Luồng voucher cá nhân (9.4) |
| Chọn ngành bằng nút "iPhone / Đồ cho bé" | Chỉ để demo hai pack | Production: nhận diện ngành từ yêu cầu qua `match` |
