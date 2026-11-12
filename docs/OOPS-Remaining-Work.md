# OOPS — Báo cáo công việc còn lại

Đối chiếu theo [đặc tả MVP](OOPS-Spec.md), [hợp đồng API](API%20doc.md) và [kế hoạch 7 ngày](OOPS-7-Day-Development-Plan.md). Phạm vi báo cáo là bản bàn giao trên `feat/integrate-seven-agents`, gồm bản tích hợp `b095b19` và luồng tham gia nhóm bằng liên kết bổ sung sau đó.

Luồng đăng nhập demo → tạo/tham gia nhóm → lập và xác nhận giỏ tay → đăng nhu cầu lên Feed đã có UI và API. Phần còn lại để demo giao dịch là nối Feed với thương lượng, xác nhận Fuji, duyệt hợp đồng, thu SIM và bàn giao.

## 1. Tính năng chưa triển khai hoặc mới có phần nền

| Việc còn lại | Hiện trạng | Phụ trách | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| **Đăng ký tài khoản mới** | **Một phần.** Có đăng nhập và hồ sơ. Chưa thấy luồng đăng ký trong UI tích hợp. | DEV 1 + DEV 2 | Đăng ký bằng Supabase Auth, đăng nhập rồi tạo nhóm hoặc dùng lời mời với tài khoản mới. |
| **Rời nhóm và đổi ví** | **Chưa triển khai.** Có luồng chuyển vai đại diện qua lời mời. Phạm vi khóa rời nhóm/đổi ví còn ở quyết định G-09. | DEV 1 + DEV 2, DEV 3 phối hợp phần ví | Có quy tắc rõ cho hộ và đại diện. Server chặn thao tác có ảnh hưởng khi đang chờ xác nhận hoặc còn hợp đồng đang chạy. |
| **Giỏ nháp từ Gemini** · A05/B09 | **Một phần.** Giỏ tay có `stockQty` và `needQty`. Chưa có luồng AI từ nội dung hộ nhập tới bản nháp để hộ sửa. | DEV 1 + DEV 2 | Hộ nhập nội dung về món đang có hoặc còn thiếu. Kết quả được đối chiếu SKU và đơn vị, rồi hộ sửa và xác nhận. Gemini lỗi thì giữ dữ liệu đang sửa và vẫn nhập tay được. |
| **Đề nghị và thương lượng** · B02/A04 | **Chưa triển khai.** Feed đã hiển thị nhu cầu. Chưa có luồng gửi đề nghị và phản hồi bản hợp đồng. | DEV 2 + DEV 1 | Seller chào tối đa 10 chai. Ba hộ góp 2+2+3, ghi chú và thấy số tiền. Seller có thể từ chối, yêu cầu sửa hoặc chấp thuận. Bản đã gửi giữ nguyên, bản sửa có phiên bản mới. Chỉ 7 chai của ba hộ đi tiếp. |
| **Liên kết Core Wallet và xác nhận trên Avalanche Fuji C-Chain** · C01–C04 | **Một phần.** Có chỗ hiển thị ví và bảng dữ liệu nền. Chưa có luồng chứng minh ví, vòng ký Fuji và đồng bộ xác nhận trong bản tích hợp. | DEV 3, DEV 2 và DEV 1 tích hợp | Ví đã xác minh. Seller chấp thuận chỉ mở vòng khi mọi hộ có phần đều sẵn sàng. Ghi nhận đủ từng hộ ký đúng phiên bản, đúng ví, đúng hạn từ giao dịch Fuji thật. |
| **Đại diện duyệt cuối và giữ lượng** · B03/A04 | **Một phần.** Có cột lượng nền. Chưa có giao dịch tạo hợp đồng, cọc và lượng `pending` sau duyệt. | DEV 2 + DEV 1 | Đại diện chỉ duyệt bản seller đã chấp thuận và đủ xác nhận Fuji. Duyệt lặp chỉ tạo một hợp đồng. Thiếu lượng ghi `STOCK_CONFLICT`, giữ nguyên bản đã ký. |
| **Cọc seller và tiền hàng SIM** · B04/A04 | **Chưa triển khai.** | DEV 2 + DEV 1 | Cọc hợp lệ mới chuyển `pending` sang `reserved`. Đơn 0đ vẫn có cọc seller. Đơn có giá ghi tiền hàng riêng. Ghi lặp không thu hai lần. |
| **Bàn giao, bằng chứng và quyết toán** · B05/A04 | **Chưa triển khai.** | DEV 2 + DEV 1, DEV 3 hỗ trợ môi trường Storage | Seller và đại diện duyệt cùng phiên bản biên nhận. Giao thiếu tính theo thực nhận từng hộ. Ops ghi chi/hoàn và đơn chỉ `COMPLETED` khi đủ khoản bắt buộc. |
| **Worker hạn và thông báo** · C05/B05 | **Một phần.** Có bảng `outbox` nền. Chưa thấy worker, xử lý hạn và thông báo tích hợp. | DEV 3 + DEV 2, DEV 1 nối UI | Worker khởi động lại xử lý tiếp được. Sự kiện lặp không tăng xác nhận hay gửi trùng. Thao tác quá hạn bị chặn ở server. |

Căn cứ từ bản tích hợp gồm [các route API hiện có](../src/app/api/v1), [màn đăng nhập](../src/app/login/page.tsx), [khu vực ví](../src/app/me/WalletSection.tsx) và [migration nền](../supabase/migrations/20261111000100_backend_foundation.sql). Giỏ Gemini trong MVP trích dữ liệu hộ nhập để tạo nháp. Gợi ý món thiếu tự động theo định mức cần chốt nguồn và đơn vị theo G-07.

## 2. Bàn giao và kiểm chứng còn thiếu

- [ ] **Review bản bàn giao trước khi merge.** Từ nhánh tích hợp, kiểm tra nút **Tham gia nhóm**, luồng dán liên kết và mở liên kết trực tiếp qua đăng nhập. Dùng SHA đã được review cho lần kiểm tra staging.
- [ ] **Xác nhận Supabase Auth thật và staging** · C06a. Demo cục bộ dùng Auth mô phỏng. Cần xác minh đăng ký, đăng nhập, phân quyền, migration/seed và Storage riêng trên môi trường được cấp quyền. Ghi URL, SHA triển khai và kết quả kiểm tra web/DB/worker khi các thành phần sẵn sàng.
- [ ] **Xác nhận CI và phương án phục hồi** · C06b. Có bằng chứng CI chạy cho SHA bàn giao, danh sách migration đã áp, cấu hình Fuji, kết quả kiểm tra nhanh sau triển khai và SHA có thể phục hồi.
- [ ] **Nghiệm thu xuyên suốt trên staging** · A06/B06/C07. Chạy ca 10→7 có yêu cầu sửa và ký lại, thiếu ví hoặc thiếu chữ ký thì chặn, hai lần duyệt không tạo đơn trùng. Chạy đơn 0đ tới `COMPLETED` và đơn 8 × 2.000đ giao 6 với tiền hàng chi 12.000đ, hoàn 4.000đ. Kiểm truy cập chéo nhóm, quá hạn, khởi động lại worker và Gemini lỗi vẫn nhập tay được.

Bằng chứng hiện có cho phần nền gồm 19 test mặc định và 5 test tích hợp PostgreSQL trên bản `b095b19`. Luồng tham gia nhóm bổ sung đã được kiểm tra trên trình duyệt cục bộ. Báo cáo này dùng kết quả kiểm tra trước đó. Các ca staging và giao dịch Fuji thật vẫn chờ bằng chứng.

## 3. Checklist triển khai theo thứ tự phụ thuộc

- [ ] Chốt chuẩn ví, credential, hash, ABI và chính sách xác nhận Fuji theo G-06 · DEV 3 + DEV 2, song song với B02.
- [ ] Nối đề nghị và thương lượng 10→7 từ Feed · B02/A04. DEV 1 có thể bắt đầu UI từ fixture của DEV 2.
- [ ] Liên kết Core Wallet và đồng bộ xác nhận của từng hộ trên Fuji · C01–C04.
- [ ] Nối đại diện duyệt cuối, tạo hợp đồng và giữ lượng `pending` · B03/A04.
- [ ] Nối cọc seller, thu tiền hàng và đối soát SIM · B04/A04.
- [ ] Nối biên nhận, bàn giao thiếu, chi/hoàn và ops `POSTED` · B05/A04.
- [ ] Chốt giá trị deadline và nối worker xử lý hạn, retry và thông báo · C05/B05.
- [ ] Nối Gemini tạo giỏ nháp và kiểm đường nhập tay khi lỗi · A05/B09.
- [ ] Thêm đăng ký và kiểm tài khoản mới có thể tạo/tham gia nhóm · DEV 1 + DEV 2.
- [ ] Chốt G-09 và triển khai rời nhóm/đổi ví theo vai và trạng thái giao dịch · DEV 1 + DEV 2 + DEV 3.

B03–B05 có thể chuẩn bị với fixture xác nhận chung trong lúc tích hợp Fuji. Kiểm các ca chính bằng giao dịch Fuji thật trên cùng SHA staging trước khi chốt bản demo.

Thanh toán thật/payOS, đổi điều khoản sau khi chốt và phân xử cọc thuộc phạm vi sau demo. Slide và video thực hiện sau giai đoạn code.
