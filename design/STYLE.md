# OOPS Design Style — chuẩn hóa từ `ref/style-temp.png`

Nguồn: ảnh tham khảo phong cách (mobile PWA, nhóm hộ gia đình, tông cộng đồng thân thiện).
Mọi màn hình và component **bắt buộc** dùng tokens dưới đây, không hard-code màu/size.

## 1. Nguyên tắc

1. **Nền trời, thẻ trắng nổi.** Nội dung chính luôn nằm trong thẻ trắng bo lớn đặt trên nền gradient xanh trời; nền chỉ là khung, không đặt control trực tiếp lên nền.
2. **Xanh lá = hành động, navy = chữ.** Primary green chỉ dùng cho CTA và trạng thái tích cực; chữ và tiêu đề dùng navy đậm. Không dùng green cho text thường.
3. **Icon tile pastel.** Mỗi dòng/danh mục có icon đặt trong ô vuông bo tròn nền pastel (xanh nhạt, vàng nhạt, hồng nhạt…). Icon dùng một hệ Material Symbols Rounded, không trộn bộ icon khác.
4. **Bo tròn lớn, bóng rất nhẹ.** Thẻ 24px, ô nhập 16px, nút pill. Bóng chỉ để tách thẻ khỏi nền, không tạo depth mạnh.
5. **Chữ tròn, đậm ở tiêu đề.** Một family duy nhất (Nunito), tiêu đề ExtraBold, body Regular. Không all-caps, không letter-spacing kiểu corporate.

## 2. Bảng màu

| Token | Hex | Dùng |
| --- | --- | --- |
| `sky-100` | `#EAF7FE` | Đỉnh gradient nền |
| `sky-300` | `#BFE3F7` | Đáy gradient nền |
| `sky-tint` | `#E3F2FD` | Icon tile xanh, hover nhạt |
| `navy-900` | `#14385F` | Chữ chính, tiêu đề |
| `navy-600` | `#3E6B99` | Chữ phụ, mô tả |
| `green-600` | `#2FA84F` | Primary: nút CTA, tab active, tick |
| `green-700` | `#248A3F` | Nhấn nút / pressed |
| `green-100` | `#E7F5EC` | Nền tab active, badge thành công |
| `amber-tint` | `#FFF6E0` | Icon tile vàng (tiền, hạn) |
| `rose-tint` | `#FDE8EC` | Icon tile hồng (cảnh báo nhẹ, nhu cầu) |
| `surface` | `#FFFFFF` | Thẻ, nút phụ, bottom nav |
| `line` | `#E2EAF2` | Viền input, divider |
| `danger` | `#B72D39` | Lỗi, hủy, NEEDS_REVIEW |
| `warn` | `#F5A623` | Sắp hết hạn, chờ xử lý |

Trạng thái nghiệp vụ map: thành công/đã nhận → `green-600`; chờ/chưa xử lý → `warn`; lỗi/cần xử lý → `danger`; thông tin/chờ xác nhận → `navy-600` trên `sky-tint`.
Chỉ dùng `green-600/700/100` từ preset; không dùng các shade green mặc định khác của Tailwind.

## 3. Typography

- Family: **Nunito** (hỗ trợ tiếng Việt đầy đủ, nét tròn hợp phong cách). Fallback: `system-ui, sans-serif`. `<body>` dùng class `font-sans`.
- Scale (mobile), map sẵn thành class Tailwind:

| Class | Size/weight | Dùng |
| --- | --- | --- |
| `text-display` | 24 / ExtraBold(800), lh 1.25 | Tiêu đề màn |
| `text-title` | 18 / Bold(700) | Tiêu đề thẻ |
| `text-button` | 17 / Bold(700) | Chữ nút |
| `text-label` | 15 / SemiBold(600) | Label trong control |
| `text-body` | 15 / Regular(400), lh 1.5 | Body |
| `text-small` | 12.5 / SemiBold(600) | Aux, nav label, màu `navy-600` |

- Không dùng chữ ALL-CAPS cho label; nhãn viết thường có dấu.

## 4. Bo góc, bóng, spacing

- Radius: thẻ lớn `24px`; input/select `16px`; icon tile `14px`; nút chính `999` (pill); badge `999`.
- Shadow:
  - `card`: `0 8px 24px rgba(20,56,95,0.08)`
  - `nav`: `0 -4px 16px rgba(20,56,95,0.06)`
  - Nút không đổ bóng (chỉ đổi `green-700` khi pressed).
- Spacing base 4px: padding trong thẻ `16–20px`; gap giữa các dòng control `12px`; giữa các thẻ `16px`; lề màn hình `16px`.
- Chiều cao control: `48px` (`h-control`); vùng chạm tối thiểu `44px`. Thanh dưới `64px` + safe-area.

## 5. Icon (đã chốt 11/11/2026)

- Bộ icon: **Material Symbols Rounded**, weight 500, không fill — fill chỉ dùng cho mục nav đang active. Quyết định của người dùng.
- Dùng qua `<MaterialSymbol name="..." />` (`src/components/ui/MaterialSymbol.tsx`); tên icon là ligature, ví dụ `groups`, `newspaper`, `inventory_2`, `person`, `expand_more`.
- Icon tile: 44×44px, radius 14, nền pastel theo nhóm — `sky-tint` mặc định, `amber-tint` cho tiền/hạn, `rose-tint` cho nhu cầu/cảnh báo, `green-100` cho trạng thái tốt; icon 24px màu `navy-900` (tile green dùng `green-700`). Dùng `<IconTile />`.
- Icon trong nút CTA: màu theo chữ nút, 22px, đặt trước chữ.

## 6. Controls (quy ước vẽ)

- **Select/Input:** hàng trắng viền `line`, radius 16px, cao 48px; label `text-label` navy bên trái, icon tile pastel trước label; value bên phải kèm chevron `expand_more` màu `navy-600`.
- **Nút chính:** pill, nền `green-700`, chữ trắng, icon đặt trước chữ. Trong thẻ, nút có thể phủ hết chiều ngang trên mobile; từ 640px co theo nội dung, tối đa 320px.
- **Nút phụ:** nền `green-100` chữ `green-700`, hoặc trắng viền `line` chữ navy.
- **Nút phá vỡ (hủy/báo sự cố):** nền `danger` chữ trắng — `<Button variant="danger">`.
- **Điều hướng:** 4 mục (Nhóm của tôi, Nhu cầu, Đơn hàng, Tài khoản). Mục hiện tại có nền `green-100` và icon fill. Dưới 1024px dùng thanh dưới có safe-area; từ 1024px dùng thanh trên.
- **Khung nội dung:** rộng tối đa 1120px, lề 16/24/32px trên mobile/tablet/desktop. Khoảng cách giữa các khối là 16px, tăng lên 24px trên desktop.
- **ScreenHeader:** icon tile + tiêu đề `text-display` navy, subtitle `text-body` `navy-600`; nằm trực tiếp trên nền trời, thẻ nội dung trượt dưới nó.

## 7. Triển khai

- Tokens: `design/tokens.css` (CSS variables) + `design/tailwind.preset.js` map sang Tailwind; `tailwind.config` của app `presets: [require('../design/tailwind.preset')]`.
- Bộ component dùng chung: `src/components/ui/` — `Button`, `Card`, `Select`, `BottomNav`, `ScreenHeader`, `IconTile`, `MaterialSymbol`; import qua `@/components/ui`. Màn hình không tự style lại các phần này và không viết hex trong JSX; màu mới phải thêm token trước rồi mới dùng.
- Wire font khi scaffold Next.js sẵn sàng — trong `src/app/layout.tsx`:

```tsx
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet" />
```

  và `globals.css` import `design/tokens.css` + `design/material-symbols.css`.
- Gradient nền màn: `bg-[linear-gradient(180deg,var(--sky-100),var(--sky-300))]` đặt ở layout của từng trang; nền không nhận control.
