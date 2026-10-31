# Musk web chat: quyết định thiết kế đã chốt (26/10/2026)

Các điểm PRD còn mâu thuẫn và cách chốt. UI trong `musk-web-chat-src.html` đã theo các quyết định này.

| # | Mâu thuẫn trong PRD | Quyết định |
|---|---|---|
| 1 | `prd-buyer-advisory` 4.1 nói chỉ hiện ghi chú sale khi sự kiện còn ≤14 ngày. `prd-decision-engine` 6.2 đặt D_max iPhone = 21 ngày, và ví dụ 10.1 hiện khi còn 17 ngày. | Dùng D_max của ngành (iPhone 21 ngày). Còn 17 ngày thì hiện. Ngoài D_max hoặc người mua cần nhận trong 2 ngày thì ẩn. Ghi chú chỉ ở màn Duyệt, ngay trên nút hành động. |
| 2 | `prd-buyer-advisory` 5.2 liệt kê 6 trạng thái, nhưng dòng trạng thái mẫu là "Bước x/5". | 5 bước: Hỏi, Đề xuất, Duyệt, Thanh toán, Sau khi nhận. So sánh là trạng thái tuỳ chọn trong "Bước 2/5 · So sánh". |
| 3 | Thiết kế cũ hỏi "khi nào cần máy". Knowledge pack iPhone chỉ có màu, loại máy, ngân sách, dung lượng. | Không hỏi. Nhu cầu nhận nhanh qua chip "Cần nhận trong 2 ngày" hoặc câu 3 khi sửa yêu cầu. Nó thành ràng buộc cứng và tạo phiên bản mới. |

Đã làm thêm (26/10/2026):
- Hai lựa chọn ngang nhau (decision-engine 5.6): hai thẻ cạnh nhau, mỗi thẻ có câu "Chọn cái này nếu bạn…", chưa có nút Duyệt cho đến khi chọn. Demo: chip "Mình muốn cân bằng giá và tốc độ".
- Snapshot cũ hơn 72 giờ (8.5, 4.6): banner vàng, tag HỎI LẠI, nút chính đổi thành "Cập nhật giá" và nút Duyệt bị chặn vì giá trị trên 5 triệu. Demo: chip "Mô phỏng: giá quan sát 3 ngày trước".
- Giao diện điện thoại: đã kiểm tra ở 390px, không tràn ngang; nút xếp dọc, chip nhanh cuộn ngang, thẻ so sánh xếp dọc.

- Ngành đồ em bé (case 1, giỏ tã + sữa + khăn): chuyển ngành bằng nút "iPhone / Đồ cho bé" trên đầu trang. Hồ sơ bé 14 tháng, 11 kg, ngân sách tháng 1.500.000đ, dữ liệu shop theo ví dụ 10.2 của decision-engine. Giỏ best = 1.262.000đ, tiết kiệm 20.000đ nhờ gom đơn.
  - Hỏi đúng 1 câu ("Bé có đang bị hăm không?") có "Chưa biết, Musk gợi ý giúp".
  - Mỗi món một dòng, nút "So sánh các shop" mở bảng nhỏ; "Không chọn vì" liệt kê shop bị loại và món "chưa chắc".
  - Bé 12,5 kg: tã đổi sang XL kèm giải thích và nút "Đổi sang L". Bé 9 tháng: sữa Growing Up chuyển HỎI LẠI (chọn Infant hoặc bỏ sữa), nút Duyệt bị khoá. 3 bịch tã: vượt ngân sách tháng, HỎI LẠI "Bớt 1 bịch tã?".
  - Duyệt: voucher cá nhân (mẫu SANBE30 −30k), ghi chú thời điểm không khuyên chờ vì không biết tồn kho. Thanh toán tách thành các đơn theo shop, đánh dấu từng đơn. Sau khi nhận: checklist tã, sữa, khăn và lịch mua lại.

- Snapshot cũ hơn 72 giờ cho giỏ đồ em bé (8.5, T17): banner vàng kèm nút "Cập nhật giá" ngay trong thẻ giỏ. Giỏ dưới 5 triệu nên vẫn duyệt được (khác iPhone, nơi giá trị trên 5 triệu thì chặn duyệt). Độ chắc chắn bằng chứng ghi "thấp", và bước Thanh toán nhắc kiểm tra giá cuối trên Shopee (9.3). Demo: chip "Mô phỏng: giá quan sát 3 ngày trước".
- T11, Sữa Ngon hết hàng: sữa chuyển HỎI LẠI ("Shop Mẹ Mây không ghi hạn sữa. Bạn muốn đợi hay mua và kiểm tra khi nhận?"), các món khác vẫn hiện, nút Duyệt bị khoá. "Mua của Mẹ Mây và tự kiểm tra khi nhận" đưa sữa 549.000đ vào giỏ, checklist thanh toán nhắc kiểm tra hạn. "Đợi, bỏ sữa khỏi giỏ" bỏ sữa và hẹn nhắc khi Sữa Ngon có hàng, chip "Thêm lại sữa" đưa sữa về. Demo: chip "Mô phỏng: Sữa Ngon hết hàng".
  - Lệch số so với PRD: khi mua sữa Mẹ Mây, solver chọn tã Mẹ Mây + khăn Nhà Cún Con = 1.291.000đ, rẻ hơn 1.296.000đ trong ví dụ 10.2 (ví dụ đó cố định cả giỏ ở Mẹ Mây).
