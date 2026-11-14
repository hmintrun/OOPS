# Cài và mở OOPS (PWA) trên điện thoại và máy tính

Mở **link HTTPS của OOPS do nhóm gửi**. Bạn có thể dùng app ngay trong trình duyệt hoặc thêm biểu tượng OOPS để lần sau mở nhanh. Nếu chỉ muốn xem thử giao diện với dữ liệu mẫu, thêm `/ui-preview/demo` vào cuối link.

## Tạo link HTTPS trên Vercel (Dev 2 / Dev 3)

PWA là một phần của ứng dụng Next.js. Khi triển khai repo, Vercel cấp link HTTPS để mở và cài OOPS. **Dev 3** phụ trách triển khai và bàn giao link. **Dev 2** hỗ trợ cấu hình môi trường nếu cần thử đăng nhập và API thật.

1. **Chọn bản code.** Lấy SHA đã review từ Dev 1. Nếu dùng nhánh `feat/a07-pwa-install`, kiểm tra commit chứa PWA đã có trên GitHub. Nếu đã merge, chọn nhánh chứa commit tích hợp đã duyệt.
2. **Mở đúng project Vercel.** Chọn team của nhóm và project **OOPS** đã kết nối repo `hmintrun/OOPS`. Nếu chưa có project, vào **Add New → Project → Import** repo, chọn **Next.js** và dùng thư mục gốc chứa `package.json`. [Kết nối GitHub với Vercel](https://vercel.com/docs/git/vercel-for-github)
3. **Tạo bản triển khai.** Với project đã kết nối GitHub, push nhánh tính năng hoặc mở pull request để Vercel tạo bản **Preview** theo cấu hình của project. Nếu cần thử dữ liệu thật, Dev 2 kiểm tra các biến trong [`.env.example`](../.env.example) và cung cấp cấu hình staging qua **Settings → Environment Variables → Preview**. Deploy lại sau khi cập nhật biến. Với project mới, Vercel dùng môi trường **Production** cho lần triển khai đầu tiên. [Môi trường triển khai Vercel](https://vercel.com/docs/deployments/environments)
4. **Lấy link.** Vào **Deployments**, chọn đúng SHA, chờ **Ready** rồi bấm **Visit**. Gửi link HTTPS gốc để cài OOPS hoặc link có đường dẫn `/ui-preview/demo` để xem dữ liệu mẫu. Nếu link có query bắt đầu bằng `?`, đặt đường dẫn trước query.
5. **Thử bằng điện thoại trước khi gửi.** Trên cùng tên miền, kiểm tra `/manifest.webmanifest` trả thông tin OOPS và `/sw.js` tải được. Cài app, bấm icon OOPS và xác nhận app mở được từ màn hình chính. Nếu Preview yêu cầu đăng nhập Vercel, dùng **Share** để cấp quyền phù hợp cho người thử. Thử lại cả lúc mở từ icon vì app khởi động ở đường dẫn `/`. [Chia sẻ bản Preview có bảo vệ](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links)

Bàn giao cho nhóm **SHA đã deploy**, **link cài OOPS**, **link demo** và kết quả thử mở từ icon.

## Điện thoại Android

1. Mở link OOPS bằng **Chrome**. Nếu link đang mở trong Zalo hoặc Messenger, chọn **Mở bằng Chrome** hoặc sao chép link sang Chrome.
2. Vào **Tài khoản → Cài OOPS** và bấm **Thêm vào màn hình chính** nếu nút xuất hiện.
3. Bạn cũng có thể bấm **⋮** trong Chrome, chọn **Cài đặt ứng dụng** hoặc mục cài đặt và tạo lối tắt, rồi xác nhận **Cài đặt**.
4. Về màn hình chính hoặc mở danh sách ứng dụng và bấm biểu tượng **OOPS**.

[Hướng dẫn Chrome trên Android](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en-2)

## iPhone

1. Mở link OOPS bằng **Safari**.
2. Bấm **Chia sẻ**. Tùy bố cục Safari, nút này có thể nằm trong menu trang.
3. Chọn **Thêm vào MH chính**. Nếu mục này chưa hiện, cuộn xuống cuối danh sách **Chia sẻ** và mở **Sửa tác vụ** để thêm mục đó.
4. Bật **Mở dưới dạng ứng dụng web** nếu có, rồi bấm **Thêm**.
5. Bấm biểu tượng **OOPS** trên màn hình chính để mở app.

[Hướng dẫn Safari trên iPhone](https://support.apple.com/en-az/guide/iphone/iphea86e5236/26/ios/26)

## Máy tính

- **Mở ngay:** dán link HTTPS của OOPS vào trình duyệt.
- **Cài bằng Chrome:** bấm biểu tượng cài đặt ở thanh địa chỉ nếu có. Bạn cũng có thể mở **⋮**, vào mục **Truyền, lưu và chia sẻ** rồi chọn **Cài đặt trang dưới dạng ứng dụng**. Sau khi cài, tìm **OOPS** trong danh sách ứng dụng trên máy.

[Hướng dẫn Chrome trên máy tính](https://support.google.com/chrome/answer/9658361?hl=en-2)

## Khi mở lại app

Biểu tượng OOPS mở trang chính của app. Nếu chưa đăng nhập, bạn sẽ thấy màn **Đăng nhập**. Để quay lại dữ liệu mẫu, mở link có đuôi `/ui-preview/demo` trong trình duyệt.

Khi OOPS báo **Mất kết nối**, kết nối lại Internet rồi bấm **Thử kết nối lại** nếu nút xuất hiện. Gửi nhu cầu và cập nhật thông tin cần có mạng.

## Thử trên máy đang chạy dự án

Nếu máy đã chạy bản demo ở cổng `4181`, mở [bản demo local](http://127.0.0.1:4181/ui-preview/demo). Địa chỉ `127.0.0.1` trỏ về thiết bị đang mở trình duyệt. Để cài và thử trên điện thoại, dùng link HTTPS của bản triển khai.
