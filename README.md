# OOPS

Backend phục vụ xác thực, hồ sơ, nhóm và lời mời, danh mục, đợt gom, giỏ tay, đăng nhu cầu, Feed, đề nghị và nháp thương lượng. Các route nằm dưới `/api/v1` theo [đặc tả API](docs/API%20doc.md). Frontend có thể dùng DTO cho [phần nền](src/contracts/foundation.ts) và [thương lượng](src/contracts/negotiation.ts).

## Chạy với Supabase dev

1. Dùng Node.js 22.18 trở lên. Chạy `npm ci`.
2. Sao chép `.env.example` thành `.env.local`. Điền URL và publishable key của project Supabase dev, `DATABASE_URL` của PostgreSQL, `APP_URL` và `OOPS_INVITE_SECRET`. Dùng cùng hostname trong `APP_URL` và khi truy cập app. Dùng một secret ngẫu nhiên ổn định có ít nhất 32 byte để các lần retry tạo lời mời trả lại đúng link.
3. Áp dụng [các migration](supabase/migrations) theo thứ tự tên file lên project dev được phép. Với Supabase CLI, chạy `supabase init` nếu chưa có `supabase/config.toml`, liên kết project dev, rồi chạy `supabase db push --remote`. Xác nhận project đích trong đầu ra của CLI. Dùng kết nối PostgreSQL trực tiếp hoặc Supavisor session pooler. Nếu cần chứng thư CA để xác minh TLS, tải từ project và đặt đường dẫn local ở `DATABASE_CA_FILE`.
4. Điền `OOPS_DEV_PROJECT_REF`, `SUPABASE_SECRET_KEY` và mật khẩu demo `OOPS_DEMO_PASSWORD`, sau đó chạy `npm run db:seed`. Script tạo danh mục, năm hộ, một người bán và giỏ nước đã xác nhận tổng 12 chai. Seed giữ nguyên giỏ, vai trò và deadline đã có khi chạy lại.
5. Chạy `npm run dev`. API đọc phiên cookie Supabase. Frontend dùng Supabase SSR client cùng origin và gửi JSON cho các thao tác ghi. Gửi `Idempotency-Key` cho POST nghiệp vụ và dùng lại khóa chỉ khi gửi lại đúng request.

Tài khoản đại diện seed là `oops-dev-household-1@example.test`. Hộ còn lại có số 2–5, người bán là `oops-dev-seller@example.test`. Tài khoản seed dùng mật khẩu đặt lúc tạo. Từ phiên đại diện, GET `/api/v1/groups/{groupId}` lấy đợt gom, GET `/api/v1/campaigns/{id}/needs` xem trước 12 chai, rồi POST `/api/v1/campaigns/{id}/publish` với `{}` để đăng sớm. Feed đọc được bằng phiên người bán qua `GET /api/v1/feed?district=OOPS_DEMO&category=WATER`.

## Thử luồng trên giao diện

1. Mở `/` để vào ứng dụng. Đăng nhập tại `/login`, hoặc chọn **Tạo tài khoản mới** (`/login?mode=signup`). Nhập tên hiển thị, nơi sinh sống, số điện thoại, email và mật khẩu có ít nhất 9 ký tự, rồi nhập lại mật khẩu. Nếu Supabase yêu cầu xác nhận, mở link mới nhất trong email; màn chờ có nút gửi lại và quay về đăng nhập. Nếu Supabase trả phiên ngay, app mở nhóm trực tiếp. Liên kết mời được giữ xuyên suốt đăng ký/xác nhận/đăng nhập.
2. Tại **Nhóm của tôi**, đại diện chọn **Lấy liên kết và mã nhóm**. Cùng một link hoặc mã 8 ký tự có thể chia sẻ cho nhiều hộ. Người nhận mở link hoặc chọn **Tham gia nhóm qua lời mời** rồi dán link hoặc nhập mã.
3. Mở một đợt. Hộ nhập số lượng cần mua ở cột bên phải hoặc mở **Gợi ý bằng AI** để trả lời số ngày dự trữ và mô tả nhu cầu. Bấm **Lưu giỏ** để cập nhật nhu cầu khi ví Fuji đã sẵn sàng. Đại diện có thể đăng tổng nhu cầu trước hạn cần hàng. Nút **Xem đơn** mở tiến độ và các đề nghị của đúng món trong tab Đơn hàng hoặc mở chi tiết đơn khi đã chốt.
4. Dùng một phiên người bán để mở **Feed** và tìm bài vừa đăng. Trang **Tài khoản** hiển thị hồ sơ, liên hệ riêng và trạng thái ví từ API.

Mở `/ui-preview` để xem các component thiết kế. Phần ví trong bản này hiển thị dữ liệu của backend nền. Giao dịch Fuji thuộc mốc tích hợp tiếp theo.

Các bảng nghiệp vụ không mở trực tiếp cho browser. Giữ thông tin kết nối DB, secret Auth và secret lời mời ở server. Link dùng lại chứa mã nhóm ở `/join?token=…`. Lời mời một lần lưu hash token ở DB.

## Cấu hình email đăng ký

Khi đăng ký, chọn phường/xã/đặc khu tại TP.HCM trong mục **Nơi sinh sống**. Tài khoản chưa vào nhóm nào có nhóm riêng ngay khi mở trang Nhóm hoặc Tài khoản và có thể tạo liên kết mời. Nhu cầu lưu vị trí của đại diện tại thời điểm đăng để lọc Feed. Áp hai migration vị trí ngày 17/11/2026 trước khi chạy bản này. [Nguồn dữ liệu và hợp đồng vị trí](docs/locations.md)

Trong Supabase **Authentication → URL Configuration**, đặt **Site URL** là URL HTTPS của bản triển khai chính. Trong **Redirect URLs**, cho phép callback `/login/confirm` cùng query `next` và `sb_flow_id` của bản triển khai. Khi thử local, thêm `http://localhost:3000/**` hoặc `http://localhost:3001/**` cho đúng cổng đang chạy. Dùng cùng hostname khi mở app và đăng ký. Kiểm tra Email provider cho phép đăng ký và đặt độ dài mật khẩu tối thiểu là 9 ở Supabase Auth để áp dụng cùng giới hạn cho API Auth.

Callback hỗ trợ cả link mặc định có `code`/`sb_flow_id` (PKCE, cần trình duyệt đã đăng ký) và link có `token_hash` (`type=email` hoặc `signup`). Để xác nhận trên trình duyệt/thiết bị khác, có thể cấu hình **Confirm signup** email template:

```html
<h2>Xác nhận tài khoản OOPS</h2>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Xác nhận email</a></p>
```

Template này dùng URL do OOPS gửi khi `signUp`/`resend`, luôn có `?next=…`, nên giữ được lời mời. Link mặc định vẫn được hỗ trợ nếu chưa đổi template. Link chỉ dùng một lần; khi hết hạn hoặc mở sai trình duyệt, app cho đăng nhập lại hoặc gửi lại email, không tự bỏ qua xác nhận.

Để mở đăng ký cho email ngoài danh sách được Supabase cho phép, cấu hình **custom SMTP** và kiểm tra giới hạn gửi. Nếu gặp `email_address_not_authorized`, cần sửa cấu hình gửi email của project; thay form hoặc tắt thông báo lỗi không giải quyết được. Tham khảo [Supabase password Auth](https://supabase.com/docs/guides/auth/passwords), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Kiểm thử

| Lệnh | Kiểm chứng |
| --- | --- |
| `npm run typecheck` / `npm run build` | Kiểu, route và bản build Next.js |
| `npm test` | Fixture, validation và công thức lượng. Suite DB mặc định bỏ qua khi chưa chọn DB test. |
| `npm run test:db` | Handler và PostgreSQL thật, với danh tính Auth giả lập. Đặt `OOPS_TEST_DATABASE_URL` trỏ đến DB test đã áp migration và có danh mục từ `supabase/seed.sql`. Suite tạo dữ liệu riêng, kiểm khóa và dọn theo ID sau khi chạy. |
| `npm run test:auth` | Đăng nhập Supabase dev bằng tài khoản demo, kiểm tra `Set-Cookie` khi làm mới phiên trên `/`, `/groups`, `/groups/[id]` và `/api/v1/me`, rồi dùng cookie mới gọi API nhóm và Feed của app local. |
| `npm run test:registration` | App local đang chạy với Supabase dev. Tạo hai tài khoản tạm để kiểm xác nhận, đăng nhập, nhóm mặc định, mời, tham gia, rời nhóm và lọc Feed theo vị trí đại diện. Dọn tài khoản và nhóm thử sau khi chạy. Cần `OOPS_DEV_PROJECT_REF`, `SUPABASE_SECRET_KEY` và `DATABASE_URL`. Email được xác nhận bằng link thử từ `admin.generateLink`. |

`test:db` hỗ trợ PostgreSQL thử nghiệm trên loopback có bảng `auth.users` và các role Supabase, hoặc project Supabase dev được xác nhận bằng `OOPS_DEV_PROJECT_REF`. Với Supabase dev, suite dùng secret Auth để tạo và xóa tài khoản test tạm thời.

Từ `demandItemId` trên Feed, người bán gửi đề nghị qua `POST /api/v1/needs/{id}/offers`. Hộ có nhu cầu dùng `proposalId` để mở nháp bằng `POST /api/v1/offers/{id}/draft`, rồi mỗi hộ cập nhật dòng của mình tại `PUT /api/v1/drafts/{id}/my-line` bằng `editRevision` hiện hành. [Fixture thương lượng](tests/fixtures/negotiation.ts) mô tả ca chào 10, các hộ góp 2+2+3.

Đề nghị mới dùng vòng phiếu và cần ít nhất 20 giờ trước giờ giao với cấu hình mẫu. Luồng nháp cũ dùng `POST /api/v1/drafts/{id}/submit` và mốc 30 giờ. Khi người bán chấp thuận, API kiểm credential và đưa yêu cầu mở vòng Fuji vào outbox để worker xử lý ngay. [Thời hạn](docs/OOPS-Spec.md#8-thời-hạn) · [Chuẩn băm phiên bản](docs/OOPS-Spec.md#chuẩn-băm-phiên-bản)

## Cấu hình backend demo

- Đặt `OOPS_PAYMENT_MODE=SIM` cho luồng chốt, thu mô phỏng và ghi chi. Cấp quyền ops riêng bằng một dòng `ops_accounts.user_id` cho hồ sơ vận hành đã xác thực trên DB dev.
- Dùng `OOPS_EVIDENCE_BUCKET` trỏ tới bucket Supabase riêng và giữ `SUPABASE_SECRET_KEY` ở server. Bằng chứng dùng trường multipart `file` và liên kết đọc có hạn 5 phút.
- Đặt `GEMINI_API_KEY` và `GEMINI_MODEL` để tạo gợi ý giỏ. Giỏ nhập tay dùng cùng API lưu và xác nhận khi AI lỗi. [Gemini GenerateContent](https://ai.google.dev/api/generate-content)
- Điền `OOPS_FUJI_RPC_URL`, `OOPS_FUJI_CONFIRMATION_CONTRACT`, `OOPS_FUJI_CREDENTIAL_CONTRACT` và `OOPS_FUJI_CREDENTIAL_ABI` từ deployment của DEV 3. ABI là một hàm `view` nhận `address`, trả `bool` hoặc số dư `uint256`. Worker mở vòng từ outbox và đồng bộ xác nhận. Bộ test DB dùng RPC và xác nhận mô phỏng. [Interface Fuji và worker](docs/architecture.md#bàn-giao-backend-và-worker)
