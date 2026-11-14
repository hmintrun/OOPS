# Yêu cầu OOPS MVP

OOPS giúp các hộ cùng khu vực rà nhu yếu phẩm đang có, gom phần còn thiếu và nhận đề nghị từ người bán trước thiên tai. Mỗi hợp đồng xử lý một món. Các hộ có phần hàng xác nhận bản hợp đồng trên Avalanche Fuji rồi đại diện duyệt cuối. Người bán nộp cọc, các hộ thanh toán phần của mình nếu đơn có giá. Người bán và đại diện duyệt cùng biên nhận để quyết toán.

Tài liệu đặc tả các luồng trong [kế hoạch MVP](OOPS-MVP-Plan.md). Xem thêm [Kiến trúc](architecture.md), [Schema PostgreSQL](schema.md) và [Đặc tả API](API%20doc.md).

## Yêu cầu và phạm vi

| Yêu cầu MVP | Phạm vi sau demo |
| --- | --- |
| FR01  Một tài khoản mua và bán, tối đa một nhóm hoạt động. Đại diện phải đồng ý nhận vai trò. | Mở rộng vai trò phân xử và quy trình giải quyết tranh chấp. |
| FR02  Hộ lập giỏ tay hoặc từ Gemini, sửa rồi xác nhận trước hạn gom. Đại diện xem trước tổng giỏ đã xác nhận và có thể đăng sớm để đóng gom. Bài đăng theo khu vực có hạn cần hàng riêng. | Mở rộng bộ quy tắc gợi ý sau khi xác minh nguồn và đơn vị. |
| FR03  Người bán chào tối đa một lượng hàng theo giá thường, giá hỗ trợ hoặc 0đ. Các hộ gửi bản chung có phần từng hộ. Seller chấp thuận, từ chối hoặc yêu cầu sửa. Sau chấp thuận, mọi hộ có phần hàng xác nhận đúng phiên bản trên Fuji rồi đại diện duyệt. | Đổi giá/lượng và đổi lịch sau khi chốt. Thu VND thật sau khi chốt quy trình giữ, chi và hoàn. |
| FR04  Cọc riêng với tiền hàng. Hai bên duyệt cùng biên nhận để ghi nhận lượng thực nhận và mở lại phần giao thiếu. Hộ theo dõi đơn, số lượng, tiền và thông báo. | Tự động chi và hoàn khi có phương án thanh toán được duyệt. |

Đại diện đặt hạn gom và hạn cần hàng khi tạo đợt. Sau hạn gom hoặc khi đại diện đã đăng, hộ chỉ đọc giỏ. Feed vẫn nhận đề nghị dự phòng cho lượng còn thiếu trong khi chờ cọc. App chỉ tính lượng đã giữ sau khi xác nhận cọc.

Bản gửi có thể thấp hơn lượng chào. Seller yêu cầu sửa thì các hộ cập nhật phần của mình và gửi phiên bản mới. Phiên bản mới qua lại seller, xác nhận Fuji và đại diện. Khi còn bản đang chờ xác nhận hoặc hợp đồng đang chạy, khóa rời nhóm hoặc đổi ví có ảnh hưởng.

## Kịch bản nghiệm thu

Một nhóm cần 12 chai nước trước 17h. Người bán đề nghị 8 chai giao lúc 15h. Sau khi xác nhận cọc 50.000đ, nhóm có 8 chai đã giữ và còn thiếu 4. Với giá 2.000đ/chai, các hộ nộp tổng 16.000đ. Với giá 0đ, đơn đi thẳng tới bàn giao sau cọc.

- **Trước khi xác nhận.** Hộ thấy món, đơn giá, khung giờ giao, lượng và tiền hàng của mình trên đúng phiên bản người bán đã chấp thuận. Địa chỉ và liên hệ riêng chỉ mở cho các bên liên quan sau khi chốt.
- **Đề nghị dự phòng.** Khi cả 12 chai đang chờ cọc, Feed vẫn hiện còn thiếu 12 chai và nhận đề nghị dự phòng. Khi cọc hợp lệ, màn hình nhu cầu nhóm ghi đã giữ 12 chai và bài rời Feed vì đã hết lượng còn thiếu. Nếu cọc quá hạn, hệ thống giải phóng lượng chờ cọc để xét đề nghị khác.
- **Giao thiếu và cọc cần xử lý.** Nếu hợp đồng 8 chai giao 6 chai và hai bên duyệt cùng biên nhận, hệ thống ghi đã nhận 6 và giải phóng cả 8 chai đã giữ. Với nhu cầu 12 chai, lượng còn thiếu là 6 chai. Với giá 2.000đ/chai, chi tiền hàng 12.000đ và hoàn 4.000đ theo phần thực nhận của từng hộ. Phần cọc đang có tranh chấp tiếp tục chờ xử lý.
- **Đủ điều kiện lập biên nhận.** Đơn còn thiếu cọc hoặc tiền hàng bị từ chối. Đơn đã thu đủ và giữ hàng chuyển sang Chờ hai bên duyệt ngay khi đại diện lập biên nhận đúng hạn.
- **Thương lượng 10→7.** Seller chào 10 chai, các hộ gửi 7 chai với phần 2+2+3. Một hộ thiếu ví thì chưa mở vòng. Cả ba xác nhận đúng bản rồi đại diện mới chốt 7 chai. Ca yêu cầu sửa phải gửi bản mới và xác nhận lại.
- **Chỉ một bên duyệt.** Khi hết hạn duyệt, hợp đồng chuyển Cần xử lý. Hủy trực tiếp bị từ chối sau khi có biên nhận hoặc bằng chứng giao. Chưa mở lượng giữ hoặc chi, hoàn tiền tự động khi kết quả bàn giao còn tranh chấp.
- **Hạn gom và kiểm tra đầu vào.** Hộ đọc được hạn gom và hạn cần hàng. Khi hết hạn gom, sửa hoặc xác nhận giỏ bị từ chối. App từ chối số người bằng 0, lượng âm và lượng thực nhận vượt phần đã chốt.
- **Thu lặp.** Cùng mã giao dịch gửi lại chỉ ghi một lần. Nếu phát sinh lần nộp thứ hai với mã khác vào khoản đã nhận, chuyển đối soát hoặc hoàn. Lượng giữ và bước hợp đồng chỉ cập nhật một lần.
- **Hạn trước khi chốt và xung đột lượng.** Hết hạn seller, thiếu xác nhận hoặc đại diện chưa duyệt đúng hạn làm bản hết hiệu lực. Nếu thiếu lượng lúc duyệt, ghi xung đột, giữ nguyên bản đã ký. Hộ khởi tạo có thể gửi bản mới nếu đề nghị và lịch còn hiệu lực.
- **Hoàn tất quyết toán SIM.** Tài khoản vận hành ghi mã chi/hoàn. Ca giao đủ đúng hạn đạt COMPLETED sau khi các khoản bắt buộc đã POSTED.

## Kế hoạch tích hợp

Ghép giỏ nhập tay và Feed với Fuji và thanh toán mô phỏng. DEV 2 bàn giao `demandItemId`, `proposalId`, `draftId` và `versionId` từ API. DEV 1 dùng các ID này để nối UI. DEV 3 trả xác nhận Fuji theo `roundId` gắn với `versionId` và dựng staging trước cuối ngày 2. Chạy ca 0đ trước, sau đó đơn có giá và các nhánh lỗi.

| Mốc | Bàn giao | Điều kiện đạt |
| --- | --- | --- |
| M1 | Tài khoản, nhóm, giỏ tay, Feed và ví Fuji. | Hộ xác nhận giỏ. Feed có đúng tổng. Ví đủ điều kiện xác nhận được bản trên Fuji. |
| M2 | Đề nghị, hợp đồng 0đ và bàn giao. | Chốt sau đủ xác nhận và duyệt cuối. Giữ 8 trên 12 chai, thu và hoàn cọc 50.000đ. Ops ghi POSTED, đơn đạt COMPLETED. |
| M3 | Đơn có giá, nhánh lỗi và giỏ Gemini. | Đơn 16.000đ tách cọc. Giao thiếu hoàn phần dư. Một bên duyệt chuyển Cần xử lý khi hết hạn. |
| M4 | Thử QR và đối soát nội bộ nếu cần. | Mã webhook, số tiền và khoản chi thực tế khớp. Chốt [các quyết định còn mở](#các-quyết-định-cần-chốt) trước khi mở rộng. |

## Quy ước cho bản demo

- Tập xác nhận gồm toàn bộ hộ có phần dương trong bản seller đã chấp thuận. Mỗi hộ có đúng một ví hợp lệ và xác nhận một lần. Bản mới không kế thừa xác nhận cũ.
- Demo dùng phí đại diện 0đ. Nếu áp dụng phí cho đơn có giá, hiển thị thành dòng riêng, loại khỏi công thức cọc và chỉ chi khi giao thành công. Đơn 0đ trong MVP có phí đại diện 0đ.

## Các quyết định cần chốt

- Chốt chuẩn token, cấp/thu hồi và chính sách xác nhận block Fuji. Các hạn nghiệp vụ dùng [đặc tả thời hạn](OOPS-Spec.md#8-thời-hạn).
- Đợt gom cần chốt danh mục và đơn vị chuẩn, bộ quy tắc gợi ý có nguồn. Quy tắc rời nhóm và đổi ví theo [G-09](OOPS-Spec.md#66-rời-nhóm-và-đổi-ví-g-09).
- Bàn giao cần chốt hạn xử lý khi thiếu duyệt, điều kiện và mức khấu trừ cọc, bên nhận khoản khấu trừ và thẩm quyền giải quyết ca mâu thuẫn trước khi chạy thật.
- Trước khi mở rộng sang sửa điều khoản sau chốt hoặc VND thật, chốt cách xác nhận lại, đối soát, giữ/chi/hoàn tiền, quyền vận hành và chính sách lưu bằng chứng.
