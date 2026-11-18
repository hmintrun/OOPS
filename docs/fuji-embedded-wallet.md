# Ví tích hợp trên Fuji

Người dùng vẫn đăng nhập bằng Supabase. Khi ví tích hợp được bật trên Fuji, mọi tài khoản đăng ký hoặc đăng nhập OOPS đều có thể tạo hoặc khôi phục ví OOPS và xác nhận đơn bằng ví đó trên Avalanche Fuji do Alchemy tài trợ gas. Openfort tạo hoặc khôi phục khóa ký của họ khi họ nhấn xác minh hoặc xác nhận đơn, còn Alchemy gửi yêu cầu ERC-4337 qua ví hợp đồng riêng của hộ và tài trợ gas. OOPS lưu địa chỉ ví hợp đồng mà Fuji thấy, thay vì địa chỉ ví ký của Openfort. Worker vẫn đọc `VersionConfirmed` từ contract OOPS. Một giao dịch ERC-4337 có thể chứa nhiều bằng chứng ví, nên backend đối chiếu từng event với nonce một lần của đúng tài khoản.

## Cấu hình dev

1. Dùng checkout và Supabase dev riêng cho thử nghiệm. Chọn dự án Openfort **Test mode** và gói Free. Tại Authentication → Providers → Supabase, nhập URL dev và khóa publishable của Supabase. Openfort xác thực phiên Supabase khi hộ dùng ví lần đầu. Thêm đúng origin thử nghiệm vào danh sách domain của Openfort.
2. Lấy khóa publishable của dự án test (`pk_test_*`), khóa publishable Shield, khóa bí mật Shield và phần khóa khôi phục tự động. Chỉ đặt hai giá trị bí mật trong cấu hình server. Giữ ổn định phần khóa khôi phục để mở lại ví trên thiết bị khác.
3. Trong Alchemy Free, tạo policy Gas Sponsorship cho **Avalanche Fuji**. Đặt hạn mức giao dịch toàn policy và theo ví. Không thêm phương thức thanh toán. Dùng khóa web của dự án Alchemy gắn với policy, cấu hình giới hạn origin cho bản chạy trên web. Các thao tác OOPS gửi sang Alchemy là xác minh ví và xác nhận đơn, đều có giá trị chuyển bằng 0.
4. Điền các biến ví trong `.env.example` vào `.env.local` hoặc cấu hình dev (không cần cấu hình danh sách mời người dùng). Bật `NEXT_PUBLIC_OOPS_FUJI_EMBEDDED=true` rồi khởi động lại app. Mọi tài khoản đăng ký/đăng nhập OOPS hợp lệ đều tạo và xác nhận được bằng ví OOPS trên Fuji do Alchemy tài trợ gas. Các biến `NEXT_PUBLIC_*` cần có lúc build.

## Nghiệm thu

- Với một tài khoản đăng ký hoặc đăng nhập mới bất kỳ chưa liên kết ví, mở **Tài khoản → Thiết lập xác nhận trong OOPS** trên trình duyệt không cài Core Wallet. Bấm xác minh và kiểm `VERIFIED`, đủ điều kiện xác nhận, giao dịch Fuji cùng event `WalletProved` của đúng ví, và policy Alchemy đã tài trợ gas. Ví hợp đồng có thể có số dư AVAX bằng 0.
- Đăng xuất, đăng nhập lại hoặc mở phiên trên thiết bị khác. Kiểm OOPS dùng lại địa chỉ ví đã xác minh.
- Chạy đơn ba hộ với phần 2 + 2 + 3. Mọi tài khoản OOPS đăng nhập đều xác nhận được ngay trong OOPS trên Fuji do Alchemy tài trợ gas. Kiểm Fuji có đủ ba `VersionConfirmed` đúng vòng, phiên bản và địa chỉ. Backend chỉ mở bàn giao khi còn đủ điều kiện thu.
- Kiểm hành vi khi tắt `NEXT_PUBLIC_OOPS_FUJI_EMBEDDED` hoặc dùng khóa không phải `pk_test_*` (endpoint trả `404`), giao dịch lỗi, chờ đồng bộ và trường hợp dùng sai ví. Chạy một giao dịch xác minh và ký với Core Wallet để kiểm tương thích.

Nếu hết hạn mức hoặc dịch vụ không trả tài trợ, màn hình báo thử lại. Việc mở cho mạng thật cần quyết định chi phí theo gói và mạng. Cấu hình hiện tại áp dụng cho mọi tài khoản đăng nhập OOPS trên Avalanche Fuji và Openfort Test mode.

## Kết quả thử ngày 18/11/2026

Ba tài khoản Supabase thử đăng nhập từ các phiên Chrome riêng, xác minh ba ví OOPS khác nhau và xác nhận cùng phiên bản đơn 7 chai (2 + 2 + 3). Lần mở vòng dùng tài khoản vận hành Fuji của dev cho đúng vòng thử. Sau đó indexer tự ghi nhận 3/3 xác nhận. Sáu giao dịch xác minh và xác nhận thành công qua ERC-4337. Mỗi ví có số dư 0 AVAX và không bị tính gas cho các thao tác đó. Alchemy tài trợ qua [Bundler Sponsored Operations](https://www.alchemy.com/docs/wallets/transactions/sponsor-gas/bundler-sponsored-operations).

- Xác nhận 2 chai [trên Fuji](https://testnet.snowtrace.io/tx/0xcc58e2c9d2c7824b411558bf5d19e58119b289a66347d57ca39dad8623e0b5e7).
- Xác nhận 2 chai [trên Fuji](https://testnet.snowtrace.io/tx/0x741e655d51860a0337fc25125cb17d9e202ad663780e644ef57d542101dc2fcb).
- Xác nhận 3 chai [trên Fuji](https://testnet.snowtrace.io/tx/0xa08ec751a4f3a2c086ac0f8c8e70a66fa0df6139b1b29fea3e3060a2372276eb).

Bản chạy local dùng Supabase dev và Fuji thật. Ca thử kết thúc ở trạng thái vòng `CONFIRMED`.
