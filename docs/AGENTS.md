# AGENTS.md — OOPS

OOPS là MVP gom nhu yếu phẩm theo nhóm, xác nhận hợp đồng trên Avalanche Fuji và quyết toán bằng tiền mô phỏng. Hướng dẫn này áp dụng cho phần triển khai OOPS ở workspace gốc. `ref/` chứa dự án tham khảo. Chỉ tái sử dụng phần cần thiết theo phạm vi task.

## Tài liệu dùng khi triển khai

| Tài liệu | Dùng để tra cứu |
| --- | --- |
| [requirements.md](requirements.md) | Phạm vi MVP và tiêu chí nghiệm thu |
| [OOPS-MVP-Plan.md](OOPS-MVP-Plan.md) | Luồng người dùng và kịch bản demo |
| [architecture.md](architecture.md) | Trạng thái, thời hạn, thứ tự khóa và quyền riêng tư |
| [schema.md](schema.md) | Bảng, khóa và bất biến dữ liệu |
| [API doc.md](API%20doc.md) | Endpoint, payload, quyền và lỗi của `/api/v1` |
| [OOPS-7-Day-Development-Plan.md](OOPS-7-Day-Development-Plan.md) | Task, dependency và mốc tích hợp |

Dùng phân công bên dưới cho các phần việc mới. Nếu bảng task còn gộp UI và server dưới một DEV, tách phần bàn giao và cân lại giờ theo chủ sở hữu thực tế. Khi API, schema hoặc kiến trúc mô tả khác nhau, đối chiếu quyết định đã chốt và cập nhật các bên gọi trong cùng thay đổi.

## Phân công và bàn giao

| Vai trò | Sở hữu | Bàn giao |
| --- | --- | --- |
| **DEV 1 — Frontend** | App shell, màn đăng nhập, nhóm, giỏ, Feed, thương lượng, đơn, bàn giao và màn ops. Tích hợp component ví và gọi API. | UI chạy được bằng fixture trong dev/test. Khi API thật sẵn sàng, nối UI vào API và kiểm lỗi, trạng thái chờ cùng quyền hiển thị. |
| **DEV 2 — Backend + Database** | API nghiệp vụ, phiên Auth và quyền ở server, Gemini phía server, schema, migration, RLS và transaction cho lượng, tiền, hợp đồng, bàn giao. | Payload, kiểu dữ liệu và lỗi API cho DEV 1. Hàm nghiệp vụ idempotent và thứ tự migration cho DEV 3. |
| **DEV 3 — DevOps + Tích hợp Fuji** | Môi trường và CI, liên kết Core Wallet, credential, smart contract, ABI, component ký, indexer, worker và kiểm thử tích hợp trên staging. | ABI và giao diện component ký cho DEV 1. Kết quả xác nhận Fuji theo đúng phiên bản và tình trạng job cho DEV 2. URL staging, SHA và bằng chứng smoke test cho cả nhóm. |

- Chốt request/response, quyền, lỗi và fixture cho chuỗi `demandItemId → proposalId → versionId → roundId → contractId` trước khi triển khai song song. DEV 2 giữ hợp đồng API và migration. DEV 3 giữ ABI và cấu hình triển khai. DEV 1 cùng review kiểu dùng ở UI và dữ liệu mẫu.
- DEV 1 dùng fixture chung khi BE chưa sẵn sàng. DEV 2 kiểm logic duyệt với xác nhận giả lập trong test. DEV 3 thử Fuji độc lập rồi ghép web và worker trên staging. BE giữ quyền quyết định chuyển trạng thái nghiệp vụ. Worker ghi kết quả đã kiểm và gọi hàm nghiệp vụ đã thống nhất.
- Mỗi PR ghi task, phần sở hữu, interface thay đổi, dependency và bằng chứng kiểm thử. Khi sửa interface chung, cập nhật tài liệu, kiểu, fixture và bên gọi liên quan. Người sở hữu phần bị ảnh hưởng review trước khi merge.

## Quy tắc nghiệp vụ phải giữ

- Người bán chào lượng tối đa cho một món. Các hộ góp phần vào một bản chung, mỗi hộ chỉ sửa dòng của mình khi nháp mở. Hộ khởi tạo gửi bản. Người bán chấp thuận, từ chối hoặc yêu cầu sửa. Điều khoản và dòng hàng của bản đã gửi được giữ theo phiên bản.
- Mỗi phiên bản có tối đa một vòng Fuji. Trước khi mở vòng, tất cả hộ có lượng dương phải có ví đã xác minh và đủ quyền. Ví của các hộ trong vòng phải khác nhau. Khi thiếu ví, API trả `WALLET_NOT_READY` và giữ bản chờ phản hồi. Chỉ tính sự kiện đúng chain, contract, vòng, mã băm, ví và hạn. Xác nhận cũ không áp dụng cho bản mới.
- Chỉ đại diện có quyền duyệt cuối sau khi người bán chấp thuận và từng hộ có phần đã xác nhận đúng phiên bản. Kiểm lại hạn và lượng khả dụng dưới khóa. Thiếu lượng thì lưu `STOCK_CONFLICT` và thông báo, rồi trả `409`. Giữ nguyên phần hàng trong bản đã xác nhận.
- Khi duyệt cuối thành công, tạo đúng một hợp đồng, khoản cọc và `pending` trong cùng transaction. Chỉ khi cọc hợp lệ mới chuyển lượng sang `reserved`. Với từng món và từng hộ, giữ `pending + reserved + received ≤ target`. Feed dùng `missing = target − reserved − received`, còn `offerable = missing − pending`.
- Dùng VND số nguyên. Cọc và tiền hàng là các khoản riêng. Đơn 0đ vẫn có cọc và bỏ bước thu tiền hàng. Áp dụng `Idempotency-Key` cho các thao tác theo đặc tả, dùng ràng buộc duy nhất cho sự kiện thu, chi và xác nhận. Ghi thay đổi nghiệp vụ và outbox cùng transaction.
- Người bán và đại diện duyệt cùng phiên bản biên nhận. Áp lượng thực nhận và giải phóng lượng giữ đúng một lần. Tài khoản vận hành ghi `POSTED` bằng mã chuyển SIM. Đơn đủ điều kiện chuyển `COMPLETED` sau khi các khoản chi/hoàn bắt buộc đã ghi xong.
- Phạm vi demo dùng Core Wallet, Fuji và `SIM`. Gemini chỉ tạo giỏ nháp, giữ luồng nhập tay khi lỗi hoặc dữ liệu chưa đủ. Đổi giá/lượng hoặc lịch giao sau khi chốt, thanh toán thật và phân xử cọc nằm trong phạm vi sau demo.

## Triển khai và kiểm tra

- Dùng một codebase Next.js/TypeScript/Tailwind cho web và API. Supabase cung cấp Auth, PostgreSQL và Storage. Worker chạy từ cùng codebase. Giữ logic ghi ở server/transaction và kiểm quyền theo vai, nhóm, đối tượng ở mỗi thao tác.
- Giữ khóa riêng, service role key và Gemini key ở phía server. Dùng bucket riêng và URL bằng chứng có hạn. Trên Fuji chỉ đưa dữ liệu cần để xác minh vòng và xác nhận. Dữ liệu cá nhân, ghi chú, ảnh và tiền lưu ở hệ thống app.
- Khi repository đã có lệnh, dùng script trong manifest hoặc runbook để chạy build, typecheck và các test liên quan. Thay đổi trạng thái, quyền, tiền hoặc giữ lượng cần bằng chứng kiểm các ca sai vai, sai phiên bản hoặc thao tác lặp tương ứng. Báo rõ các kiểm tra đã chạy và điều kiện còn thiếu.
- Dựng staging có web, DB và worker trước cuối ngày 2. Mốc tích hợp chính là ca 0đ chạy qua Fuji thật, cọc mô phỏng, bàn giao và hoàn cọc đến `COMPLETED`. Smoke test dùng seed demo, địa chỉ contract và giao dịch Fuji tra được.
