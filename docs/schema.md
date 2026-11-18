# Schema PostgreSQL OOPS MVP

Tài liệu mô tả các bảng, trường, khóa và ràng buộc cho [OOPS MVP](requirements.md). Các enum hợp đồng, đề nghị, nhu cầu và VND nằm trong [Kiến trúc](architecture.md).

## Quy ước

Cập nhật 17/11/2026: migration `20261117000100_account_and_demand_locations.sql` bổ sung danh mục hành chính TP.HCM, vị trí hồ sơ/nhóm và snapshot vị trí trên nhu cầu. Xem [chi tiết ràng buộc và nguồn dữ liệu](locations.md).

- `id` là khóa chính UUID, trừ bảng có khóa chính ghép ghi trong bảng.
- `fk` là khóa ngoại UUID. `UQ` là ràng buộc duy nhất.
- `ts` là `timestamptz`. `vnd` là `bigint` không âm, tính theo đồng.
- Trường có `?` cho phép NULL. Các trường còn lại dùng `NOT NULL`.
- Một SKU là một mã danh mục có đơn vị cố định. Một membership đại diện một hộ trong đợt gom.
- `need_qty` lưu lượng còn thiếu đã nhập. Khi đăng nhu cầu, cộng trực tiếp `need_qty` từ các giỏ `CONFIRMED`.

## Tài khoản nhóm và nhu cầu

| Bảng | Trường PostgreSQL | Khóa và quy tắc |
| --- | --- | --- |
| `profiles` | `id uuid PK/FK auth.users, display_name text, contact_private text?` | Tạo từ Supabase Auth. Một tài khoản dùng được cả hai luồng. |
| `wallets` | `user_id uuid PK/FK, address text UQ, verification_state enum, verified_at ts?, proof_tx text?` | Chuẩn hóa địa chỉ. verification_state gồm PENDING, VERIFIED, FAILED. Trạng thái đủ điều kiện do backend kiểm tra trên Fuji theo chính sách. |
| `groups`<br>`memberships` | `groups(id, name text, district_code text, ward_code text, pickup_private text?)`<br>`memberships(id, group_id fk, user_id fk, role enum, joined_at ts, left_at ts?)` | Một membership là một hộ trong MVP. UQ user_id với left_at NULL. Tối đa một REP đang hoạt động mỗi nhóm. Nhóm chỉ được đăng bài khi có REP. |
| `group_join_codes` | `id uuid PK, group_id fk UQ, code text UQ` | Một mã 8 ký tự cố định mỗi nhóm, cấp ở lần đầu đại diện lấy link. Nhiều tài khoản có thể dùng mã này. |
| `invites` | `id, group_id fk, kind enum, token_hash text UQ, target_user_id fk?, expires_at ts, used_at ts?` | Lời mời JOIN cũ hoặc chỉ định tài khoản, và lời mời REP, dùng một lần. REP chỉ thành viên đích nhận được. |
| `catalog_items` | `id, code text UQ, name text, category enum, unit text` | Một SKU gắn đơn vị đếm chuẩn. Các nhóm gồm nước, thực phẩm và nhu yếu phẩm. |
| `campaigns` | `id, group_id fk, collect_until ts, need_by ts, support_requested bool, status enum, published_at ts?` | Đợt gom DRAFT hoặc PUBLISHED. collect_until < need_by. Sửa và xác nhận giỏ khi đợt còn DRAFT và chưa đến collect_until. Đại diện có thể đăng sớm để đóng gom, và chỉ đăng trước need_by. |
| `carts`<br>`cart_items` | `carts(id, campaign_id fk, membership_id fk, household_size int, support_requested bool, state enum, version int)`<br>`cart_items(cart_id fk, sku_id fk, stock_qty int, need_qty int, rule_ref text?)` | UQ (campaign_id, membership_id). PK (cart_id, sku_id). Giỏ và đợt cùng nhóm. household_size > 0. stock_qty ≥ 0 và need_qty ≥ 0. Giỏ ở DRAFT hoặc CONFIRMED. Chỉ giỏ CONFIRMED được chụp khi đăng. |
| `demand_items`<br>`demand_shares` | `demand_items(id, campaign_id fk, sku_id fk, target int, pending int, reserved int, received int, support_requested bool)`<br>`demand_shares(demand_item_id fk, membership_id fk, target int, pending int, reserved int, received int)` | UQ (campaign_id, sku_id). PK (demand_item_id, membership_id). target > 0. pending, reserved và received đều ≥ 0. Tổng theo món bằng tổng các hộ. support_requested được chụp khi đăng, đúng nếu đợt hoặc ít nhất một hộ góp nhu cầu cho món đã bật cờ hỗ trợ. |

## Đề nghị, thương lượng và xác nhận

| Bảng | Trường PostgreSQL | Khóa và quy tắc |
| --- | --- | --- |
| `proposals` | `id, demand_item_id fk, seller_id fk, qty int, unit_price_vnd vnd, support_offer bool, handoff_start ts, handoff_by ts, handoff_private text, state enum` | Giá và số lượng bất biến sau khi gửi. 0 ≤ đơn giá, qty > 0. handoff_start ≤ handoff_by ≤ need_by. |
| `negotiations`<br>`negotiation_draft_lines` | `negotiations(id, proposal_id fk UQ, initiated_by_membership_id fk, edit_revision int, draft_open bool)`<br>`negotiation_draft_lines(negotiation_id fk, membership_id fk, qty int, note text?)` | Mỗi đề nghị một hồ sơ. PK dòng nháp (negotiation_id, membership_id). Mỗi hộ chỉ sửa dòng của mình khi nháp mở. Hộ khởi tạo gửi bản theo edit_revision hiện hành. |
| `offer_votes` | `negotiation_id fk, round int, membership_id fk, qty int, accepted_at ts?` | PK (negotiation_id, round, membership_id). `accepted_at` ghi lúc hộ chọn Có và giữ nguyên khi chỉnh phiếu Có. Chọn Không xóa mốc. Phiếu cũ có thể thiếu mốc. |
| `negotiation_versions`<br>`negotiation_version_lines` | `negotiation_versions(id, negotiation_id fk, version int, qty int, unit_price_vnd vnd, goods_vnd vnd, handoff_start ts, handoff_by ts, version_hash text UQ, state enum, submitted_at ts, seller_response_due_at ts, seller_approved_at ts?, seller_note text?, confirm_by ts?, rep_approve_by ts?, reason_code enum?)`<br>`negotiation_version_lines(version_id fk, membership_id fk, qty int, goods_vnd vnd, note text?)` | UQ (negotiation_id, version). PK dòng (version_id, membership_id). Mỗi bản có ít nhất một dòng dương. Điều khoản, dòng hàng và hạn phản hồi được chụp khi gửi. Tối đa một bản đang chờ phản hồi, xác nhận hoặc duyệt trong mỗi hồ sơ. |
| `confirmation_rounds` | `id, version_id fk UQ, chain_id int, contract_address text, onchain_key text, opens_at ts?, confirm_by ts, state enum` | UQ (chain_id, contract_address, onchain_key). Một vòng cho mỗi phiên bản. Đề nghị có thể có nhiều vòng qua các phiên bản. Trạng thái OPENING, OPEN, CONFIRMED hoặc CLOSED. Mã băm đối chiếu qua version_id. |
| `chain_cursors` | `chain_id int, contract_address text, stream text, last_confirmed_block bigint` | PK (chain_id, contract_address, stream). Worker lưu cursor sau khi ghi sự kiện trong cùng giao dịch. |
| `confirmation_participants`<br>`confirmations` | `confirmation_participants(round_id fk, membership_id fk, wallet text)`<br>`confirmations(round_id fk, membership_id fk, chain_id int, tx_hash text, log_index int, block_no bigint)` | PK (round_id, membership_id) cho cả hai. Ví duy nhất trong vòng. Xác nhận FK vào dòng tham gia tương ứng. UQ (chain_id, tx_hash, log_index). Tập tham gia bằng tập dòng dương của phiên bản và chỉ tạo khi toàn bộ ví hợp lệ. |
| `contracts` | `id, proposal_id fk UQ, source_version_id fk UQ, rep_id fk, qty int, unit_price_vnd vnd, goods_vnd vnd, deposit_vnd vnd, deposit_due_at ts, payment_due_at ts?, ready_by ts, handoff_start ts, handoff_by ts, approval_due_at ts, ready_at ts?, state enum, stock_state enum, review_scope enum?, version int, deposit_policy_version text` | rep_id chụp lúc chốt, khác seller_id. qty > 0. stock_state gồm PENDING, RESERVED, RECEIPT_APPLIED, RELEASED. review_scope là HANDOFF hoặc DEPOSIT khi NEEDS_REVIEW. Khóa điều khoản cọc. source_version_id là phiên bản đã chốt của cùng đề nghị. Phạm vi HANDOFF giữ lượng và khóa chi, hoàn. Phạm vi DEPOSIT chỉ khóa các khoản liên quan đến cọc. |
| `allocations` | `id, contract_id fk, membership_id fk, qty int, goods_vnd vnd` | UQ (contract_id, membership_id). qty > 0. Tổng qty = contracts.qty. Tiền mỗi hộ = qty × đơn giá. |
| `evidence`<br>`receipts` | `evidence(id, contract_id fk, uploaded_by fk, object_key text UQ)`<br>`receipts(id, contract_id fk, version int, received_lines jsonb, evidence_ids uuid[], handed_at ts, scheduled_handoff_by ts, state enum)` | UQ (contract_id, version). Dòng nhận gồm allocationId và receivedQty. Có đủ mỗi allocation của hợp đồng đúng một lần, kể cả 0. 0 ≤ receivedQty ≤ qty của allocation. Bằng chứng phải cùng hợp đồng. DRAFT, APPROVED, SUPERSEDED. Tối đa một biên nhận APPROVED mỗi hợp đồng. scheduled_handoff_by chụp từ lịch đang áp dụng khi lập biên nhận, dùng để đối chiếu handed_at. |
| `receipt_approvals` | `receipt_id fk, role enum, approved_by fk, approved_at ts` | PK (receipt_id, role). SELLER hoặc REP. Tạo phiên bản mới yêu cầu cả hai duyệt lại. |

## Khoản thu sổ VND và tác vụ nền

| Bảng | Trường PostgreSQL | Khóa và quy tắc |
| --- | --- | --- |
| `charges` | `id, contract_id fk, allocation_id fk?, payer_id fk, kind enum, amount_vnd vnd, due_at ts, mode enum, order_code bigint?, payos_link_id text?, checkout_started_at ts?, state enum` | Một DEPOSIT cho hợp đồng. Một GOODS cho mỗi allocation có giá. amount_vnd > 0. SIM hoặc PAYOS. Mã payOS UQ khi có. Ghi checkout_started_at trước khi khởi tạo QR hoặc nhận tiền mô phỏng để ghi nhận lần bắt đầu thu. |
| `fund_events` | `id, charge_id fk?, mode enum, external_ref text, amount_vnd vnd, occurred_at ts, received_at ts, disposition enum` | UQ (mode, external_ref). APPLIED, REVIEW hoặc REFUND_DUE. UQ charge_id cho các dòng APPLIED và APPLIED yêu cầu charge_id. Lưu tiền đến trễ, lệch số hoặc nộp thêm để đối soát. |
| `disbursements` | `id, contract_id fk, fund_event_id fk, payee_id fk, kind enum, amount_vnd vnd, state enum, dedupe_key text UQ, transfer_ref text UQ?, posted_at ts?` | GOODS_PAYOUT, GOODS_REFUND, DEPOSIT_REFUND hoặc DEPOSIT_DEDUCTION. Tổng chi/hoàn theo fund_event ≤ tiền thực nhận. Ops đánh dấu POSTED khi có transfer_ref duy nhất. Kiểm và chuyển đơn đủ điều kiện sang COMPLETED trong cùng giao dịch. |
| `terminations` | `id, contract_id fk, proposed_by fk, base_version int, reason enum, note text?, state enum, decided_at ts?` | EXCUSED_CANCEL. PENDING, ACCEPTED, EXPIRED. Tối đa một yêu cầu PENDING mỗi hợp đồng. Bên kia đồng ý trên đúng phiên bản và khi còn PENDING hoặc RESERVED về lượng. Yêu cầu hết hiệu lực nếu phiên bản đổi hoặc kết quả giao hay hủy đã được ghi nhận. |
| `outbox`<br>`idempotency_keys` | `outbox(id, kind text, event_key text UQ, payload jsonb, attempts int, next_run_at ts, processed_at ts?)`<br>`idempotency_keys(actor_id fk, operation text, key text, request_hash text, status int, response jsonb, expires_at ts)` | PK idempotency (actor_id, operation, key). Outbox lưu tác vụ có thể phát lại với cùng event_key. |
| `notifications`<br>`audit_events` | `notifications(id, user_id fk, entity_type text, entity_id uuid, event_key text, read_at ts?)`<br>`audit_events(id, actor_id fk?, entity_type text, entity_id uuid, action text, version int?, reason text?, created_at ts)` | UQ (user_id, event_key). Audit lưu chuyển trạng thái, hủy, quá hạn và đối soát. Worker dùng actor NULL. |

## Quy tắc dữ liệu

Các giao dịch ghi tuân theo [thứ tự khóa dữ liệu](architecture.md#thứ-tự-khóa-dữ-liệu).

- `contracts.handoff_eligible_at` chụp lúc nhận đủ cọc và tiền hàng nếu có. `receipts.handed_at` phải nằm từ mốc này đến thời điểm lập biên nhận. `handoff_issues` giữ mã lý do và ghi chú riêng của bên báo sự cố. `ops_accounts` cấp quyền ghi chi SIM theo tài khoản.
- Một đợt chỉ có một dòng nhu cầu cho mỗi SKU. Khóa dòng nhu cầu và dòng hạn mức hộ khi chốt hoặc cập nhật lượng đã giữ/đã nhận. Với mỗi dòng, pending + reserved + received ≤ target.
- `missing = target − reserved − received`. Feed còn hạn hiển thị và nhận đề nghị có lượng tối đa bằng `missing`. `offerable = missing − pending` là lượng có thể chốt thêm, gồm cả khi bằng 0. Đề nghị dự phòng chưa chiếm lượng. Tạo hợp đồng tăng `pending` đến hạn nộp cọc. Cọc hợp lệ chuyển `pending` sang `reserved`. Quá hạn cọc giải phóng `pending`.
- Tiền hàng = qty × unit_price_vnd. Cọc = max(50.000, ceil(tiền hàng / 10)). Demo dùng phí đại diện 0đ. Nếu áp dụng phí cho đơn có giá, phí là dòng riêng ngoài tiền hàng và cọc. Mọi khoản tiền VND được tính bằng số nguyên.
- Duyệt cuối khóa đề nghị, hồ sơ, phiên bản và vòng cùng các dòng nhu cầu liên quan. Kiểm phiên bản còn hiệu lực, tập hộ và ví đầy đủ, đúng xác nhận theo vòng và còn đủ lượng của món lẫn từng hộ. Tạo hợp đồng theo đúng bản, không tự phân lại. `proposal_id` và `source_version_id` duy nhất trên hợp đồng để chống tạo trùng. Đổi giá/lượng hoặc lịch sau chốt thuộc phạm vi sau demo.
- Chỉ ghi bằng chứng, lập hoặc duyệt biên nhận khi đã thu đủ các khoản đến bước bàn giao và `stock_state = RESERVED`. Lập biên nhận ở `AWAIT_HANDOFF` chuyển hợp đồng sang `AWAIT_APPROVAL` trong cùng giao dịch, trừ trường hợp đã quá hạn bàn giao thì vào `NEEDS_REVIEW` với phạm vi `HANDOFF`. Khi thay biên nhận nháp, chuyển bản cũ sang `SUPERSEDED` và tính lại lượt duyệt từ đầu. Giữ lịch sử lượt duyệt gắn với bản cũ. Báo cáo mâu thuẫn về kết quả giao cũng chuyển bản nháp hiện hành sang SUPERSEDED. Nếu chỉ quá hạn, giữ bản hiện hành và các lượt duyệt của bản đó.
- Hai bên duyệt cùng phiên bản thì chuyển biên nhận sang APPROVED, cộng lượng thực nhận, giải phóng toàn bộ lượng giữ của hợp đồng và chuyển `stock_state` sang RECEIPT_APPLIED trong một giao dịch. Chỉ áp dụng một lần. Cọc cần xử lý giữ riêng ở NEEDS_REVIEW với `review_scope = DEPOSIT`. Khoản chi và hoàn tiền hàng theo biên nhận đã duyệt có thể được đối soát.
- Hủy hợp lệ chỉ khi còn PENDING hoặc RESERVED về lượng. Giải phóng pending hoặc reserved đúng một lần và đặt `stock_state = RELEASED`. Hủy trực tiếp bị chặn khi đã có bằng chứng, biên nhận hoặc sự cố bàn giao chưa giải quyết. Nếu tranh chấp còn liên quan đến lượng giao, giữ reserved và tạm dừng chi, hoàn cho đến khi hai bên xác nhận kết quả.

Chỉ áp dụng giao dịch SIM hoặc webhook payOS đã xác thực, khớp khoản thu và đủ tiền trước hạn. Khoản thu phải còn PENDING và hợp đồng ở bước tương ứng. Lưu khoản lệch số, nộp thêm hoặc đến sau khi đã đóng khoản thu để đối soát hoặc hoàn. Khi chi hay hoàn, đối chiếu mã chuyển đi trước khi ghi POSTED.

Xem thêm [Đặc tả API](API%20doc.md) và [Yêu cầu](requirements.md).
