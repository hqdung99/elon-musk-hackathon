# Musk — Yêu cầu tư vấn người mua (bổ sung sau thử nghiệm prototype)

> Phạm vi: bổ sung 5 khoảng trống mà product owner nêu sau khi thử prototype. Không viết lại spec decision engine (chuẩn hoá, ràng buộc PASS/FAIL/UNKNOWN, tính giá cuối/voucher, trust score, review mining, MUA/CHỜ/HỎI LẠI). Phần này chỉ thêm đầu vào cho engine và quy định cách hiển thị cho người mua.
>
> Quy ước: **PHẢI** = bắt buộc MVP. **NÊN** = MVP nếu kịp. **SAU** = sau MVP. Số liệu chưa kiểm chứng ghi "(giả định, cần kiểm chứng)".

## 1. Hỏi đáp làm rõ nhu cầu (Category Knowledge Pack)

### 1.1 Vấn đề

Với iPhone 16, prototype tìm kiếm luôn. Nó không hỏi màu. Nó cũng không kiểm tra người mua có phân biệt VN/A với xách tay không. Kết quả trông đúng về kỹ thuật nhưng sai với điều người mua thật sự muốn. Một nhân viên bán hàng giỏi sẽ hỏi 2–4 câu trước khi lấy hàng.

### 1.2 Nguyên tắc

- **PHẢI** hỏi trước khi tìm kiếm nếu còn thuộc tính bắt buộc chưa rõ.
- **PHẢI** chỉ hỏi câu mà câu trả lời làm thay đổi kết quả. Nếu mọi ứng viên đều giống nhau ở thuộc tính đó, bỏ qua.
- **PHẢI** hỏi tối đa **3 câu mỗi lượt**. Mỗi câu có lựa chọn sẵn để bấm.
- **PHẢI** có lựa chọn "Chưa biết, Musk gợi ý giúp" ở mọi câu. Khi người mua chọn nó, Musk dùng giá trị mặc định và nói rõ đã giả định gì.
- **PHẢI** đọc profile và lịch sử trước. Đã có câu trả lời thì không hỏi lại, chỉ xác nhận ("Vẫn size L như lần trước nhé?").
- **PHẢI** có tối đa 2 lượt hỏi trước lần đề xuất đầu tiên. Các thuộc tính còn lại dùng mặc định và có thể sửa ngay trên màn đề xuất.
- **NÊN** phát hiện người mới qua câu chữ ("không rành", "mua cho mẹ", không nêu dung lượng/size). Khi đó mỗi lựa chọn có kèm một dòng giải thích.

### 1.3 Cấu trúc knowledge pack (template chung)

Mỗi ngành hàng là một file cấu hình (YAML/JSON), không viết cứng trong code. Thêm ngành mới chỉ cần thêm file, không cần deploy logic.

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| `category_id`, `match` | Từ khoá, ngành Shopee để nhận diện | `phone.iphone`; "iphone", "ip 16" |
| `valid_as_of`, `source_urls` | Ngày kiểm chứng gần nhất và nguồn | 2026-10-25; apple.com/vn |
| `attributes[]` | Danh sách thuộc tính quyết định | model, dung lượng, màu |
| `attributes[].tier` | `mandatory` / `default` / `conditional` | màu = mandatory |
| `attributes[].options[]` | Giá trị và giải thích một dòng | "128GB — đủ nếu chủ yếu chat, mạng xã hội" |
| `attributes[].default_rule` | Cách tự chọn khi người mua không biết | dung lượng theo nhu cầu chụp/quay |
| `attributes[].ask_if` | Điều kiện để hỏi | chỉ hỏi nếu kết quả có >1 giá trị |
| `attributes[].priority` | Thứ tự hỏi | 1 = hỏi trước |
| `attributes[].maps_to` | Ràng buộc gửi sang decision engine | `variant.color == X` |
| `buyer_checks[]` | Mục kiểm tra trước khi mua riêng cho ngành này (xem mục 2) | IMEI, VN/A |
| `unboxing_checklist[]` | Việc cần làm khi nhận hàng | kiểm tra seal, quay video |
| `beginner_explainers[]` | Giải thích thuật ngữ ngắn | "VN/A = máy chính hãng phân phối tại VN" |
| `consumption_model` | Chỉ cho hàng tiêu hao: tốc độ dùng hết | tã/ngày, g sữa/ngày |

Quy tắc chọn câu hỏi:

1. Lấy các thuộc tính `mandatory` chưa có giá trị, theo `priority`.
2. Thêm thuộc tính `conditional` có `ask_if` đúng trên tập ứng viên hiện tại.
3. Cắt còn tối đa 3 câu. Phần còn lại dùng `default_rule` và ghi là "Musk đã giả định".
4. **PHẢI** hết hạn pack sau 90 ngày kể từ `valid_as_of` (giả định, cần kiểm chứng). Pack hết hạn thì Musk vẫn chạy nhưng hiển thị "Thông tin dòng máy có thể đã cũ".

### 1.4 Pack: điện thoại / iPhone

Lưu ý thời điểm: theo trang apple.com/vn (mở ngày 25/10/2026), Apple VN đang liệt kê iPhone Duo, 18 Pro, Air, 17, 17e và 16. iPhone 16 Plus, 16 Pro và 15 không còn trên trang này. Shopee vẫn có thể bán hàng tồn hoặc hàng cũ. Vì vậy pack **PHẢI** gắn mỗi model với trạng thái `đang bán chính hãng` / `chỉ còn hàng tồn/cũ`.

| Thuộc tính | Tier | Lựa chọn (giải thích cho người mới) | Mặc định khi "chưa biết" | Hỏi khi |
|---|---|---|---|---|
| Model | mandatory nếu người mua chưa nêu, nếu đã nêu "iPhone 16" thì conditional | 16 (cân bằng), 16 Plus (màn to, pin lâu), 16 Pro (camera zoom, màn 120Hz), 17 (đời mới hơn, giá có thể gần 16), 17e/16e (rẻ nhất), 15 (rẻ hơn, đời cũ) | Giữ model người mua nêu; gợi ý model khác chỉ khi chênh giá nhỏ và lợi rõ | Người mua nói "iPhone" chung chung, hoặc có model khác rẻ hơn/ngang giá mà tốt hơn |
| Dung lượng | mandatory | 128GB (chat, mạng xã hội, ít quay video), 256GB (chụp nhiều, quay 4K, giữ máy 3–4 năm), 512GB+ (quay video nhiều, không dùng iCloud) | Theo câu "Bạn có hay quay video không?"; nếu không trả lời thì 128GB | Luôn hỏi nếu chưa nêu |
| Màu | mandatory | iPhone 16: Đen, Trắng, Hồng, Xanh mòng két (Teal), Xanh lưu ly (Ultramarine) — nguồn: apple.com/vn | Không có mặc định. Cho chọn "Màu nào cũng được, ưu tiên giá rẻ nhất" | Luôn hỏi. Màu ảnh hưởng giá và tồn kho trên Shopee |
| Nguồn gốc | mandatory | VN/A (chính hãng VN, bảo hành Apple VN), Quốc tế/LL/ZA… (hàng nhập, bảo hành tuỳ shop), Xách tay (rủi ro cao hơn) | VN/A | Luôn hỏi người mới; người có kinh nghiệm thì xác nhận |
| Tình trạng | mandatory | Mới nguyên seal, Like-new/99% (đã dùng, thường đổi pin/vỏ chưa rõ), CPO/Refurbished (hãng tân trang) | Mới nguyên seal | Luôn hỏi; nếu ngân sách thấp hơn giá máy mới thì gợi ý like-new kèm cảnh báo |
| SIM/eSIM | conditional | Bản VN iPhone 16 (A3287): 1 nano-SIM + eSIM, hỗ trợ 2 eSIM — nguồn: apple.com/vn specs | Theo bản VN/A | Chỉ hỏi khi có bản quốc tế chỉ eSIM (ví dụ bản Mỹ) trong ứng viên |
| Bảo hành | default | 12 tháng Apple (VN/A mới), bảo hành shop (hàng nhập/cũ) | Yêu cầu bảo hành Apple | Hỏi nếu người mua chọn hàng không phải VN/A |
| Phụ kiện trong hộp | default (thông tin, không hỏi) | Trong hộp có cáp USB-C 1m, không có củ sạc — nguồn: apple.com/vn specs | Hỏi "Bạn đã có củ sạc USB-C chưa?" | Chỉ hỏi một lần ở bước duyệt, không phải trước khi tìm |
| Thu cũ đổi mới | conditional | Có máy cũ để đổi / Không | Không | Hỏi nếu người mua nhắc "máy cũ" hoặc profile có máy iPhone 13+ |
| Trả góp | conditional | Trả thẳng / Trả góp 0% thẻ tín dụng / Trả góp ví | Trả thẳng | Hỏi nếu người mua nhắc "góp" hoặc giá > ngân sách. Apple VN có trả góp MoMo đến 24 tháng và thẻ tín dụng 0% đến 13 tháng — Shopee có chính sách riêng, cần kiểm chứng |
| AppleCare+ | conditional | Có / Không | Không | Chỉ nhắc ở bước duyệt, một dòng, không hỏi trước |
| Ngân sách | mandatory nếu chưa có trong profile | Nhập số hoặc chọn khoảng | Không mặc định | Hỏi cùng lượt 1 |

Thứ tự hỏi (iPhone 16):

- **Lượt 1 (tối đa 3 câu):** Dung lượng → Màu → Nguồn gốc/Tình trạng (gộp thành 1 câu: "Máy mới chính hãng VN/A, hay chấp nhận máy cũ/nhập để rẻ hơn?").
- **Lượt 2 (chỉ nếu cần):** Ngân sách (nếu thiếu), Trả góp/Thu cũ (nếu có tín hiệu).
- **Kiểm tra hiểu biết:** Nếu người mua là người mới, Musk **PHẢI** nói ngắn 3 điểm trước khi đề xuất: VN/A là gì, hộp không có củ sạc, khác biệt giá giữa mới và like-new. Không giảng quá 3 dòng.

### 1.5 Pack: đồ em bé

#### Tã (Bobby và tương tự)

| Thuộc tính | Tier | Logic |
|---|---|---|
| Cân nặng bé | mandatory (lấy từ profile) | Size chọn theo cân nặng, không theo tuổi |
| Size | derived | Tra bảng theo cân nặng (dưới). Nếu cân nặng nằm trong vùng giao giữa 2 size, chọn size lớn hơn và hỏi xác nhận |
| Dạng tã | mandatory nếu profile chưa có | Tã dán (bé nằm nhiều, sơ sinh) / Tã quần (bé đã lẫy, bò, đi) |
| Dòng sản phẩm | default | Theo "thương hiệu quen dùng" trong profile; không tự đổi dòng (ví dụ Siêu khô thoáng sang Organic) nếu không hỏi |
| Da nhạy cảm / hăm | conditional | Nếu có, ưu tiên dòng ghi "không mùi", "organic"; không chọn dòng mới chưa dùng thử với gói lớn |
| Ngày/đêm | conditional | Hỏi nếu dòng có bản Sleep/đêm riêng |
| Kích thước gói | default | Theo `consumption_model` |

Bảng size tã quần Bobby (nguồn bên thứ ba + báo chí, chưa phải bảng chính thức của hãng — **giả định, cần kiểm chứng trên bao bì/trang Unicharm**):

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
- **PHẢI** cảnh báo khi bé gần mốc trên của size (ví dụ còn ≤1 kg) và gói lớn: "Bé 12,5 kg, size L đến ~13–15 kg. Gói 68 miếng có thể dùng hết trước khi bé lên size. Vẫn mua gói lớn?"
- Tiêu thụ: 5–7 miếng/ngày cho bé 9–15 kg (giả định, cần kiểm chứng). Gói 68 miếng ≈ 10–14 ngày.

#### Sữa (Meiji Growing Up 800g)

| Thuộc tính | Tier | Logic |
|---|---|---|
| Tuổi bé | mandatory (profile) | Growing Up = 12–36 tháng (nguồn: pharmacity.vn). Bé dưới 12 tháng → FAIL, gợi ý hỏi lại |
| Bản nội địa Nhật hay bản bán tại VN | mandatory | Hai bản khác nhau về nhãn, công thức có thể khác (giả định, cần kiểm chứng). Mặc định: bản bán chính thức tại VN có số đăng ký |
| Dị ứng đạm sữa bò / tiêu hoá | conditional | Nếu có, Musk không tự đổi sữa; trả HỎI LẠI và khuyên hỏi bác sĩ |
| Hạn sử dụng tối thiểu | default | ≥6 tháng tại thời điểm giao (giả định, cần kiểm chứng) |
| Số hộp | default | Theo tiêu thụ |

Tiêu thụ: 1 bình = 5 muỗng gạt ≈ 28 g, 2–3 bình/ngày (pharmacity.vn) → 56–84 g/ngày → hộp 800g dùng ~10–14 ngày. Musk **PHẢI** tính lại theo số bình thực tế trong profile nếu có.

#### Khăn ướt

| Thuộc tính | Tier | Logic |
|---|---|---|
| Không mùi / không cồn | default = có | Mặc định cho trẻ em; chỉ hỏi nếu profile ghi khác |
| Thương hiệu quen | default | Theo profile |
| Số gói | default | 1 gói 80–100 tờ ≈ 3–5 ngày (giả định, cần kiểm chứng) |

### 1.6 Hội thoại mẫu

**iPhone 16 — Tệ (prototype hiện tại):**

> Người mua: Mua iPhone 16 128GB.
> Musk: Đây là 3 lựa chọn tốt nhất: 18.490.000đ (shop A), 18.990.000đ (shop B)…

Lỗi: không hỏi màu, không nói rõ VN/A hay hàng nhập, không biết người mua có cần củ sạc.

**iPhone 16 — Tốt:**

> Người mua: Mua iPhone 16 128GB.
> Musk: Musk cần 2 điều để chọn đúng máy:
> 1. **Màu?** Đen · Trắng · Hồng · Xanh mòng két · Xanh lưu ly · Màu nào cũng được, lấy rẻ nhất
> 2. **Loại máy?**
>  - Mới, chính hãng VN/A — bảo hành Apple tại VN *(Musk gợi ý)*
>  - Hàng nhập quốc tế — rẻ hơn, bảo hành do shop
>  - Máy cũ like-new — rẻ nhất, cần kiểm tra kỹ
>  - Chưa biết, Musk gợi ý giúp
>
> Người mua: Xanh lưu ly, cái nào cũng được.
> Musk: Musk chọn máy mới VN/A cho an toàn. Lưu ý: hộp chỉ có cáp, không có củ sạc. Đang tìm…

**Tã — Tệ:**

> Người mua: Tã quần Bobby, sữa Meiji, khăn ướt.
> Musk: Size nào? Sữa loại nào? Khăn hãng nào? Ngân sách? Bé mấy tuổi?

Lỗi: hỏi 5 câu cùng lúc, hỏi lại thông tin đã có trong profile.

**Tã — Tốt:**

> Người mua: Tã quần Bobby, sữa Meiji, khăn ướt.
> Musk: Theo hồ sơ, bé 20 tháng, 12,5 kg. Musk sẽ lấy:
> - Tã quần Bobby **size XL** (12–17 kg). Bé vừa qua mốc size L, nên lên XL để dùng được lâu. [Đổi sang L]
> - Sữa Meiji **Growing Up 800g** (12–36 tháng), 2 hộp ≈ 3–4 tuần.
> - Khăn ướt không mùi, thương hiệu quen.
> Chỉ một câu: **Bé có đang bị hăm không?** Có · Không

## 2. Những gì người mua thật sự kiểm tra trước khi mua

### 2.1 Góc nhìn người mua

- Tôi muốn biết 4,9★ có thật không, hay do shop tặng quà để đổi đánh giá.
- Tôi muốn đọc ngay những đánh giá tệ nhất. Lỗi do sản phẩm, do giao hàng hay do shop?
- Tôi muốn xem ảnh/video thật của người mua, không phải ảnh quảng cáo.
- Tôi muốn biết shop có trả lời khi bị chê không.
- Tôi muốn biết màu/size tôi chọn còn hàng, và bao giờ đến nhà tôi.
- Tôi muốn biết "giảm 40%" có thật hay giá gốc bị đẩy lên.
- Tôi muốn biết shop bán bao lâu rồi, chat có trả lời không, có phải Mall/nhà phân phối chính hãng không.
- Tôi muốn biết có xuất hoá đơn VAT không, bảo hành ở đâu gần tôi.
- Khi nhận hàng, tôi muốn biết cần kiểm tra gì trước khi bấm "Đã nhận hàng".

### 2.2 Chất lượng rating: "rating đã lọc seeding"

Musk **PHẢI** tính và hiển thị hai số: **rating gốc** và **rating đã lọc seeding**, kèm số đánh giá bị loại và lý do.

Tín hiệu seeding (mỗi tín hiệu có trọng số, ngưỡng là giả định, cần kiểm chứng bằng dữ liệu thật):

| Tín hiệu | Cách tính | Ngưỡng nghi ngờ (giả định) |
|---|---|---|
| Đợt 5★ ngắn dồn dập | Số review 5★ ≤10 ký tự trong cửa sổ 48h so với trung bình | >3× trung bình |
| Nội dung trùng | Độ giống văn bản giữa các review (n-gram/embedding) | ≥0,9 với ≥3 review khác |
| Nhắc quà/xu | Từ khoá: "tặng", "quà", "xu", "đánh giá 5 sao được", "hoàn tiền" | Có là đánh dấu |
| Tài khoản reviewer | Tên ẩn, không ảnh đại diện, ít lịch sử (nếu thấy được) | Chỉ dùng khi dữ liệu có sẵn |
| Tỷ lệ đánh giá/đã bán | review_count / sold | >0,6 hoặc <0,02 là bất thường |
| Phân bố sao | Tỷ lệ 5★ cao nhưng 1★ cũng cao, ít 3–4★ (hình chữ J lệch) | 5★ >90% và 2–4★ <3% |
| Đánh giá không nói về sản phẩm | Chỉ khen giao hàng/đóng gói | Hạ trọng số, không loại |

Hiển thị:

- Tóm tắt: "4,9★ (gốc) → 4,5★ sau khi loại 212/1.034 đánh giá nghi seeding".
- Chi tiết: bảng tín hiệu, 2–3 ví dụ review bị loại.
- **PHẢI** dùng chữ "nghi" thay vì khẳng định là giả. Không gọi shop là lừa đảo.

### 2.3 Đánh giá thấp nhất (1–3★)

- **PHẢI** lấy các review 1–3★, ưu tiên mới nhất trong 90 ngày.
- **PHẢI** nhóm theo chủ đề và tách 3 loại nguyên nhân:

| Loại | Ví dụ chủ đề | Ảnh hưởng quyết định |
|---|---|---|
| Sản phẩm | hàng giả, lỗi màn, pin chai, tã bị tràn, sữa vón cục, sai date | Mạnh. Có thể đổi MUA thành CHỜ/HỎI LẠI |
| Giao hàng | chậm, móp hộp | Vừa. Ghi chú, không chặn |
| Dịch vụ shop | không trả lời, từ chối đổi trả, giao sai màu | Mạnh nếu lặp lại |

- Mỗi nhóm hiển thị: số lượng, % trên tổng 1–3★, 1 câu trích ngắn, tối đa 3 ảnh.
- **PHẢI** đánh dấu nhóm "mới xuất hiện" nếu ≥50% số review thuộc nhóm đó nằm trong 30 ngày gần nhất (giả định).

### 2.4 Bảng nguồn dữ liệu và khả năng làm trong MVP

Nguồn: **L** = trường công khai trên trang sản phẩm; **R** = trang đánh giá công khai; **S** = trang shop công khai; **A** = cần API Affiliate/Open Platform (khả năng truy cập chưa rõ, cần kiểm chứng); **U** = người dùng cung cấp; **X** = không có.

| Mục kiểm tra | Nguồn | MVP snapshot? | Hiển thị tóm tắt | Hiển thị chi tiết | Khi thiếu dữ liệu |
|---|---|---|---|---|---|
| Rating gốc, số đánh giá, đã bán | L | Có | "4,9★ · 1,0k đánh giá · 5,2k đã bán" | Phân bố sao | UNKNOWN, không cộng điểm tin cậy |
| Rating đã lọc seeding | R (tính) | Có, trên mẫu tối đa 200 review mới nhất (giả định) | Hai số cạnh nhau | Bảng tín hiệu | Ghi "Chưa đủ dữ liệu lọc (dưới 30 review)" |
| Khiếu nại 1–3★ theo chủ đề | R | Có | "3 vấn đề chính: …" | Nhóm, số lượng, trích dẫn, ảnh | "Chưa có đánh giá thấp" (không coi là tốt tuyệt đối khi review ít) |
| Ảnh/video người mua | R (bộ lọc "Có hình ảnh/video") | Có | Dải 4 ảnh | Thư viện | Ẩn khối |
| Shop trả lời review xấu | R (phản hồi người bán) | Có | "Shop trả lời 8/10 review xấu" | Ví dụ trả lời | Ghi "Không thấy phản hồi" |
| Tỷ lệ đổi trả/khiếu nại | X (Shopee không công khai cho người mua, giả định) | Không | — | Ghi "Shopee không công bố" | Dùng proxy: nhóm "dịch vụ shop" trong 1–3★ |
| Hỏi đáp trên listing | L (nếu ngành có) | Nên | — | 3 câu hỏi liên quan | Ẩn |
| Biến thể/màu còn hàng | L | Có | "Xanh lưu ly: còn hàng" hoặc "Hết" | Tồn kho theo biến thể nếu hiển thị | Ghi "Chưa xác định tồn kho" và HỎI LẠI nếu là màu bắt buộc |
| Thời gian giao tới địa chỉ | L (ước tính theo vị trí) | Có nếu snapshot có địa chỉ; nếu không thì theo tỉnh kho | "Dự kiến 2–3 ngày" | Kho gửi, đơn vị vận chuyển | Ghi "Theo vị trí kho: Hà Nội", không hứa ngày |
| Lịch sử giá thật | A hoặc tự lưu snapshot nhiều ngày | Một phần: chỉ có nếu Musk đã chụp trước đó | "Giá thấp nhất 30 ngày: …" | Biểu đồ | Ghi "Chưa có lịch sử giá. Không đánh giá được mức giảm." Không nhắc % giảm của shop như thật |
| Giảm giá ảo (giá gốc bị đẩy) | Tính từ lịch sử giá | Một phần | Nhãn "Giảm giá không rõ ràng" | So sánh giá gốc với trung vị 30 ngày | Không gắn nhãn |
| Thời gian hoạt động của shop | S ("Tham gia") | Có | "Shop 4 năm" | — | UNKNOWN |
| Tỷ lệ phản hồi chat, thời gian phản hồi | S | Có | "Trả lời 98% trong vài giờ" | — | UNKNOWN |
| Shopee Mall / nhà phân phối chính hãng | L/S (nhãn Mall, "Chính hãng") | Có | Nhãn Mall | Tên nhà phân phối nếu có | Ghi "Không phải Mall" (trung tính) |
| Hoá đơn VAT | L (mô tả) hoặc hỏi shop | Một phần (đọc mô tả) | "Có xuất VAT" nếu mô tả nêu | — | "Chưa rõ — hỏi shop trước khi mua" (nút soạn sẵn tin nhắn, người mua tự gửi) |
| Trung tâm bảo hành gần nhất | Pack ngành + U (địa chỉ) | Nên (danh sách tĩnh) | — | 2 địa điểm gần nhất | Ẩn, ghi "Bảo hành theo shop" |
| Danh sách kiểm tra khi nhận hàng | Pack ngành | Có | — | Hiện ở trạng thái "Sau khi nhận" | Checklist chung |

### 2.5 Mục kiểm tra riêng theo ngành

| Ngành | Mục bắt buộc kiểm tra | Checklist khi nhận hàng |
|---|---|---|
| iPhone | VN/A trong mô tả; bảo hành Apple; nhãn Mall/đại lý uỷ quyền; review nhắc "máy kích hoạt sẵn", "không phải hàng mới" | Quay video mở hộp; kiểm tra seal; so IMEI trên hộp và trong Cài đặt; kiểm tra bảo hành trên trang Apple; chưa bấm "Đã nhận hàng" trước khi kiểm tra |
| Tã | Size theo cân nặng khớp bảng của listing; dòng sản phẩm đúng; review nhắc "hàng giả", "khác bao bì" | Kiểm tra bao bì, ngày sản xuất, mã lô |
| Sữa | Hạn dùng; bản VN/nội địa Nhật; nguồn gốc nhà phân phối; review nhắc "date gần", "móp lon" | Kiểm tra hạn, tem niêm phong, lon không móp |
| Khăn ướt | Không mùi/không cồn đúng mô tả | Kiểm tra seal từng gói |

## 3. Voucher cá nhân ("ví voucher")

### 3.1 Vấn đề

Nút "Thêm voucher từ ảnh ví" làm product owner khó hiểu. Người mua lần đầu cũng sẽ không hiểu: ví nào, tại sao cần ảnh, Musk sẽ làm gì với ảnh.

### 3.2 Giải thích cho người mua

- "Kho Voucher" là nơi Shopee lưu các mã giảm giá mà tài khoản của bạn đã bấm **Lưu**. Trên app: **Tôi → Kho Voucher** (một số phiên bản: Tôi → Tiện ích của tôi → Kho Voucher).
- Có các loại: Voucher Shopee (dùng nhiều shop), Voucher Shop (chỉ một shop), Freeship, hoàn Xu. Mỗi mã có đơn tối thiểu, mức giảm tối đa, hạn dùng, ngành hàng áp dụng.
- Theo blog Shopee, một đơn dùng tối đa 3 mã: 1 Voucher Shop, 1 Voucher Shopee, 1 Freeship Xtra.
- Kho voucher của mỗi người khác nhau. Musk chỉ thấy voucher công khai trên trang sản phẩm/shop, không thấy kho của bạn.

### 3.3 Vì sao Musk không tự xem được

- Shopee không có API cho bên thứ ba đọc kho voucher cá nhân (giả định, cần kiểm chứng với Shopee Open Platform).
- Musk **KHÔNG BAO GIỜ** hỏi mật khẩu, OTP hoặc yêu cầu đăng nhập Shopee thay người mua.

### 3.4 Luồng MVP: chụp màn hình

1. Musk chỉ gợi ý khi giỏ đã chốt, ở màn **Duyệt** (xem 3.6).
2. Người mua mở app Shopee → Tôi → Kho Voucher → chụp 1–3 ảnh màn hình.
3. Người mua tải ảnh lên Musk.
4. Musk đọc ảnh (OCR + phân tích): tên mã, mức giảm, % và mức tối đa, đơn tối thiểu, ngành/shop áp dụng, hạn dùng.
5. Musk hiển thị danh sách mã đọc được để người mua xác nhận hoặc sửa. Mã đọc không chắc ghi "Musk đọc chưa chắc — kiểm tra lại".
6. Decision engine tính lại giá cuối (dùng logic voucher sẵn có), chọn tổ hợp tốt nhất trong giới hạn 3 mã/đơn.
7. Musk hiển thị chênh lệch: "Dùng thêm mã của bạn: tiết kiệm thêm 45.000đ. Nhớ chọn mã *XYZ* khi thanh toán trên Shopee."

Quyền riêng tư:

- **PHẢI** xử lý ảnh xong thì xoá ảnh gốc, chỉ giữ dữ liệu voucher đã trích xuất. Thời gian lưu dữ liệu voucher: đến khi mã hết hạn hoặc 30 ngày (giả định, cần kiểm chứng với chính sách dữ liệu).
- **PHẢI** che hoặc bỏ qua thông tin cá nhân lọt vào ảnh (tên, số điện thoại, số dư ví).
- **PHẢI** có nút "Xoá voucher đã lưu".
- **PHẢI** nói rõ: voucher có thể đã hết lượt dù còn hạn. Giá cuối thật là giá ở màn thanh toán Shopee.

### 3.5 Sau MVP: tiện ích trình duyệt

- **SAU:** Tiện ích chạy trong phiên Shopee mà người mua đã tự đăng nhập. Nó chỉ đọc trang Kho Voucher khi người mua bấm "Đồng bộ". Không lưu cookie, không đăng nhập thay.
- Cần đánh giá điều khoản sử dụng của Shopee trước khi làm.

### 3.6 Thời điểm gợi ý

- **KHÔNG** hiển thị ở màn đầu hoặc khi đang hỏi.
- **PHẢI** hiển thị một lần, ở màn **Duyệt**, ngay dưới dòng tổng tiền.
- Hiển thị lại chỉ khi giỏ thay đổi ≥20% giá trị (giả định).
- Có thể bỏ qua. Bỏ qua thì không nhắc lại trong phiên đó.

### 3.7 Copy giao diện

Thay nút "Thêm voucher từ ảnh ví" bằng:

> **Bạn có mã giảm giá riêng trên Shopee?**
> Musk chỉ thấy mã công khai. Mã bạn đã lưu trong Shopee (Tôi → Kho Voucher) có thể giúp rẻ hơn.
> [Chụp Kho Voucher để Musk tính lại]  [Bỏ qua]
> *Musk không cần mật khẩu Shopee. Ảnh được xoá sau khi đọc.*

Màn hướng dẫn (sau khi bấm):

> 1. Mở app Shopee → **Tôi** → **Kho Voucher**.
> 2. Chụp màn hình danh sách mã (có thể chụp 2–3 ảnh).
> 3. Tải ảnh lên đây.
> [Tải ảnh lên]

## 4. Lời khuyên về thời điểm mua

### 4.1 Vị trí

- **KHÔNG** đặt ghi chú "sale 11.11 còn N ngày" ở đầu màn hình.
- **PHẢI** đặt ở màn **Duyệt**, ngay trên hai nút hành động.
- Chỉ hiển thị khi: có sự kiện lớn trong ≤14 ngày (giả định) **và** hàng không gấp (hàng tiêu hao còn đủ dùng tới ngày sale theo `consumption_model`).
- Hàng tiêu hao sắp hết (ví dụ tã còn <5 ngày): **KHÔNG** khuyên chờ. Có thể gợi ý "Mua đủ dùng tới 11.11, mua gói lớn vào ngày sale".

### 4.2 Hai lựa chọn

| Nút | Hành động |
|---|---|
| **Mua ngay** (chính) | Sang bước thanh toán |
| Nhắc tôi trước 11.11 (phụ) | Lưu giỏ, đặt nhắc 1 ngày trước và sáng ngày sale; khi nhắc thì tính lại giá |

### 4.3 Câu chữ (không hứa quá mức)

> **11.11 còn 17 ngày.** Các năm trước, sản phẩm tương tự thường có thêm mã giảm vào ngày này, nhưng Musk không chắc giá sẽ thấp hơn. Giá hiện tại đã thấp hơn trung vị 30 ngày 6%.

Quy tắc chữ:

- **KHÔNG** dùng "chắc chắn rẻ hơn", "giảm tới X%" nếu không có dữ liệu.
- **PHẢI** nêu dữ liệu đang dùng (lịch sử giá có hay không).
- Không có lịch sử giá: "Musk chưa có dữ liệu giá để so sánh. Nếu không gấp, bạn có thể chờ xem."

## 5. Luồng và trọng tâm màn hình

### 5.1 Nguyên tắc

- **PHẢI** mỗi trạng thái chỉ có **một hành động chính** (nút nổi bật duy nhất). Tối đa 2 hành động phụ dạng nút viền/liên kết.
- **PHẢI** có dòng trạng thái trên cùng: "Bước 2/5 · Đề xuất".
- **PHẢI** hiển thị theo tầng: tóm tắt trước, chi tiết khi bấm "Vì sao?". Tóm tắt không quá 3 dòng cho mỗi sản phẩm.
- **PHẢI** đặt nội dung cảnh báo (FAIL/UNKNOWN quan trọng) ngay trong thẻ sản phẩm, không gom ở cuối trang.

### 5.2 Các trạng thái

| Trạng thái | Mục tiêu người mua | Hiển thị | Hành động chính | Hành động phụ | Ẩn/để sau |
|---|---|---|---|---|---|
| **1. Đang hỏi** | Trả lời nhanh | Tối đa 3 câu, lựa chọn bấm được, "Chưa biết, Musk gợi ý" | **Tiếp tục** | Bỏ qua, dùng mặc định | Kết quả tìm kiếm, giá |
| **2. Đề xuất** | Thấy lựa chọn tốt nhất | 1 sản phẩm/mục được chọn: ảnh, giá cuối, MUA/CHỜ/HỎI LẠI, 1 dòng lý do, rating gốc và đã lọc, các giả định có thể sửa | **Duyệt giỏ này** | So sánh 2 lựa chọn khác · Sửa yêu cầu | Lịch sử giá, review chi tiết, voucher cá nhân, 11.11 |
| **3. So sánh** (tuỳ chọn) | Hiểu vì sao chọn A | Bảng 3 cột × thuộc tính: giá cuối, rating đã lọc, khiếu nại chính, giao hàng, Mall, bảo hành | **Chọn sản phẩm này** (theo cột) | Quay lại đề xuất | Review đầy đủ (mở theo dòng) |
| **4. Duyệt** | Chốt một lần | Danh sách giỏ, tổng giá cuối, voucher đã áp, khối voucher cá nhân (mục 3), khối thời điểm (mục 4), ghi chú phụ kiện (ví dụ củ sạc), AppleCare (1 dòng) | **Mua ngay** | Nhắc tôi trước 11.11 · Thêm voucher của tôi | Chi tiết trust score |
| **5. Thanh toán** | Đặt hàng trên Shopee | Từng sản phẩm có link mở Shopee, mã voucher cần chọn, checklist "kiểm tra trước khi bấm Đặt hàng" (đúng màu/size, giá khớp) | **Mở trên Shopee** (mục đầu chưa đặt) | Đánh dấu đã đặt | Mọi thứ khác |
| **6. Sau khi nhận** | Kiểm tra hàng | Checklist mở hộp theo ngành, nhắc không bấm "Đã nhận hàng" trước khi kiểm tra, lịch mua lại cho hàng tiêu hao | **Đã kiểm tra xong** | Báo vấn đề (hướng dẫn trả hàng) | — |

Ghi chú: Musk không đặt hàng thay người mua trong MVP. Bước thanh toán là mở Shopee để người mua tự đặt.

### 5.3 Tiêu chí chấp nhận

Hỏi đáp:

- [ ] Với "iPhone 16 128GB", Musk hỏi màu và loại máy (mới VN/A/nhập/cũ) trước khi hiển thị sản phẩm.
- [ ] Không lượt nào có quá 3 câu hỏi. Không quá 2 lượt trước đề xuất đầu tiên.
- [ ] Mọi câu hỏi đều có "Chưa biết, Musk gợi ý". Khi chọn, màn đề xuất ghi rõ giả định và cho sửa.
- [ ] Với danh sách đồ em bé và profile đủ, Musk hỏi tối đa 1 câu.
- [ ] Bé 12,5 kg → đề xuất tã quần Bobby XL kèm giải thích và nút đổi size.
- [ ] Bé dưới 12 tháng + Meiji Growing Up → kết quả HỎI LẠI, không MUA.
- [ ] Thêm ngành mới chỉ bằng file cấu hình, không sửa code (kiểm thử với 1 ngành giả).

Kiểm tra trước khi mua:

- [ ] Mỗi sản phẩm đề xuất hiển thị rating gốc và rating đã lọc, hoặc lý do không lọc được.
- [ ] Mỗi sản phẩm có khối "Vấn đề hay gặp" với nhóm chủ đề, số lượng, nhãn loại (sản phẩm/giao hàng/shop).
- [ ] Không có lịch sử giá thì không hiển thị % giảm của shop như một lợi ích.
- [ ] Mọi trường thiếu dữ liệu hiển thị câu fallback trong bảng 2.4, không để trống.

Voucher:

- [ ] Khối voucher cá nhân chỉ xuất hiện ở màn Duyệt.
- [ ] Copy có câu "Musk không cần mật khẩu Shopee".
- [ ] Sau khi tải ảnh, người mua thấy danh sách mã đọc được và xác nhận trước khi tính lại.
- [ ] Ảnh gốc bị xoá sau khi xử lý (kiểm tra qua log lưu trữ).

Thời điểm:

- [ ] Ghi chú sale chỉ xuất hiện ở màn Duyệt, trên nút hành động.
- [ ] Hàng tiêu hao sắp hết không bao giờ nhận lời khuyên chờ.
- [ ] Câu chữ không chứa "chắc chắn", "đảm bảo rẻ hơn".

Luồng:

- [ ] Mỗi trạng thái có đúng một nút chính (kiểm tra bằng snapshot UI).
- [ ] Người dùng thử lần đầu nói đúng "bước tiếp theo là gì" ở mỗi màn trong ≥4/5 phiên thử (giả định cho usability test).

## 6. Nguồn đã mở

- Apple VN — Thông số iPhone 16 (màu, SIM/eSIM A3287, phụ kiện trong hộp): https://www.apple.com/vn/iphone-16/specs/
- Apple VN — Trang iPhone (dòng máy đang bán, màu, thu cũ, trả góp): https://www.apple.com/vn/iphone/
- Shopee Blog — Mẹo săn mã khuyến mãi (Kho Voucher, loại voucher, tối đa 3 mã/đơn): https://shopee.vn/blog/meo-san-ma-khuyen-mai-shopee/
- Mytour — Hướng dẫn chọn size tã Bobby (bảng size, nguồn bên thứ ba): https://mytour.vn/vi/blog/bai-viet/huong-dan-chon-size-ta-bobby-phu-hop-cho-be.html
- Tiền Phong — Bobby mở rộng size tã quần tới 36 kg (3XL–5XL): https://tienphong.vn/bobby-tien-phong-mo-rong-he-size-ta-quan-do-ni-cho-be-lon-toi-36-kg-post1864739.tpo
- Pharmacity — Meiji Growing Up 800g (12–36 tháng, liều pha): https://www.pharmacity.vn/meiji-growing-up-spdd-cho-tre-12-36-thang-hop-800g-.html
- Trang chủ Bobby (danh sách dòng tã quần và size, không có cân nặng): https://www.bobby.com.vn/

## 7. Câu hỏi mở

1. Đội có truy cập được Shopee Affiliate/Open Platform API không? Điều này quyết định lịch sử giá và tồn kho theo biến thể.
2. Snapshot MVP có địa chỉ người mua để ước tính giao hàng không, hay chỉ theo tỉnh?
3. Khi Apple đã ngừng bán iPhone 16 Plus/Pro/15 tại VN, Musk có chủ động gợi ý iPhone 17 khi người mua hỏi iPhone 16 không?
4. Chính sách lưu dữ liệu voucher và ảnh cần được pháp chế duyệt (Nghị định 13/2023 về bảo vệ dữ liệu cá nhân).
5. Ngưỡng tín hiệu seeding cần được hiệu chỉnh trên một mẫu listing có gắn nhãn thủ công.
