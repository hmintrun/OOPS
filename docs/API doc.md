# Đặc tả API OOPS MVP

Hợp đồng API cho web và worker của [OOPS MVP](requirements.md). Xem [Schema PostgreSQL](schema.md) để tra ràng buộc lưu trữ và [Kiến trúc](architecture.md) để tra vòng đời và enum trạng thái.

## Quy ước

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
| unitPriceVnd | integer | Có | Đơn giá, kể cả 0. |
| goodsVnd | integer | Có | Tổng tiền hàng do backend tính. |
| depositVnd | integer | Có | Cọc do người bán nộp. |

Contract còn có sourceVersionId, version, sellerId, repId, depositDueAt, paymentDueAt?, handoffStart, handoffBy, approvalDueAt, readyAt?, allocations, charges, disbursements, evidenceIds?, receipt?, termination?, reviewScope?, handoffPrivate? và repContact?. `reviewScope` là `HANDOFF` hoặc `DEPOSIT` khi `NEEDS_REVIEW`. Allocation có allocationId, qty, goodsVnd. Người bán và đại diện của hợp đồng thấy evidenceIds ngay khi đã lưu bằng chứng, kể cả trước khi lập biên nhận. Khoản thu hoặc chi có ID, kind, amountVnd, state và dueAt hoặc postedAt?.

### Campaign, DemandItem và Cart

Campaign gồm campaignId, state, collectUntil và needBy. DemandItem gồm demandItemId, campaignId, skuId, name, unit, districtCode, wardCode, needBy, supportRequested, target, pending, reserved, received, missing, offerable và state. Cart gồm cartId, version, state, householdSize, supportRequested và lines theo dữ liệu PUT.

`needQty` là lượng còn thiếu. Ví dụ hộ đang có 3 chai và cần thêm 7 chai thì gửi `stockQty: 3, needQty: 7`. Khi đăng nhu cầu, cộng trực tiếp `needQty` của các giỏ đã xác nhận.

### Receipt và Offer

Receipt gồm receiptId, version, handedAt, lines, evidenceIds, state và approvals với role, approvedAt. Offer gồm proposalId, demandItemId, state, terms theo dữ liệu POST, goodsVnd, depositVnd và draftId? nếu đã khởi tạo thương lượng.

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
  confirmBy: IsoDateTime;
  requiredCount: UInt;
  confirmedCount: UInt;
  myConfirmation?: {
    walletAddress: string;
    state: "PENDING" | "CONFIRMED";
  };
};
```

- `Draft.qty` và `Draft.totalVnd` là tổng của bản nháp đang sửa. `Draft.myLine` chỉ chứa dòng nháp của hộ gọi API. Seller chỉ nhận `SellerDraftView` và nhận `404` nếu chưa có bản gửi.
- `DraftVersion` chứa dữ liệu đã chụp khi gửi. `version` bắt đầu từ 1 và là số dùng trong route `/versions/{version}`. Hộ có phần nhận `myLine` của mình. Seller của đề nghị và đại diện có quyền duyệt nhận `lines` gồm lượng và tiền theo từng phần. Các dòng trả cho người duyệt không chứa ghi chú riêng, định danh hộ hoặc địa chỉ ví. Nếu đại diện cũng có phần, `myLine` vẫn chỉ chứa phần của đại diện.
- `roundId`, `confirmBy` và `repApproveBy` xuất hiện khi đã tạo vòng. `contractId` xuất hiện khi đã chốt. Định dạng chuỗi `versionHash` và `roundKey` theo ABI được chốt với BE–Fuji ở D1.
- Chỉ ví thuộc dòng snapshot của chính hộ gọi mới xuất hiện trong `myConfirmation.walletAddress`. API trả `CONFIRMED` sau khi worker đã lưu xác nhận hợp lệ. Số đếm chỉ phục vụ hiển thị tiến độ. Backend duyệt cuối dựa vào tập xác nhận của từng hộ.
- `Contract.termination` chỉ trả yêu cầu đang chờ cho người gọi có quyền xem. Dữ liệu gồm terminationId, baseVersion, proposedBy, reason, state và note?.

## Tài khoản nhóm và giỏ

- `members` gồm các phần tử `{membershipId, userId, displayName, role}`. Role của nhóm là `MEMBER` hoặc `REP`. `repId` là userId của đại diện.
- Lời mời hết hạn sau 24 giờ. Frontend đọc token từ `/join?token=…` và gửi đến `POST /invites/accept` sau khi có phiên.
- `category` nhận `WATER`, `FOOD` hoặc `ESSENTIALS`.
- GET giỏ trả `404` nếu chưa tạo. PUT tạo với `version: 0` và trả bản đã lưu ở version 1. Sửa hoặc xác nhận thành công tăng version thêm 1. Phát lại cùng khóa idempotency trả kết quả cũ.

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `GET /me` và `PATCH /me`<br>Đã đăng nhập | Supabase Auth quản lý phiên. PATCH {contactPrivate}. | 200 {userId, groupId?, wallet?: {address, verificationState}, confirmationEligible, contactPrivate?}. verificationState là PENDING, VERIFIED hoặc FAILED. confirmationEligible còn phụ thuộc chính sách Fuji. |
| `POST /wallet/link`<br>Chủ phiên | {address, proofTx, nonce}. GET /wallet/challenge cấp nonce một lần và expiresAt. Fuji ghi hash thử thách gắn với ví. | 202 {verificationState}. GET /me cho biết kết quả. 422 nếu bằng chứng sai. |
| `POST /groups`<br>Người chưa có nhóm | {name, districtCode, wardCode, pickupPrivate?}. Người tạo xác nhận nhận vai trò đại diện khi gửi. | 201 {groupId, membershipId, role}. 409 nếu đã có nhóm. |
| `GET /groups/{id}`<br>Thành viên | id là groupId. | 200 {groupId, repId, members, campaigns: Campaign[]}. Ẩn điểm nhận cụ thể với hộ chưa chốt. |
| `POST /groups/{id}/invites`<br>Đại diện | {kind: JOIN hoặc REP, targetUserId?}. REP bắt buộc có targetUserId đang trong nhóm. | 201 {inviteId, inviteUrl, expiresAt}. |
| `POST /invites/accept`<br>Người được mời | {token}. JOIN cần chưa có nhóm. REP kiểm tra đúng tài khoản đích. | 200 {groupId, membershipId, role}. 409 nếu link hết hạn, đã dùng hoặc không còn hợp lệ. |
| `POST /groups/{id}/campaigns`<br>Đại diện | {collectUntil, needBy, supportRequested?}. Kiểm tra thời điểm hiện tại < collectUntil < needBy. | 201 Campaign ở DRAFT. |
| `GET /catalog`<br>Đã đăng nhập | category? | 200 {items: [{skuId, name, category, unit}]}. |
| `GET /campaigns/{id}/cart` và `PUT /campaigns/{id}/cart`<br>Hộ trong nhóm | PUT {householdSize, supportRequested, lines: [{skuId, stockQty, needQty}], version}. version = 0 để tạo. householdSize > 0, stockQty ≥ 0, needQty ≥ 0. | 200 Cart. PUT lưu DRAFT. 409 nếu version cũ, đã đăng hoặc đã tới hạn gom. 422 nếu số lượng sai. |
| `POST /campaigns/{id}/cart/ai`<br>Hộ trong nhóm | {text, householdSize?}. Chỉ trong thời gian gom. Trích dữ liệu, đối chiếu SKU và áp quy tắc nếu đủ đầu vào. | 200 {draft, unresolved, ruleRefs}. 409 nếu đã đóng gom. 503 khi AI lỗi. Hộ tiếp tục nhập tay. |
| `POST /campaigns/{id}/cart/confirm`<br>Chủ giỏ | {version}. Chỉ khi đợt DRAFT và chưa tới collectUntil. | 200 Cart ở CONFIRMED. 409 nếu version cũ hoặc đã đóng gom. |

## Nhu cầu, đề nghị và xác nhận hợp đồng

`GET /campaigns/{id}/needs` trả `campaignState` cùng danh sách `items`. Với `DRAFT`, đại diện xem danh sách xem trước gồm `skuId`, `name`, `unit`, `target` và `supportRequested` tính từ giỏ đã xác nhận. Hộ khác chỉ thấy phần của mình. Khi `PUBLISHED`, các dòng là `DemandItem`, kèm `myShare?: {target, pending, reserved, received}` của người gọi và `activeRounds: [{roundId, demandItemId, state}]` cho các vòng đang mở mà người gọi được xem trong nhóm.

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `POST /campaigns/{id}/publish`<br>Đại diện | {}. Trước needBy, khóa đợt, đóng gom và chụp các giỏ đã xác nhận trong cùng giao dịch. | 200 {campaignId, items: DemandItem[]}. 422 nếu không có lượng cần. |
| `GET /campaigns/{id}/needs`<br>Thành viên nhóm | id là campaignId. | 200 {campaignState, items, activeRounds}. activeRounds rỗng khi còn DRAFT. |
| `GET /feed`<br>Đã đăng nhập | district?, ward?, category?, cursor?, limit?. limit mặc định 20, tối đa 50. | 200 {items: DemandItem[], nextCursor?}. Chỉ đợt đã đăng, còn hạn và missing > 0. offerable có thể bằng 0 khi đang chờ cọc. |
| `POST /needs/{id}/offers`<br>Người bán | {qty, unitPriceVnd, supportOffer, handoffStart, handoffBy, handoffPrivate}. Chấp nhận lượng dương đến missing, kể cả khi offerable bằng 0. Xem tiền ước tính ở UI theo [quy tắc dữ liệu](schema.md#quy-tắc-dữ-liệu). | 201 Offer gồm proposalId, state, terms và cọc dự kiến. 409 nếu không còn đủ missing hoặc đã hết hạn. |
| `GET /needs/{id}/offers`<br>Thành viên nhóm hoặc người bán | id là demandItemId. Người bán chỉ đọc đề nghị của mình. Thành viên chỉ đọc đề nghị trong nhóm. | 200 {items: Offer[]}. Địa chỉ và liên hệ lọc theo quyền. |
| `POST /offers/{id}/draft`<br>Hộ có nhu cầu | {}. Hộ khởi tạo mở nháp cho đề nghị còn hiệu lực. Seller của đề nghị không tham gia mua. | 201 Draft. 409 nếu đã có hồ sơ hoặc đề nghị đã đóng. |
| `GET /drafts/{id}`<br>Thành viên liên quan hoặc seller | id là draftId. | 200 Draft cho thành viên liên quan hoặc SellerDraftView cho seller. |
| `PUT /drafts/{id}/my-line`<br>Hộ có nhu cầu | {qty, note?, editRevision}. qty bằng 0 bỏ phần của hộ. Chỉ sửa khi nháp mở. | 200 Draft. 409 nếu revision cũ hoặc nháp đã khóa. |
| `POST /drafts/{id}/submit`<br>Hộ khởi tạo | {editRevision}. Chụp bản có tổng dương, không vượt lượng chào, lịch còn hợp lệ. Server tính tiền. | 201 DraftVersion ở SUBMITTED với hạn seller phản hồi. |
| `POST /drafts/{id}/versions/{version}/seller-response`<br>Người bán | {action: APPROVE, REJECT hoặc REQUEST_CHANGES, note?}. Với APPROVE, kiểm tất cả hộ có phần đều có ví verified và đủ quyền, rồi tạo vòng và outbox. | 200 DraftVersion. 409 WALLET_NOT_READY giữ bản SUBMITTED. Bản quá hạn, cũ hoặc sai trạng thái trả 409. |
| `POST /drafts/{id}/revise`<br>Hộ khởi tạo | {version}. Chỉ từ CHANGES_REQUESTED, EXPIRED hoặc STOCK_CONFLICT khi đề nghị và lịch còn hợp lệ. | 200 Draft mở để sửa từng phần. Lần submit tiếp theo tạo version mới. |
| `GET /rounds/{id}`<br>Các bên được xem bản | id là roundId. | 200 ConfirmationRound. |
| Giao dịch confirmVersion trên Fuji<br>Ví của hộ trong snapshot | confirmVersion(roundKey, versionHash). Contract kiểm vòng, hash, ví, hạn và lượt xác nhận duy nhất. | Event VersionConfirmed(roundKey, versionHash, wallet). Worker kiểm log đã xác nhận và chỉ mở bước đại diện duyệt khi đủ từng hộ. |
| `POST /drafts/{id}/versions/{version}/finalize`<br>Đại diện | {}. Kiểm đúng bản, đủ xác nhận, thời hạn và lượng khả dụng trong transaction. | 201 Contract ở AWAIT_DEPOSIT. Nếu thiếu lượng, lưu STOCK_CONFLICT và outbox rồi trả 409. Gửi lại với cùng khóa idempotency trả kết quả trước đó. |
| `GET /contracts` và `GET /contracts/{id}`<br>Các bên liên quan | Danh sách hỗ trợ role=buyer hoặc seller, state?, cursor?, limit?. | 200 {items: Contract[], nextCursor?} hoặc Contract. Trả phần và khoản tiền theo quyền. |

Ví dụ đề nghị chào 10 chai, ba hộ gửi bản 7 chai với phần 2+2+3. Ở giá 2.000đ/chai, bản gửi có totalVnd 14000 và hợp đồng chốt có depositVnd 50000. Với ca nghiệm thu khác, nhu cầu 12 chai và bản chốt 8 chai ở cùng đơn giá tạo tiền hàng 16000. Đơn giá 0 vẫn có depositVnd 50000. Sau khi cọc được ghi nhận, Feed của nhu cầu 12 chai trả reserved 8 và missing 4.

Hộ khởi tạo gửi `POST /drafts/{id}/submit` với `Idempotency-Key: submit-v1` và body `{"editRevision":3}`. Ví dụ phản hồi `201` cho hộ góp 2 chai. Giá trị `versionHash` minh họa cho mã băm do server tạo.

```json
{
  "versionId": "bf05cd2b-5143-41f0-91d6-8332c6b8257f",
  "version": 1,
  "versionHash": "<versionHash>",
  "state": "SUBMITTED",
  "qty": 7,
  "unitPriceVnd": 2000,
  "totalVnd": 14000,
  "handoffStart": "2026-11-18T15:00:00+07:00",
  "handoffBy": "2026-11-18T16:00:00+07:00",
  "sellerResponseDueAt": "2026-11-18T10:00:00+07:00",
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

Giữ phiên bản ở `SUBMITTED`. Khi điều kiện ví đã thay đổi, seller thực hiện lần duyệt mới với khóa mới. API dùng `409 STOCK_CONFLICT` khi ghi nhận xung đột lượng ở bước duyệt cuối và `409 STATE_CONFLICT` khi thao tác không hợp lệ với trạng thái, phiên bản hoặc hạn hiện hành.

## Thanh toán và bàn giao

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `POST /charges/{id}/checkout` (sau demo)<br>Người nộp | {}. Server dùng số tiền theo phiên bản hợp đồng hiện tại và ghi mốc bắt đầu thu trước khi gọi dịch vụ tạo QR. id lấy từ Contract. | 200 {chargeId, mode, state, amountVnd, qrCode?, checkoutUrl?, dueAt}. 409 khi khoản đã hết hạn. |
| `POST /webhooks/payos` (sau demo)<br>payOS ký payload | Payload code, success, data, signature. Kiểm tra chữ ký và kết quả giao dịch. Đối chiếu orderCode, paymentLinkId, reference, VND và amount. | 200 sau khi ghi sự kiện hợp lệ, kể cả ca đến trễ, nộp thêm hoặc gửi lặp. Một khoản thu chỉ áp dụng một giao dịch khớp và đủ trước hạn khi còn PENDING, hợp đồng đang ở bước tương ứng. 400 chữ ký sai. 503 lỗi ghi tạm thời. |
| `POST /demo/charges/{id}/receive`<br>Người nộp trong demo | {}. Ghi mốc bắt đầu thu và tạo sự kiện SIM với mã cố định theo khoản. | 200 {chargeId, state}. Dùng cùng logic ghi nhận khoản thu. |
| `POST /contracts/{id}/ready`<br>Người bán | {}. Trong AWAIT_HANDOFF. | 200 Contract có readyAt. Gửi thông báo sẵn sàng. |
| `POST /contracts/{id}/evidence`<br>Người bán | multipart/form-data với file ảnh. Kiểm tra kiểu, kích thước, quyền và trạng thái theo quy tắc bàn giao bên dưới. | 201 {evidenceId}. 409 nếu trạng thái không cho ghi bằng chứng. 413 nếu vượt giới hạn cấu hình. |
| `GET /evidence/{id}`<br>Người bán hoặc đại diện của hợp đồng | id lấy từ evidenceIds của hợp đồng. | 200 {url, expiresAt}. URL ký có hạn. 404 khi bằng chứng không thuộc hợp đồng người gọi được xem. |
| `POST /contracts/{id}/receipts`<br>Đại diện | {handedAt, lines: [{allocationId, receivedQty}], evidenceIds}. Áp dụng quy tắc bàn giao bên dưới. Mỗi allocation phải xuất hiện đúng một lần và lượng thực nhận từ 0 đến lượng đã chốt. | 201 Receipt. Hệ thống cập nhật trạng thái hợp đồng trong cùng giao dịch. 409 nếu trạng thái không cho lập biên nhận. 422 nếu thời điểm, dòng hàng hoặc bằng chứng sai. |
| `POST /receipts/{id}/approve`<br>Người bán hoặc đại diện | {version}. Role lấy từ hợp đồng. Chỉ duyệt phiên bản DRAFT hiện hành khi AWAIT_APPROVAL hoặc NEEDS_REVIEW với reviewScope HANDOFF và còn đủ điều kiện bàn giao. Hai bên có thể thống nhất kết quả sau hạn duyệt. | 200 Receipt với trạng thái hai lượt duyệt. Lượt duyệt thứ hai ghi lượng nhận và giải phóng lượng giữ đúng một lần. |

Bằng chứng, lập biên nhận và duyệt đều yêu cầu cọc đã nhận, tiền hàng đã thu đủ nếu có, và `stock_state = RESERVED`. Ghi bằng chứng hoặc lập biên nhận chỉ khi `AWAIT_HANDOFF`, `AWAIT_APPROVAL` hoặc `NEEDS_REVIEW` với phạm vi `HANDOFF`. `handedAt` là giờ thực tế, từ lúc đã đủ điều kiện bàn giao đến thời điểm hiện tại. Các bằng chứng phải thuộc cùng hợp đồng. Biên nhận có lượng nhận dương cần ít nhất một bằng chứng của người bán.

Lập biên nhận đúng hạn ở `AWAIT_HANDOFF` chuyển hợp đồng sang `AWAIT_APPROVAL` trong cùng giao dịch. Nếu quá hạn bàn giao mới lập bản đầu tiên, quá hạn duyệt hoặc đã ở `NEEDS_REVIEW` với phạm vi `HANDOFF`, hợp đồng ở `NEEDS_REVIEW` cho đến khi hai bên cùng duyệt. Thay bản nháp chuyển bản cũ sang `SUPERSEDED`. Hai bên duyệt lại từ đầu trên bản mới, lượt duyệt cũ được lưu để đối chiếu.

Giao đủ, đúng hạn hoàn toàn bộ cọc. Với giao thiếu hoặc muộn có đồng thuận, chi phần thực nhận và hoàn phần thiếu từ khoản thu của từng hộ. Nếu chỉ còn bất đồng về cọc, trả hợp đồng ở NEEDS_REVIEW với `reviewScope = DEPOSIT`, vẫn ghi lượng nhận và xử lý các khoản tiền hàng đã xác định. Nếu hủy do hộ quá hạn thanh toán, demo hoàn cọc.

Checkout QR và webhook trong mục này phục vụ tích hợp sau demo. MVP chạy bằng SIM. [Tài liệu API payOS](https://payos.vn/docs/api/)

## Xử lý sự cố và thông báo

| Endpoint và quyền | Dữ liệu vào | Phản hồi |
| --- | --- | --- |
| `POST /contracts/{id}/issues`<br>Người bán hoặc đại diện | {reasonCode, note?}. Ghi rõ lệch hàng, không đến, không an toàn hoặc bằng chứng mâu thuẫn. Dùng từ lúc chờ bàn giao đến trước khi áp dụng biên nhận hoặc xác định hủy. | 200 Contract ở NEEDS_REVIEW với reviewScope HANDOFF nếu kết quả bàn giao chưa thống nhất. Giữ lượng và tạm dừng chi, hoàn. Khi có báo cáo mâu thuẫn về kết quả giao, chuyển biên nhận DRAFT hiện hành sang SUPERSEDED để hai bên duyệt lại trên bản mới. Thông báo bên kia. |
| `POST /contracts/{id}/cancel`<br>Người bán | {reason}. Chỉ khi đang AWAIT_DEPOSIT, AWAIT_PAYMENT hoặc AWAIT_HANDOFF và chưa có bằng chứng, biên nhận hay sự cố bàn giao. | 200 Contract. Giải phóng lượng và lập hoàn tiền hàng. Cọc chưa rõ thì NEEDS_REVIEW với reviewScope DEPOSIT. 409 khi đã có dấu hiệu bàn giao hoặc tranh chấp. |
| `POST /contracts/{id}/terminations`<br>`POST /terminations/{id}/accept`<br>Hai bên hợp đồng | Đề xuất {version, reason: EXCUSED_CANCEL, note?}. Bên kia duyệt {} nếu hai bên đồng ý hủy theo điều khoản. Khi đề xuất và duyệt, hợp đồng phải còn PENDING hoặc RESERVED về lượng, chưa có biên nhận được áp dụng. | 201 {terminationId, state} hoặc 200 Contract. Giải phóng lượng đúng một lần và hoàn theo điều khoản. 409 nếu phiên bản đã đổi hoặc biên nhận đã được áp dụng. |
| `GET /ops/disbursements`<br>Tài khoản vận hành | state=PENDING, cursor?, limit?. | 200 {items: [{disbursementId, contractId, kind, amountVnd, state}], nextCursor?}. |
| `POST /ops/disbursements/{id}/post`<br>Tài khoản vận hành | {transferRef}. Demo dùng mã chuyển SIM duy nhất cho khoản đủ điều kiện. Kiểm và ghi dưới khóa của hợp đồng và khoản chi. | 200 {disbursementId, state: POSTED, contractState}. Gửi lại cùng mã của cùng khoản trả kết quả đã ghi. 409 nếu mã thuộc khoản khác, khoản bị khóa hoặc khoản đã POSTED bằng mã khác. |
| `GET /notifications`<br>`PATCH /notifications/{id}`<br>Chủ thông báo | GET cursor?, limit?. PATCH {read: true}. | 200 danh sách hoặc mục đã đọc. entityType và entityId mở đúng nhu cầu, bản thương lượng, vòng xác nhận hoặc hợp đồng. |

Đổi giá/lượng và đổi lịch sau khi chốt thuộc phạm vi sau demo.

Khi ops ghi khoản cuối cùng đã POSTED, transaction đưa đơn SETTLING sang COMPLETED nếu mọi khoản bắt buộc đã được ghi và không còn khoản bị khóa.

Job xử lý hạn seller, xác nhận Fuji và đại diện duyệt theo [bảng trạng thái](architecture.md#trạng-thái-thương-lượng-và-thời-hạn). Job cũng nhắc hạn cọc, tiền hàng, báo sẵn sàng và giờ nhận. Khi hết hạn bàn giao mà chưa có biên nhận hoặc hết hạn duyệt mà chưa đủ hai lượt, worker chuyển đơn sang NEEDS_REVIEW phạm vi HANDOFF, giữ lượng và tạm dừng chi/hoàn. Lượt duyệt đã ghi vẫn có hiệu lực trên biên nhận hiện hành nếu chỉ quá hạn.
