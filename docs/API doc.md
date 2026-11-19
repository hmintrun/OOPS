# Đặc tả API OOPS MVP

Hợp đồng API cho web và worker của [OOPS MVP](requirements.md). Xem [Schema PostgreSQL](schema.md) để tra ràng buộc lưu trữ và [Kiến trúc](architecture.md) để tra vòng đời và enum trạng thái.

## Quy ước

Cập nhật 17/11/2026: hồ sơ/nhóm hỗ trợ `location`, nhu cầu thêm `provinceCode?`, Feed thêm bộ lọc `province`. Xem [hợp đồng vị trí và tương thích dữ liệu cũ](locations.md#hợp-đồng-và-dữ-liệu).

- Đường dẫn HTTP trong các bảng dùng tiền tố `/api/v1`.
- API dùng JSON, trừ upload bằng chứng qua `multipart/form-data`. API web xác thực phiên Supabase qua cookie bảo mật và nhận request cùng origin.
- ID là UUID. Thời gian theo ISO 8601 có múi giờ. Trường JSON dùng camelCase, enum viết hoa và `?` biểu thị trường có thể vắng mặt.
- Với hợp đồng, quyền đại diện dựa trên `repId` đã chụp lúc chốt. Quyền đại diện của nhóm dùng vai trò đang hoạt động.
- Các POST nghiệp vụ và thao tác ghi tiền nhận `Idempotency-Key`. Webhook payOS xác thực chữ ký. Ví ký `confirmVersion` trực tiếp trên Fuji cho phiên bản đã được người bán chấp thuận.

### Mã lỗi dùng chung

| Mã HTTP | Khi trả về |
| --- | --- |
| 401 | Thiếu phiên đăng nhập. |
| 403 | Thiếu quyền trên thao tác hoặc đối tượng. |
| 404 | Đối tượng không tồn tại hoặc cần ẩn đối tượng riêng tư. |
| 409 | Xung đột phiên bản, trạng thái hoặc khóa idempotency. |
| 422 | Dữ liệu đầu vào sai. |
| 429 | Vượt giới hạn truy cập. |
| 503 | Phụ thuộc hoặc ghi dữ liệu lỗi tạm thời. |

```json
{
  "error": {
    "code": "STATE_CONFLICT",
    "message": "Hợp đồng đã đổi trạng thái"
  },
  "requestId": "..."
}
```

## Đối tượng trả về

### Contract

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| contractId | UUID | Có | Mã hợp đồng của một món. |
| demandItemId | UUID | Có | Dòng nhu cầu được đáp ứng. |
| state | enum | Có | Xem bảng trạng thái trong [kiến trúc](architecture.md#trạng-thái-theo-dõi). |
| qty | integer | Có | Số lượng cam kết trong đơn vị SKU. |
| unit | string | Có khi đọc đơn | Đơn vị SKU theo danh mục, ví dụ `chai` hoặc `kg`. Phản hồi phát lại từ trước khi bổ sung trường này có thể thiếu `unit`. |
| myShare | object | Khi người gọi có phần trong đơn | `qty` và `goodsVnd` của phần đã chốt cho tài khoản hiện tại. |
| unitPriceVnd | integer | Có | Đơn giá, kể cả 0. |
| goodsVnd | integer | Có | Tổng tiền hàng do backend tính. |
| depositVnd | integer | Có | Cọc do người bán nộp. |

Contract còn có sourceVersionId, version, sellerId, repId, depositDueAt, paymentDueAt?, handoffStart, handoffBy, approvalDueAt, readyAt?, allocations, charges, disbursements, evidenceIds?, receipt?, termination?, reviewScope?, handoffPrivate? và repContact?. `reviewScope` là `HANDOFF` hoặc `DEPOSIT` khi `NEEDS_REVIEW`. Allocation có allocationId, qty, goodsVnd và householdName? dành cho đại diện. Các phần được xếp theo thời điểm chọn Có trong vòng đã chốt. Phần thiếu mốc vote được xếp trước theo ID phân bổ. Người bán và đại diện của hợp đồng thấy evidenceIds ngay khi đã lưu bằng chứng, kể cả trước khi lập biên nhận. Khoản thu hoặc chi có ID, kind, amountVnd, state và dueAt hoặc postedAt?.

Đơn theo luồng mới có `roundId` và `roundOpenBy`. Sau khi xác minh vòng đã mở trên Fuji, API trả `confirmBy`, `depositDueAt`, `dueAt` của khoản thu và `paymentDueAt` nếu đơn có giá. Khoản thu của người gọi có `canPay` cho biết khoản đang chờ, còn hạn và đã đủ điều kiện ký tương ứng. Dùng `canPay` để hiển thị nút thu SIM, sau đó tải lại Contract để lấy tiến độ mới. Server kiểm lại điều kiện khi ghi thu.

### Campaign, DemandItem và Cart

Campaign gồm campaignId, state, collectUntil và needBy. DemandItem gồm demandItemId, campaignId, skuId, name, unit, districtCode, wardCode, needBy, supportRequested, target, pending, reserved, received, missing, offerable và state. Cart gồm cartId, version, state, householdSize, supportRequested và lines theo dữ liệu PUT.

Giao diện dùng `offerable` để hiện số lượng còn có thể chốt, kể cả khi hợp đồng mới tạo đang chờ ký và thu. `missing` là lượng còn thiếu sau khi trừ phần đã giữ chính thức và phần đã nhận. API chào hàng vẫn dùng `missing` làm giới hạn để hỗ trợ đề nghị dự phòng.

`needQty` là lượng còn thiếu. Ví dụ hộ đang có 3 chai và cần thêm 7 chai thì gửi `stockQty: 3, needQty: 7`. Khi đăng nhu cầu, cộng trực tiếp `needQty` của các giỏ đã xác nhận.

### Receipt và Offer

Receipt gồm receiptId, version, handedAt, lines, evidenceIds, state và approvals với role, approvedAt. Offer gồm proposalId, demandItemId, state, terms theo dữ liệu POST, goodsVnd, depositVnd, draftId?, voteDueAt? và canOpenDraft?.

Đề nghị mới trả ngay `draftId` và `voteDueAt` (`canOpenDraft` là `false`). `draftId` dùng để đọc bản đã chụp và gửi phản hồi của người bán, còn `proposalId` dùng cho API bỏ phiếu.

`terms.handoffPrivate` chỉ trả cho người bán của đề nghị và đại diện đang hoạt động của nhóm. Tổng tiền hàng và cọc dự kiến trong Offer tính trên lượng chào.

`Receipt.scheduledHandoffBy` là hạn giao chụp khi lập biên nhận. Hệ thống so sánh `handedAt` với mốc này để xét giao muộn.

### Draft, DraftVersion, ConfirmationRound và Termination

Trong các kiểu dưới đây, `Uuid` là chuỗi UUID, `IsoDateTime` là chuỗi ISO 8601 có múi giờ và `UInt` là số nguyên không âm trong giới hạn số nguyên an toàn của JSON client. Trường `?` được bỏ khỏi JSON khi chưa có dữ liệu hoặc người gọi không có quyền. Các DTO này không dùng `null`.

```ts
type LineAmount = { qty: UInt; goodsVnd: UInt };
type MyLine = LineAmount & { note?: string };

type Draft = {
  draftId: Uuid;
  proposalId: Uuid;
  editRevision: UInt;
  draftOpen: boolean;
  qty: UInt;
  totalVnd: UInt;
  myLine?: MyLine;
  latestVersion?: DraftVersion;
  permissions?: { editLine: boolean; manageDraft: boolean; finalize: boolean };
};

type SellerDraftView = {
  draftId: Uuid;
  proposalId: Uuid;
  latestVersion: DraftVersion;
};

type DraftVersion = {
  versionId: Uuid;
  version: UInt;
  versionHash: string;
  state: "SUBMITTED" | "CHANGES_REQUESTED" | "REJECTED"
    | "AWAIT_CONFIRMATIONS" | "AWAIT_REP_APPROVAL"
    | "EXPIRED" | "STOCK_CONFLICT" | "FINALIZED";
  reasonCode?: "SELLER_TIMEOUT" | "CONFIRMATION_TIMEOUT" | "FINALIZE_TIMEOUT";
  qty: UInt;
  unitPriceVnd: UInt;
  totalVnd: UInt;
  handoffStart: IsoDateTime;
  handoffBy: IsoDateTime;
  sellerNote?: string;
  sellerResponseDueAt: IsoDateTime;
  confirmBy?: IsoDateTime;
  repApproveBy?: IsoDateTime;
  roundId?: Uuid;
  contractId?: Uuid;
  myLine?: MyLine;
  lines?: LineAmount[];
};

type ConfirmationRound = {
  roundId: Uuid;
  versionId: Uuid;
  versionHash: string;
  roundKey: string;
  chainId: UInt;
  contractAddress: string;
  state: "OPENING" | "OPEN" | "CONFIRMED" | "CLOSED";
  confirmBy?: IsoDateTime;
  requiredCount: UInt;
  confirmedCount: UInt;
  myConfirmation?: {
    walletAddress: string;
    state: "PENDING" | "CONFIRMED";
  };
};
```

- `Draft.qty` và `Draft.totalVnd` là tổng của bản nháp đang sửa. `Draft.myLine` chỉ chứa dòng nháp của hộ gọi API. Seller chỉ nhận `SellerDraftView` và nhận `404` nếu chưa có bản gửi.
- `canOpenDraft` trên `GET /needs/{id}/offers` và `permissions` (`editLine`, `manageDraft`, `finalize`) trên `GET /drafts/{id}` áp dụng cho đề nghị/nháp cũ không có `voteDueAt` (khi `editLine`/`manageDraft`/`finalize` bật theo quyền và vai trò để sửa nháp hoặc đại diện `finalize`). Đề nghị mới từ `POST /needs/{id}/offers` trả ngay `draftId` và `voteDueAt` (`canOpenDraft` luôn `false`, `permissions` đều `false` cho `editLine`, `manageDraft`, `finalize`) và dùng `GET/POST /offers/{id}/vote` cùng `POST /drafts/{id}/vote-close`; khi người bán chấp thuận thì chốt trực tiếp không qua đại diện `finalize`. Giao diện dùng các trường này cùng trạng thái hiện tại để hiển thị thao tác; API ghi vẫn kiểm quyền khi nhận yêu cầu.
- `DraftVersion` chứa dữ liệu đã chụp khi gửi. `version` bắt đầu từ 1 và là số dùng trong route `/versions/{version}`. Hộ có phần nhận `myLine` của mình. Seller của đề nghị và đại diện có quyền duyệt nhận `lines` gồm lượng và tiền theo từng phần. Các dòng trả cho người duyệt không chứa ghi chú riêng, định danh hộ hoặc địa chỉ ví. Nếu đại diện cũng có phần, `myLine` vẫn chỉ chứa phần của đại diện.
- `roundId` xuất hiện khi đã tạo vòng. Với vòng mới, `confirmBy` xuất hiện sau khi xác minh vòng đã mở trên Fuji. `contractId` xuất hiện khi đã chốt. `repApproveBy` chỉ áp dụng cho bản theo luồng cũ. `versionHash` và `roundKey` là hai chuỗi `0x` theo sau bởi 64 ký tự hex chữ thường. [Chuẩn băm và vector kiểm thử](OOPS-Spec.md#chuẩn-băm-phiên-bản) · [Cách sinh roundKey](architecture.md#bàn-giao-backend-và-worker)
- `myConfirmation` chỉ trả trạng thái và ví của chính hộ gọi. `myConfirmation.state = CONFIRMED` sau khi worker lưu xác nhận hợp lệ của hộ. Backend dùng tập xác nhận của từng hộ để xét điều kiện bàn giao.
- `Contract.termination` chỉ trả yêu cầu đang chờ cho người gọi có quyền xem. Dữ liệu gồm terminationId, baseVersion, proposedBy, reason, state và note?.

## Tài khoản nhóm và giỏ

- `members` gồm các phần tử `{membershipId, userId, displayName, role}`. Role của nhóm là `MEMBER` hoặc `REP`. `repId` là userId của đại diện.
- Link vào nhóm chứa mã 8 ký tự tại `/join?token=…`. Đại diện lấy lại cùng link và mã cho mỗi nhóm. Người nhận có thể dán link hoặc nhập mã, không phân biệt hoa thường. Frontend gửi giá trị đến `POST /invites/accept` sau khi có phiên. Lời mời chỉ định tài khoản, lời mời REP và link JOIN cũ vẫn dùng một lần trong 24 giờ.
- `category` nhận `WATER`, `FOOD` hoặc `ESSENTIALS`.
- GET giỏ trả `404` nếu chưa tạo. PUT tạo với `version: 0` và trả bản đã lưu ở version 1. Lưu kèm `includeInNeeds: true` có thể ghi giỏ `CONFIRMED` ngay trong cùng lần tăng version. Phát lại cùng khóa idempotency trả kết quả cũ.
- AI trả `draft: {householdSize?, lines: [{skuId, stockQty?, needQty?}]}`, `unresolved: string[]` và `ruleRefs: string[]`. Mỗi dòng có ít nhất một lượng được trích rõ. Thiếu lượng, SKU hoặc đơn vị khớp được đưa vào `unresolved`. Người dùng nhập đủ trước khi lưu giỏ. `ruleRefs` rỗng khi chỉ trích dữ liệu đã nhập.
- Khi hộ chưa nêu số chai muốn mua, server lấy mốc 3 lít nước uống/người/ngày, điều chỉnh theo mức độ cấp thiết, làm tròn lên theo chai 500 mL, rồi trừ số chai đang có cùng dung tích. [Tài liệu chuẩn bị ứng phó của WHO](https://applications.emro.who.int/dsaf/libcat/WHO_CBDRM_Participants_Work_Book_Module_2_EN.pdf?ua=1#page=9)
- `householdStatus` là tùy chọn và nhận `{members, adults, children, elderly, housingType, incomeLevel?, notes}` từ phần Hiện trạng gia đình đã lưu theo tài khoản trên trình duyệt. `members` từ 1 đến 30. Mỗi nhóm tuổi từ 0 đến 20. `housingType` nhận `kienco`, `bankienco`, `cap4`, `vungtrung`. `incomeLevel` nhận `low`, `medium`, `high`. `notes` tối đa 1.000 ký tự. Khi có hiện trạng, Gemini dùng ngữ cảnh này kể cả khi `text` trống. Lượng đang có và lượng muốn mua ưu tiên mô tả hiện tại. Mức thu nhập dùng để ưu tiên mặt hàng, không thay đổi quyền được hỗ trợ.

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `GET /me` và `PATCH /me`<br>Đã đăng nhập | Cấp nhóm riêng nếu tài khoản chưa có nhóm. PATCH nhận ít nhất một trong `displayName` (1–80 ký tự sau khi bỏ khoảng trắng đầu/cuối), `contactPrivate`, `location` ({provinceCode, wardCode} thuộc danh mục TP.HCM). Số điện thoại thêm hoặc đổi trong `contactPrivate` phải có đúng 10 chữ số. | 200 {userId, displayName, groupId, location?, wallet?: {address, verificationState}, confirmationEligible, confirmationEligibilityUnavailable?, contactPrivate?}. verificationState là PENDING, VERIFIED hoặc FAILED. Khi Fuji không phản hồi, hồ sơ vẫn tải được với `confirmationEligible: false` và `confirmationEligibilityUnavailable: true`. |
| `POST /wallet/embedded-session`<br>Chủ phiên | Cấp phiên khôi phục ví Openfort dùng một lần cho mọi tài khoản OOPS đã đăng nhập. Chỉ bật trong cấu hình Fuji testnet. | 200 {userId, encryptionSession}, 404 nếu tính năng tắt hoặc khóa không phải test (`pk_test_`), 503 khi dịch vụ ví bận. Phản hồi không cache (`no-store`). |
| `POST /wallet/link`<br>Chủ phiên | {address, proofTx, nonce}. GET /wallet/challenge cấp nonce một lần và expiresAt. Fuji ghi hash thử thách gắn với ví. | 202 {verificationState}. GET /me cho biết kết quả. 422 nếu bằng chứng sai. Khi lưu thay đổi ví, 409 `ACTIVE_COMMITMENT` nếu còn nghĩa vụ theo [G-09](OOPS-Spec.md#66-rời-nhóm-và-đổi-ví-g-09). |
| `GET /groups/{id}`<br>Thành viên | id là groupId. | 200 {groupId, repId, members, campaigns: Campaign[]}. Ẩn điểm nhận cụ thể với hộ chưa chốt. |
| `POST /groups/{id}/leave`<br>Thành viên tự rời | {}. Xem [G-09](OOPS-Spec.md#66-rời-nhóm-và-đổi-ví-g-09). | 200 {groupId, membershipId, leftAt}. 409 `REP_TRANSFER_REQUIRED`, `ACTIVE_COMMITMENT` hoặc `PUBLISHED_NEED_ACTIVE`. 404 nếu người gọi không còn là thành viên. |
| `POST /groups/{id}/invites`<br>Đại diện | {kind: JOIN hoặc REP, targetUserId?}. REP bắt buộc có targetUserId đang trong nhóm. | 201 {inviteId, inviteUrl, joinCode} với JOIN không chỉ định tài khoản. Lời mời một lần trả {inviteId, inviteUrl, expiresAt}. |
| `POST /invites/accept`<br>Người được mời | {token}. JOIN áp dụng cho tài khoản chưa có nhóm hoặc là đại diện duy nhất của nhóm đã xong đợt gom và nghĩa vụ. REP kiểm tra đúng tài khoản đích. | 200 {groupId, membershipId, role}. 409 nếu lời mời hoặc điều kiện chuyển nhóm không hợp lệ. |
| `POST /groups/{id}/campaigns`<br>Đại diện | {collectUntil, needBy, supportRequested?}. Kiểm tra thời điểm hiện tại < collectUntil < needBy. | 201 Campaign ở DRAFT. |
| `GET /catalog`<br>Đã đăng nhập | category? | 200 {items: [{skuId, name, category, unit}]}. |
| `GET /campaigns/{id}/cart` và `PUT /campaigns/{id}/cart`<br>Hộ trong nhóm | PUT {householdSize, supportRequested, lines: [{skuId, stockQty, needQty}], version, includeInNeeds?}. version = 0 để tạo. householdSize > 0, stockQty ≥ 0, needQty ≥ 0. | 200 Cart. PUT lưu `CONFIRMED` khi `includeInNeeds: true` và ví đã xác minh, đủ điều kiện Fuji. Nếu chưa đủ điều kiện, PUT vẫn lưu `DRAFT`. Khi Fuji không phản hồi, PUT trả thêm `confirmationEligibilityUnavailable: true`. 409 nếu version cũ, đã đăng hoặc đã tới hạn gom. 422 nếu số lượng sai. |
| `POST /campaigns/{id}/cart/ai`<br>Hộ trong nhóm | {text?, householdSize?, days?, householdStatus?}. Chỉ trong thời gian gom. Trích dữ liệu, mặc định các sản phẩm chưa nêu là chưa có (`stockQty = 0`), đối chiếu SKU và suy luận lượng theo ngữ cảnh hoặc áp quy tắc theo số ngày dự trữ (`days`, mặc định 3 ngày), kèm 1 câu động viên ngắn. | 200 {draft, encouragement?, unresolved, ruleRefs}. 409 nếu đã đóng gom. 503 khi AI lỗi. Hộ tiếp tục nhập tay. |
| `POST /campaigns/{id}/cart/confirm`<br>Chủ giỏ | {version}. Đợt còn DRAFT, chưa tới collectUntil và ví đã xác minh, đủ quyền Fuji. | 200 Cart ở CONFIRMED. 409 nếu version cũ hoặc đã đóng gom. `409 WALLET_NOT_READY` giữ giỏ đã lưu để hộ xử lý ví rồi thử lại. 503 khi dịch vụ kiểm quyền Fuji không sẵn sàng. |

## Nhu cầu, đề nghị và xác nhận hợp đồng

`GET /campaigns/{id}/needs` trả `campaignState` cùng danh sách `items`. Với `DRAFT`, đại diện xem danh sách xem trước gồm `skuId`, `name`, `unit`, `target` và `supportRequested` tính từ giỏ đã xác nhận. Hộ khác chỉ thấy phần của mình. Khi `PUBLISHED`, các dòng là `DemandItem`, kèm `myShare?: {target, pending, reserved, received}` của người gọi và `activeRounds: [{roundId, demandItemId, state}]` cho các vòng đang mở mà người gọi được xem trong nhóm.

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `POST /campaigns/{id}/publish`<br>Đại diện | {}. Trước needBy, khóa đợt, đóng gom và chụp các giỏ đã xác nhận trong cùng giao dịch. | 200 {campaignId, items: DemandItem[]}. 422 nếu không có lượng cần. |
| `GET /campaigns/{id}/needs`<br>Thành viên nhóm | id là campaignId. | 200 {campaignState, items, activeRounds}. activeRounds rỗng khi còn DRAFT. |
| `GET /feed`<br>Đã đăng nhập | district?, ward?, category?, cursor?, limit?. limit mặc định 20, tối đa 50. | 200 {items: DemandItem[], nextCursor?}. Chỉ đợt đã đăng, còn hạn và missing > 0. offerable có thể bằng 0 khi đơn đang giữ lượng tạm. |
| `POST /needs/{id}/offers`<br>Người bán | {qty, unitPriceVnd, supportOffer, handoffStart, handoffBy, handoffPrivate}. Lượng dương đến missing, kể cả khi offerable bằng 0. | 201 Offer có draftId và voteDueAt. 409 nếu vượt missing, người bán là đại diện của nhóm mua hoặc lịch giao không đủ thời gian theo [cấu hình](architecture.md#trạng-thái-thương-lượng-và-thời-hạn). 503 nếu thiếu cấu hình hợp lệ. |
| `GET /needs/{id}/offers`<br>Thành viên nhóm hoặc người bán | id là demandItemId. Người bán chỉ đọc đề nghị của mình. Thành viên chỉ đọc đề nghị trong nhóm. | 200 {items: Offer[]}. Địa chỉ và liên hệ lọc theo quyền. |
| `GET /offers`<br>Người bán | Danh sách đề nghị do tài khoản hiện tại gửi, trước khi đề nghị có hợp đồng. Nhận cursor? và limit?. | 200 {items: SentOffer[], nextCursor?}. SentOffer là Offer có thêm itemName và unit. Chi tiết nơi giao xem trong trang đề nghị. |
| `GET /offers/{id}/vote`<br>Hộ có phần nhu cầu hoặc người bán | id là proposalId. | 200 OfferVoting. |
| `POST /offers/{id}/vote`<br>Hộ có phần nhu cầu | Có: {round, choice: "YES", qty, unitPriceVnd}. Gửi qty đúng bằng availableQty vừa hiển thị. Không: {round, choice: "NO"}. | 200 OfferVoting. 409 nếu vòng đóng, số vòng cũ hoặc lượng/giá đã đổi. Khi lượng đổi, đọc lại GET và để hộ chọn lại. |
| `POST /drafts/{id}/vote-close`<br>Người bán | {round}. Dùng để xử lý vòng đã tới hạn khi worker chưa chạy. | 200 {closed: boolean}. true khi vừa đóng vòng. false nếu vòng chưa đến hạn, đã đóng hoặc số vòng cũ. |
| `POST /offers/{id}/draft`<br>Hộ có nhu cầu | {}. Hộ khởi tạo mở nháp cho đề nghị còn hiệu lực. Seller của đề nghị không tham gia mua. | 201 Draft. 409 nếu đã có hồ sơ, đề nghị đã đóng hoặc còn dưới 30 giờ trước lúc bắt đầu giao. |
| `GET /drafts/{id}`<br>Thành viên liên quan hoặc seller | id là draftId. | 200 Draft cho thành viên liên quan hoặc SellerDraftView cho seller. |
| `PUT /drafts/{id}/my-line`<br>Hộ có nhu cầu | {qty, note?, editRevision}. qty bằng 0 bỏ phần của hộ. Lượng góp tối đa là nhu cầu đã đăng của hộ cho món. Nháp mới có editRevision 0. | 200 Draft với editRevision tăng 1. 409 nếu revision cũ, nháp đã khóa, đề nghị hết hạn hoặc còn dưới 30 giờ trước lúc bắt đầu giao. |
| `POST /drafts/{id}/submit`<br>Hộ khởi tạo | {editRevision}. Chụp bản có tổng dương, không vượt lượng chào, lịch còn hợp lệ. Server tính tiền và băm bản đã chụp. | 201 DraftVersion ở SUBMITTED. Hạn phản hồi là lúc gửi + 6 giờ. Nếu từ hạn phản hồi đến lúc bắt đầu giao còn dưới 24 giờ, trả 409 và giữ nháp mở. [Quy tắc thời hạn](OOPS-Spec.md#8-thời-hạn) |
| `POST /drafts/{id}/versions/{version}/seller-response`<br>Người bán | {action: APPROVE, REJECT hoặc REQUEST_CHANGES, note?}. Chỉ dùng bản SUBMITTED còn hạn. APPROVE kiểm ví và lượng từng hộ. REQUEST_CHANGES mở vòng phiếu mới cho đề nghị nếu lịch còn đủ thời gian. | 200 DraftVersion. Với đề nghị mới, APPROVE trả FINALIZED kèm contractId và roundId. Đơn ở AWAIT_COMMITMENTS, vòng ở OPENING. 409 WALLET_NOT_READY giữ bản SUBMITTED. 409 STOCK_CONFLICT ghi trạng thái xung đột lượng. 503 nếu thiếu cấu hình hoặc RPC Fuji lỗi. |
| `POST /drafts/{id}/revise`<br>Hộ khởi tạo | {version}. Chỉ từ CHANGES_REQUESTED, EXPIRED hoặc STOCK_CONFLICT khi đề nghị còn mở và còn ít nhất 30 giờ trước giờ giao. | 200 Draft mở để sửa từng phần, editRevision tăng 1. Lần submit tiếp theo tạo version mới. 409 khi bản hoặc lịch không còn hợp lệ. |
| `GET /rounds/{id}`<br>Các bên được xem bản | id là roundId. | 200 ConfirmationRound. |
| Giao dịch confirmVersion trên Fuji<br>Ví của hộ trong snapshot | confirmVersion(roundKey, versionHash). Contract kiểm vòng, hash, ví, hạn và lượt xác nhận duy nhất. | Event VersionConfirmed(roundKey, versionHash, wallet). Khi xác nhận của hộ được lưu, hộ có thể nộp tiền hàng của mình nếu còn hạn. |
| `POST /drafts/{id}/versions/{version}/finalize`<br>Đại diện | {}. Kiểm đúng bản, đủ xác nhận, thời hạn và lượng khả dụng trong transaction. | 201 Contract ở AWAIT_DEPOSIT. Nếu thiếu lượng, lưu STOCK_CONFLICT và outbox rồi trả 409. Gửi lại với cùng khóa idempotency trả kết quả trước đó. |
| `GET /contracts` và `GET /contracts/{id}`<br>Các bên liên quan | Danh sách hỗ trợ role=buyer hoặc seller, state?, cursor?, limit?. | 200 {items: Contract[], nextCursor?} hoặc Contract. Trả phần và khoản tiền theo quyền. |

Các route mở nháp, sửa dòng, submit, revise và đại diện finalize trong bảng phục vụ đề nghị cũ không có `voteDueAt`. Với dữ liệu cũ, APPROVE trả `AWAIT_CONFIRMATIONS` và sau khi đủ xác nhận, đại diện dùng finalize.

`OfferVoting` gồm `{draftId, round, dueAt, open, seller, totalQty, unitPriceVnd, myQty?, availableQty?}`. `myQty: 0` là phiếu Không, trường vắng mặt nghĩa là chưa bỏ phiếu. `availableQty` trả cho hộ có quyền khi vòng mở. Hộ có thể đổi phiếu trong vòng đang mở. Khi đủ lượng chào hoặc tới hạn, backend đóng vòng và chụp phiên bản nếu còn hộ tham gia. Người bán đọc kết quả chốt từ `latestVersion.qty` và `latestVersion.totalVnd` của `GET /drafts/{id}`.

Ví dụ đề nghị chào 10 chai, khi đóng phiếu có ba hộ chọn Có với phần 2+2+3. Ở giá 2.000đ/chai, bản chụp có `qty: 7`, `totalVnd: 14000`, cọc là 50.000đ. Với nhu cầu 12 chai, sau khi người bán chốt 7 chai, Feed trả `pending: 7`, `missing: 12` và `offerable: 5` nếu chưa có đơn khác. Khi đủ chữ ký và thu, Feed trả `reserved: 7` và `missing: 5`.

Ví dụ cấu trúc `latestVersion` cho hộ có phần 2 chai, dùng dữ liệu từ [vector kiểm thử 10→7](OOPS-Spec.md#chuẩn-băm-phiên-bản). Mỗi bản mới lấy `versionHash` thực tế từ API.

```json
{
  "versionId": "bf05cd2b-5143-41f0-91d6-8332c6b8257f",
  "version": 1,
  "versionHash": "0x93c0fedb2c764bfdea295f6815462007329bf9dd2fb33b72b1707749c028ce7b",
  "state": "SUBMITTED",
  "qty": 7,
  "unitPriceVnd": 2000,
  "totalVnd": 14000,
  "handoffStart": "2026-11-18T15:00:00+07:00",
  "handoffBy": "2026-11-18T16:00:00+07:00",
  "sellerResponseDueAt": "2026-11-17T15:00:00+07:00",
  "myLine": {"qty": 2, "goodsVnd": 4000}
}
```

Ví dụ seller gửi `POST /drafts/{id}/versions/1/seller-response` với `Idempotency-Key: approve-v1-attempt-1` và body `{"action":"APPROVE"}`. Nếu một hộ có phần chưa đủ điều kiện Fuji, API trả `409`:

```json
{
  "error": {
    "code": "WALLET_NOT_READY",
    "message": "Có hộ chưa đủ điều kiện xác nhận trên Fuji"
  },
  "requestId": "9a4d1905-be5d-4898-8d21-deaa40504639"
}
```

Giữ phiên bản ở `SUBMITTED`. Khi điều kiện ví đã thay đổi, người bán thực hiện lần duyệt mới với khóa mới. API dùng `409 STOCK_CONFLICT` khi lượng không đủ ở bước người bán chốt đề nghị mới và `409 STATE_CONFLICT` khi thao tác không hợp lệ với trạng thái, phiên bản hoặc hạn hiện hành.

## Thanh toán và bàn giao

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `POST /charges/{id}/checkout` (sau demo)<br>Người nộp | {}. Server dùng số tiền theo phiên bản hợp đồng hiện tại và ghi mốc bắt đầu thu trước khi gọi dịch vụ tạo QR. id lấy từ Contract. | 200 {chargeId, mode, state, amountVnd, qrCode?, checkoutUrl?, dueAt}. 409 khi khoản đã hết hạn. |
| `POST /webhooks/payos` (sau demo)<br>payOS ký payload | Payload code, success, data, signature. Kiểm tra chữ ký và kết quả giao dịch. Đối chiếu orderCode, paymentLinkId, reference, VND và amount. | 200 sau khi ghi sự kiện hợp lệ, kể cả ca đến trễ, nộp thêm hoặc gửi lặp. Một khoản thu chỉ áp dụng một giao dịch khớp và đủ trước hạn khi còn PENDING, hợp đồng đang ở bước tương ứng. 400 chữ ký sai. 503 lỗi ghi tạm thời. |
| `POST /demo/charges/{id}/receive`<br>Người nộp trong demo | {}. Với đơn AWAIT_COMMITMENTS, người bán nộp cọc khi vòng Fuji đã mở hợp lệ. Mỗi hộ nộp tiền hàng sau khi chữ ký của chính hộ được xác minh. | 200 {chargeId, state}. Phát lại khoản đã thu trả kết quả đã ghi. 409 nếu khoản chưa đủ điều kiện, đã đóng hoặc quá hạn. Khi hết hạn, backend có thể ghi hủy và lập hoàn trước khi trả 409. |
| `POST /contracts/{id}/ready`<br>Người bán | {}. Trong AWAIT_HANDOFF và trước lúc bắt đầu giao. | 200 Contract có readyAt. Gửi thông báo sẵn sàng. |
| `POST /contracts/{id}/evidence`<br>Người bán | multipart/form-data với trường `file` chứa một ảnh PNG, JPEG hoặc WebP, tối đa 5 MiB. | 201 {evidenceId}. 409 nếu trạng thái không cho ghi bằng chứng hoặc cùng khóa idempotency dùng cho ảnh khác. 413 nếu vượt giới hạn. |
| `GET /evidence/{id}`<br>Người bán hoặc đại diện của hợp đồng | id lấy từ evidenceIds của hợp đồng. | 200 {url, expiresAt}. URL ký có hạn. 404 khi bằng chứng không thuộc hợp đồng người gọi được xem. |
| `POST /contracts/{id}/receipts`<br>Đại diện | {handedAt?, lines: [{allocationId, receivedQty}], evidenceIds}. Nếu bỏ qua `handedAt`, máy chủ ghi giờ gửi biên nhận. Mỗi allocation phải xuất hiện đúng một lần và lượng thực nhận từ 0 đến lượng đã chốt. | 201 Receipt. Hệ thống cập nhật trạng thái hợp đồng trong cùng giao dịch. 409 nếu trạng thái không cho lập biên nhận. 422 nếu thời điểm, dòng hàng hoặc bằng chứng sai. |
| `POST /receipts/{id}/approve`<br>Người bán hoặc đại diện | {version}. Role lấy từ hợp đồng. Chỉ duyệt phiên bản DRAFT hiện hành khi AWAIT_APPROVAL hoặc NEEDS_REVIEW với reviewScope HANDOFF và còn đủ điều kiện bàn giao. Hai bên có thể thống nhất kết quả sau hạn duyệt. | 200 Receipt với trạng thái hai lượt duyệt. Lượt duyệt thứ hai ghi lượng nhận và giải phóng lượng giữ đúng một lần. |

Đơn mới tự chuyển `AWAIT_COMMITMENTS → AWAIT_HANDOFF` khi đủ chữ ký, cọc và tiền hàng nếu có. Đơn 0đ chỉ có khoản `DEPOSIT`. Quá hạn mà thiếu điều kiện thì backend hủy đơn, giải phóng lượng và lập hoàn các khoản đã thu. Frontend tải lại Contract sau `409` từ API thu hoặc hủy để hiển thị trạng thái và khoản hoàn mới nhất.

Bằng chứng, lập biên nhận và duyệt yêu cầu lượng đã chuyển sang `RESERVED` sau khi đủ điều kiện bàn giao. Ghi bằng chứng hoặc lập biên nhận chỉ khi `AWAIT_HANDOFF`, `AWAIT_APPROVAL` hoặc `NEEDS_REVIEW` với phạm vi `HANDOFF`. `handedAt` là giờ thực tế, từ lúc đã đủ điều kiện bàn giao đến thời điểm hiện tại. Các bằng chứng phải thuộc cùng hợp đồng. Biên nhận có lượng nhận dương cần ít nhất một bằng chứng của người bán.

Lập biên nhận đúng hạn ở `AWAIT_HANDOFF` chuyển hợp đồng sang `AWAIT_APPROVAL` trong cùng giao dịch. Nếu quá hạn bàn giao mới lập bản đầu tiên, quá hạn duyệt hoặc đã ở `NEEDS_REVIEW` với phạm vi `HANDOFF`, hợp đồng ở `NEEDS_REVIEW` cho đến khi hai bên cùng duyệt. Thay bản nháp chuyển bản cũ sang `SUPERSEDED`. Hai bên duyệt lại từ đầu trên bản mới, lượt duyệt cũ được lưu để đối chiếu.

Giao đủ, đúng hạn hoàn toàn bộ cọc. Với giao thiếu hoặc muộn có đồng thuận, chi phần thực nhận và hoàn phần thiếu từ khoản thu của từng hộ. Nếu chỉ còn bất đồng về cọc, trả hợp đồng ở NEEDS_REVIEW với `reviewScope = DEPOSIT`, vẫn ghi lượng nhận và xử lý các khoản tiền hàng đã xác định. Nếu hủy do hộ quá hạn thanh toán, demo hoàn cọc.

Checkout QR và webhook trong mục này phục vụ tích hợp sau demo. MVP chạy bằng SIM. [Tài liệu API payOS](https://payos.vn/docs/api/)

## Xử lý sự cố và thông báo

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `POST /contracts/{id}/issues`<br>Người bán hoặc đại diện | {reasonCode, note?}. Mã nhận `QUANTITY_MISMATCH`, `NO_SHOW`, `UNSAFE_HANDOFF` hoặc `CONFLICTING_EVIDENCE`. | 200 Contract ở NEEDS_REVIEW với reviewScope HANDOFF. Giữ lượng và tạm dừng chi, hoàn. Lệch lượng, bằng chứng mâu thuẫn hoặc báo NO_SHOW khi bản đang ghi lượng nhận dương chuyển biên nhận DRAFT hiện hành sang SUPERSEDED. Thông báo bên kia. |
| `POST /contracts/{id}/cancel`<br>Người bán | {reason}. Khi đang AWAIT_COMMITMENTS hoặc AWAIT_HANDOFF, hoặc AWAIT_DEPOSIT / AWAIT_PAYMENT với đơn cũ. Đơn chưa có bằng chứng, biên nhận hay sự cố bàn giao. | 200 Contract. Giải phóng lượng và lập hoàn tiền hàng. Cọc chưa rõ thì NEEDS_REVIEW với reviewScope DEPOSIT. 409 khi đã có dấu hiệu bàn giao, tranh chấp hoặc hợp đồng phải xử lý theo nhánh quá hạn thu. |
| `POST /contracts/{id}/terminations`<br>`POST /terminations/{id}/accept`<br>Hai bên hợp đồng | Đề xuất {version, reason: EXCUSED_CANCEL, note?}. Bên kia duyệt {} nếu hai bên đồng ý hủy theo điều khoản. Khi đề xuất và duyệt, hợp đồng phải còn PENDING hoặc RESERVED về lượng, chưa có biên nhận được áp dụng. | 201 {terminationId, state} hoặc 200 Contract. Giải phóng lượng đúng một lần và hoàn theo điều khoản. 409 nếu phiên bản đã đổi, biên nhận đã được áp dụng hoặc hợp đồng phải xử lý theo nhánh quá hạn thu. |
| `GET /ops/disbursements`<br>Tài khoản vận hành | state=PENDING, cursor?, limit?. | 200 {items: [{disbursementId, contractId, kind, amountVnd, state}], nextCursor?}. |
| `POST /ops/disbursements/{id}/post`<br>Tài khoản vận hành | {transferRef}. Demo dùng mã chuyển SIM duy nhất cho khoản đủ điều kiện. Kiểm và ghi dưới khóa của hợp đồng và khoản chi. | 200 {disbursementId, state: POSTED, contractState}. Gửi lại cùng mã của cùng khoản trả kết quả đã ghi. 409 nếu mã thuộc khoản khác, khoản bị khóa hoặc khoản đã POSTED bằng mã khác. |
| `GET /notifications`<br>`PATCH /notifications/{id}`<br>Chủ thông báo | GET cursor?, limit?. PATCH {read: true}. | GET trả `items`, tổng `unreadCount` qua mọi trang và `nextCursor?`. Mục có `title`, `detail`, `icon`, cùng `itemName?`, `href?` và `createdAt?`. PATCH trả mục với `readAt`. |

Đổi giá/lượng và đổi lịch sau khi chốt thuộc phạm vi sau demo.

Khi ops ghi khoản cuối cùng đã POSTED, transaction đưa đơn SETTLING sang COMPLETED nếu mọi khoản bắt buộc đã được ghi và không còn khoản bị khóa.

Job xử lý hạn seller, xác nhận Fuji và đại diện duyệt theo [bảng trạng thái](architecture.md#trạng-thái-thương-lượng-và-thời-hạn). Job cũng nhắc hạn cọc, tiền hàng, báo sẵn sàng và giờ nhận. Khi hết hạn bàn giao mà chưa có biên nhận hoặc hết hạn duyệt mà chưa đủ hai lượt, worker chuyển đơn sang NEEDS_REVIEW phạm vi HANDOFF, giữ lượng và tạm dừng chi/hoàn. Lượt duyệt đã ghi vẫn có hiệu lực trên biên nhận hiện hành nếu chỉ quá hạn.
