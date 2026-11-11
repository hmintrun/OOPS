# OOPS

Backend nền phục vụ xác thực, hồ sơ, nhóm và lời mời, danh mục, đợt gom, giỏ tay, đăng nhu cầu và Feed. Các route nằm dưới `/api/v1` theo [đặc tả API](docs/API%20doc.md). [Kiểu và schema DTO](src/contracts/foundation.ts) và [fixture](tests/fixtures/foundation.ts) có thể dùng từ frontend.

## Chạy với Supabase dev

1. Dùng Node.js 22.18 trở lên. Chạy `npm ci`.
2. Sao chép `.env.example` thành `.env.local`. Điền URL và publishable key của project Supabase dev, `DATABASE_URL` của PostgreSQL, `APP_URL` và `OOPS_INVITE_SECRET`. Dùng cùng hostname trong `APP_URL` và khi truy cập app. Dùng một secret ngẫu nhiên ổn định có ít nhất 32 byte để các lần retry tạo lời mời trả lại đúng link.
3. Áp dụng [migration nền](supabase/migrations/20261111000100_backend_foundation.sql) lên project dev được phép. Nếu dùng Supabase CLI đã đăng nhập, liên kết đúng project dev rồi chạy `supabase db push`. Dùng kết nối PostgreSQL trực tiếp hoặc Supavisor session pooler. Nếu cần chứng thư CA để xác minh TLS, tải từ project và đặt đường dẫn local ở `DATABASE_CA_FILE`.
4. Điền `OOPS_DEV_PROJECT_REF`, `SUPABASE_SECRET_KEY` và mật khẩu demo `OOPS_DEMO_PASSWORD`, sau đó chạy `npm run db:seed`. Script tạo danh mục, năm hộ, một người bán và giỏ nước đã xác nhận tổng 12 chai. Seed giữ nguyên giỏ, vai trò và deadline đã có khi chạy lại.
5. Chạy `npm run dev`. API đọc phiên cookie Supabase. Frontend dùng Supabase SSR client cùng origin và gửi JSON cho các thao tác ghi. Gửi `Idempotency-Key` cho POST nghiệp vụ và dùng lại khóa chỉ khi gửi lại đúng request.

Tài khoản đại diện seed là `oops-dev-household-1@example.test`. Hộ còn lại có số 2–5, người bán là `oops-dev-seller@example.test`. Tài khoản seed dùng mật khẩu đặt lúc tạo. Từ phiên đại diện, GET `/api/v1/groups/{groupId}` lấy đợt gom, GET `/api/v1/campaigns/{id}/needs` xem trước 12 chai, rồi POST `/api/v1/campaigns/{id}/publish` với `{}` để đăng sớm. Feed đọc được bằng phiên người bán qua `GET /api/v1/feed?district=OOPS_DEMO&category=WATER`.

Các bảng nghiệp vụ không mở trực tiếp cho browser. Giữ thông tin kết nối DB, secret Auth và secret lời mời ở server. Lời mời trả link `/join?token=…` cho frontend và lưu hash token ở DB.

## Kiểm thử

| Lệnh | Kiểm chứng |
| --- | --- |
| `npm run typecheck` / `npm run build` | Kiểu, route và bản build Next.js |
| `npm test` | Fixture, validation và công thức lượng. Suite DB mặc định bỏ qua khi chưa chọn DB test. |
| `npm run test:db` | Handler và PostgreSQL thật, với danh tính Auth giả lập. Đặt `OOPS_TEST_DATABASE_URL` trỏ đến DB test đã áp migration và có danh mục từ `supabase/seed.sql`. Suite tạo dữ liệu riêng, kiểm khóa và dọn theo ID sau khi chạy. |
| `npm run test:auth` | Đăng nhập Supabase dev bằng tài khoản demo và dùng cookie thật gọi `/me`, nhóm và Feed của app local đang chạy. |

`test:db` hỗ trợ PostgreSQL thử nghiệm trên loopback có bảng `auth.users` và các role Supabase, hoặc project Supabase dev được xác nhận bằng `OOPS_DEV_PROJECT_REF`. Với Supabase dev, suite dùng secret Auth để tạo và xóa tài khoản test tạm thời.

Mốc tiếp theo nối API đề nghị, thương lượng, Core Wallet/Fuji và duyệt hợp đồng vào `demandItemId` từ Feed. Quyết toán, Gemini và worker nghiệp vụ triển khai theo các mốc trong [kế hoạch 7 ngày](docs/OOPS-7-Day-Development-Plan.md).
