# OOPS — Báo cáo công việc còn lại

## Cập nhật đăng ký · 17/11/2026

- **VERIFIED — vị trí.** Đã nhập 168 đơn vị TP.HCM từ Công báo; đăng ký bắt buộc chọn vị trí, lưu hồ sơ, điền sẵn nhóm và lọc Feed theo snapshot trên nhu cầu. Migration đã áp Supabase dev. Smoke Auth/DB/HTTP đã qua cả bộ lọc đúng/sai phường và giữ vị trí nhu cầu sau khi nhóm test đổi vị trí. Giỏ publish dùng fixture CONFIRMED sau khi kiểm chặn thiếu ví; không tính là nghiệm thu Fuji. [Dữ liệu, API và schema](locations.md).

- **VERIFIED — code/UI.** Form kiểm tên/email, mật khẩu và nhập lại; có màn chờ xác nhận, gửi lại email với thời gian chờ, xử lý lỗi và giữ `next` của lời mời. Callback hỗ trợ PKCE `sb_flow_id` và `token_hash`. Đã kiểm form và lỗi mật khẩu không khớp trên Edge ở viewport 390×844.
- **VERIFIED — Supabase dev + HTTP thật.** `npm run test:registration` đã qua: hai tài khoản mới, callback ghi cookie, token dùng một lần, đăng nhập mật khẩu, hồ sơ đúng tên, tạo nhóm và nhận lời mời. Tài khoản/nhóm test đã được dọn. Script tạo link bằng `admin.generateLink`, không gửi email.
- **MISSING — giao email/staging.** Cần kiểm thư xác nhận tới hộp thư thật và URL triển khai. [Cấu hình callback/template/SMTP](../README.md#cấu-hình-email-đăng-ký). Các mốc bàn giao cũ bên dưới là lịch sử, không thay thế kết quả này.

## Cập nhật bàn giao DEV 1 · `feat/a07-pwa-install`

Đối chiếu phạm vi A01–A06 trong [kế hoạch 7 ngày](OOPS-7-Day-Development-Plan.md). Phần báo cáo bên dưới ghi nhận mốc `b095b19`.

| Task | Trạng thái frontend và phần cần tích hợp |
| --- | --- |
| A01–A03 | **VERIFIED — code.** App shell, API client, đăng ký/đăng nhập, nhóm và lời mời, giỏ tay, đợt gom và Feed có màn hình gọi API. Widget chào hàng từ Feed kiểm tra lượng còn thiếu và hạn cần hàng theo dữ liệu đang hiển thị. API vẫn quyết định theo dữ liệu hiện tại. |
| A04 | **VERIFIED — code.** Có UI thương lượng, chốt đơn, cọc/tiền hàng SIM, bàn giao, biên nhận, thông báo và đối soát. UI hiển thị trạng thái chưa có hạn. **CONFLICT — DTO trên nhánh này** vẫn yêu cầu `charges[].dueAt` và `confirmationRound.confirmBy`. Dev 2 cần xác nhận cách biểu diễn hạn chưa có trên nhánh tích hợp để Dev 1 kiểm lại UI và parser. **MISSING — ký thật.** Dev 1 cần interface liên kết và ký bằng Core Wallet từ Dev 3 rồi kiểm kết quả xác nhận qua API. |
| A05 | **VERIFIED — code.** Có luồng đưa gợi ý Gemini vào giỏ nháp để hộ sửa và đường nhập tay khi lỗi. Gemini thật cần kiểm trên môi trường tích hợp. |
| A06 | **VERIFIED — demo local.** Đăng giỏ nhóm → nhu cầu xuất hiện trên Feed → chào 10 chai với giá 2.000đ → ba hộ góp 7 chai. Feed phân trang 12 thẻ, đơn giữ tiến độ khi đổi tab. Chào mẫu 1 túi gạo giá 0đ giữ đúng đơn vị và cho gửi bản chung. Kiểm đơn và widget trong khung điện thoại 375px, không phát hiện tràn ngang ở hai màn đã kiểm. **MISSING — staging.** Cần URL, tài khoản theo vai, Auth/DB/Storage/Gemini và Fuji/worker để kiểm luồng API thật, lỗi theo vai và các ca tiền hàng đến `COMPLETED`. |
| PWA | **VERIFIED — code.** Có manifest, service worker, biểu tượng và [hướng dẫn mở app, triển khai và lấy link](huong-dan-mo-oops.md). Nghiệm thu cài và mở từ biểu tượng trên thiết bị thật cần link HTTPS theo SHA của Dev 3. |

Luồng rời nhóm/đổi ví (G-09) cần chốt quy tắc và API trước khi bổ sung thao tác trên UI.

## Mốc bàn giao `b095b19`

Đối chiếu theo [đặc tả MVP](OOPS-Spec.md), [hợp đồng API](API%20doc.md) và [kế hoạch 7 ngày](OOPS-7-Day-Development-Plan.md). Phạm vi báo cáo là bản bàn giao trên `feat/integrate-seven-agents`, gồm bản tích hợp `b095b19` và luồng tham gia nhóm bằng liên kết bổ sung sau đó.

Luồng đăng nhập demo → tạo/tham gia nhóm → lập và xác nhận giỏ tay → đăng nhu cầu lên Feed đã có UI và API. Phần còn lại để demo giao dịch là nối Feed với thương lượng, xác nhận Fuji, duyệt hợp đồng, thu SIM và bàn giao.

Trên nhánh DEV 2, API thương lượng, chốt đơn, thu SIM, bàn giao, ops, thông báo và Gemini đã có triển khai. API chấp thuận đọc credential qua RPC và lưu yêu cầu mở vòng. Staging cần contract, ABI và worker của DEV 3, cùng Auth, Storage riêng và Gemini. Các ca backend dùng RPC và fixture xác nhận trong PostgreSQL cục bộ. [Cấu hình backend demo](../README.md#cấu-hình-backend-demo) · [Interface backend và worker](architecture.md#bàn-giao-backend-và-worker)

## 1. Tính năng chưa triển khai hoặc mới có phần nền

| Việc còn lại | Hiện trạng | Phụ trách | Điều kiện nghiệm thu |
| --- | --- | --- | --- |
| **Đăng ký tài khoản mới** | **VERIFIED — code và Supabase dev.** Đã có form, xác nhận/gửi lại email và giữ lời mời; smoke tài khoản mới tạo/tham gia nhóm đã qua. **MISSING:** giao email thật và staging. | DEV 1 + DEV 2 | Kiểm email xác nhận đến hộp thư và callback đúng hostname triển khai. |
| **Rời nhóm và đổi ví** | Đã có API rời nhóm và ràng buộc PostgreSQL cho thay đổi ví theo [G-09](OOPS-Spec.md#66-rời-nhóm-và-đổi-ví-g-09). Còn nối UI, luồng liên kết/đổi ví và nghiệm thu tích hợp. | DEV 1 nối UI, DEV 2 kiểm transaction, DEV 3 nối xác minh ví | Thành viên đủ điều kiện rời được. Đại diện bàn giao vai trước. Server khóa khi còn nghĩa vụ. |
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

- [ ] Chốt chuẩn ví, credential, ABI vòng và chính sách xác nhận Fuji theo G-06 · DEV 3 + DEV 2, song song với B02. Dùng [chuẩn băm và vector đã chốt](OOPS-Spec.md#chuẩn-băm-phiên-bản) cho `versionHash`.
- [ ] Nối đề nghị và thương lượng 10→7 từ Feed · B02/A04. DEV 1 có thể bắt đầu UI từ fixture của DEV 2.
- [ ] Liên kết Core Wallet và đồng bộ xác nhận của từng hộ trên Fuji · C01–C04.
- [ ] Nối đại diện duyệt cuối, tạo hợp đồng và giữ lượng `pending` · B03/A04.
- [ ] Nối cọc seller, thu tiền hàng và đối soát SIM · B04/A04.
- [ ] Nối biên nhận, bàn giao thiếu, chi/hoàn và ops `POSTED` · B05/A04.
- [ ] Chốt giá trị deadline và nối worker xử lý hạn, retry và thông báo · C05/B05.
- [ ] Nối Gemini tạo giỏ nháp và kiểm đường nhập tay khi lỗi · A05/B09.
- [x] Thêm đăng ký và kiểm tài khoản mới có thể tạo/tham gia nhóm trên Supabase dev · DEV 1 + DEV 2; còn giao email thật/staging như cập nhật 17/11/2026.
- [ ] Nối UI rời nhóm, tích hợp luồng đổi ví của DEV 3 và nghiệm thu khóa G-09 · DEV 1 + DEV 2 + DEV 3.

B03–B05 có thể chuẩn bị với fixture xác nhận chung trong lúc tích hợp Fuji. Kiểm các ca chính bằng giao dịch Fuji thật trên cùng SHA staging trước khi chốt bản demo.

Thanh toán thật/payOS, đổi điều khoản sau khi chốt và phân xử cọc thuộc phạm vi sau demo. Slide và video thực hiện sau giai đoạn code.
