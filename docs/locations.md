# Vị trí tài khoản, nhóm và nhu cầu

Người dùng chọn nơi sinh sống khi đăng ký và có thể đổi trong màn Tài khoản. Vị trí nhóm lấy từ hồ sơ đại diện. Nhu cầu giữ vị trí tại thời điểm đăng để hiển thị trên Feed.

## Nguồn dữ liệu

`src/data/hcm-wards.json` chứa TP.HCM, mã tỉnh/thành phố `79`, và 168 đơn vị cấp xã: 113 phường, 54 xã, 1 đặc khu. Phạm vi TP.HCM sau sắp xếp gồm cả địa bàn Bình Dương và Bà Rịa–Vũng Tàu trước đây. Không yêu cầu quận/huyện trong địa chỉ mới.

Nguồn: [Công báo Chính phủ, Quyết định 19/2025/QĐ-TTg](https://congbao.chinhphu.vn/van-ban/quyet-dinh-so-19-2025-qd-ttg-45430/57441.htm), tập 921+922 ngày 18/07/2025, trang in 45–52; danh mục có hiệu lực 01/07/2025. JSON lưu SHA-256 của PDF để đối chiếu. Trích lại bằng `python scripts/import-hcm-divisions.py <PDF-tập-921-922>` với pypdf. Kiểm đủ 168 mã duy nhất và số lượng mỗi loại trước khi ghi. Không dùng bảng mã dự thảo.

## Hợp đồng và dữ liệu

- Đăng ký Supabase ghi `user_metadata.location = {provinceCode: "79", wardCode: "26743"}`. Server kiểm mã thuộc danh mục rồi lưu `profiles.province_code/ward_code` khi tạo hồ sơ. Đây là vị trí người dùng tự khai, không phải chứng minh cư trú hay quyền nhóm.
- `GET /api/v1/me` trả `displayName` và `location?`. `PATCH /api/v1/me` nhận ít nhất một trong `displayName`, `contactPrivate` và `location`. Hồ sơ cũ có thể chưa có vị trí.
- Trang Nhóm và `GET /api/v1/me` tự cấp nhóm riêng cho tài khoản chưa có nhóm. Người đó là đại diện và có thể tạo lời mời ngay. Nhận lời mời từ nhóm khác chuyển thành viên khỏi nhóm riêng nếu họ là đại diện duy nhất và đã xong các đợt gom, nghĩa vụ. Thành viên rời nhóm thành công sẽ có nhóm riêng. `GET /api/v1/groups/{id}` trả `location?` theo hồ sơ đại diện hiện tại và dùng vị trí lưu từ trước cho hồ sơ cũ chưa chọn vị trí.
- Migration `20261117000100_account_and_demand_locations.sql` tạo danh mục, khóa ngoại cho vị trí, thêm vị trí hồ sơ/nhóm và các cột snapshot trên `demand_items`. Nhóm cũ giữ mã quận/phường cũ, không tự suy đoán chuyển đổi.
- Migration `20261117000200_representative_demand_location.sql` cập nhật trigger để lấy vị trí của đại diện đang hoạt động khi đăng nhu cầu mới. Nhu cầu đã đăng giữ nguyên vị trí khi nhóm đổi đại diện hoặc đại diện đổi nơi sinh sống.
- `DemandItem` thêm `provinceCode?`, giữ `wardCode` và `districtCode` cho dữ liệu cũ. `GET /api/v1/feed?province=79&ward=26743` lọc trên vị trí đã đăng; `district` vẫn hỗ trợ dữ liệu cũ. Màn Feed cho chọn khu vực từ danh sách phường, xã, đặc khu. Chọn tất cả sẽ bao gồm cả dữ liệu cũ chưa chuyển mã.
- Địa chỉ nhà/điểm nhận cụ thể vẫn là `pickupPrivate`, không đưa lên Feed. Vị trí nhóm không lấy từ người đang xem hoặc từ hộ thành viên nhận lời mời.

Áp migration trước khi chạy code mới. Script `node --env-file=.env.local scripts/apply-location-migration.mjs` dùng cho project dev đã xác minh. Các môi trường khác áp file SQL theo quy trình migration của repo.

## Kiểm chứng

`npm test` kiểm danh mục, validation và callback. `npm run test:registration` kiểm nhóm mặc định, tạo lời mời từ nhóm một người, nhận và rời nhóm, đăng nhu cầu theo vị trí đại diện rồi lọc Feed. Script đổi vị trí hồ sơ đại diện để kiểm nhu cầu đã đăng giữ vị trí cũ. Ca publish dùng giỏ thử đã xác nhận sau khi kiểm API trả `WALLET_NOT_READY` cho tài khoản chưa có ví. Link xác nhận được tạo qua Admin API để kiểm mà không cần hộp thư.
