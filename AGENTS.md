# AGENTS.md — OOPS

## 1. Phạm vi áp dụng

Hướng dẫn này áp dụng cho toàn bộ repository OOPS. Đọc trước khi nhận task và đọc thêm hướng dẫn trong thư mục con nếu có. `ref/` chứa dự án tham khảo, không phải app OOPS; chỉ tái sử dụng phần phù hợp sau khi kiểm tra dependency, cấu hình và quyền sử dụng.

Mục tiêu là MVP chạy ổn định trong 7 ngày với 3 developer và AI Coding Agent. Slide và video làm sau giai đoạn code. Giữ yêu cầu bắt buộc và mốc tích hợp; không tự cắt phạm vi để báo hoàn thành.

**Quyền thực hiện đến từ yêu cầu cụ thể của người dùng.** Task tài liệu chỉ sửa tài liệu. File này không tự cấp quyền triển khai code, cài thư viện, chạy migration, tạo branch, commit, push hoặc deploy. Khi hành động đã được cho phép trong phạm vi task, tiếp tục mà không hỏi lại các bước thường lệ.

Hiện trạng kiểm tra ngày 11/11/2026: tài liệu nằm trong `docs/`, gốc có `.git` và `.gitignore`; chưa tìm thấy manifest app OOPS ngoài `ref/`. Kiểm tra lại source trước mỗi task, không coi ảnh chụp này là trạng thái vĩnh viễn. Không ghi build/test đã qua nếu chưa thực sự chạy.

## 2. Tài liệu và xử lý mâu thuẫn

| Tài liệu | Căn cứ sử dụng |
| --- | --- |
| [OOPS-Spec.md](docs/OOPS-Spec.md) | Điểm vào đặc tả, quy tắc, ma trận truy vết và ca nghiệm thu |
| [requirements.md](docs/requirements.md) | Phạm vi và ca nghiệm thu |
| [OOPS-MVP-Plan.md](docs/OOPS-MVP-Plan.md) | Luồng người dùng, cọc và kịch bản demo |
| [architecture.md](docs/architecture.md) | Trạng thái, deadline, thứ tự khóa và quyền riêng tư |
| [schema.md](docs/schema.md) | Bảng, khóa và bất biến dữ liệu |
| [API doc.md](docs/API%20doc.md) | Endpoint, payload, quyền và lỗi của `/api/v1` |
| [OOPS-7-Day-Development-Plan.md](docs/OOPS-7-Day-Development-Plan.md) | Task, dependency, effort và checkpoint |

- Quyết định mới nhất được người dùng xác nhận là căn cứ cập nhật tài liệu. Không suy đoán quyết định chỉ từ tên file hoặc ngày sửa.
- Mục 3 là căn cứ phân công. Kế hoạch 7 ngày tách UI, server và tích hợp theo vai. Xác nhận giờ thực tế và cách bổ sung năng lực cho các mốc vượt quỹ tại D1.
- `*.before-edit.md` và `*.diff` là lịch sử so sánh, không phải đặc tả hiện hành.
- Khi tài liệu hoặc code mâu thuẫn, chỉ rõ file/vị trí, tác động và phương án xử lý. Không mặc định code đang có là đúng. Dừng phần phụ thuộc nếu chưa rõ nghiệp vụ, quyền, tiền hoặc kiến trúc; tiếp tục phần độc lập.
- Dùng nhãn `VERIFIED`, `ASSUMED`, `MISSING`, `CONFLICT`. Phân biệt code tồn tại, test đã chạy và luồng đã đạt nghiệm thu.

## 3. Phân công và sở hữu

| Vai trò | Chịu trách nhiệm chính | Bàn giao |
| --- | --- | --- |
| **DEV 1 — Frontend** | App shell; UI đăng nhập, nhóm, giỏ, Feed, thương lượng, đơn, bàn giao, ops; API client; tích hợp component ví. | UI theo DTO chung, fixture dev/test, trạng thái tải/lỗi/rỗng, quyền hiển thị, kết nối API thật và kiểm luồng trình duyệt. |
| **DEV 2 — Backend + Database** | Toàn bộ API nghiệp vụ, Auth/authorization server, Gemini server, schema/migration/RLS và transaction lượng, tiền, hợp đồng, bàn giao. | DTO, lỗi, fixture nghiệp vụ, API thật, hàm idempotent cho worker, migration và seed. |
| **DEV 3 — DevOps + Tích hợp Fuji** | Môi trường, CI, staging, Core Wallet, API chứng minh ví/credential Fuji, Solidity/ABI, component ký, indexer, worker, lịch hạn/thông báo, điều phối E2E. | Interface ký, kết quả Fuji đã xác minh, job chạy lại được, URL staging, cấu hình deployment, SHA và smoke result. |

DEV 3 nối FE và BE bằng interface, môi trường và kiểm thử. DEV 1 vẫn chịu trách nhiệm API client; DEV 2 vẫn chịu trách nhiệm API đúng contract. Không chuyển mọi lỗi tích hợp cho DEV 3.

**Ranh giới BE–worker:** DEV 2 sở hữu quy tắc chuyển trạng thái và bất biến DB. DEV 3 sở hữu lập lịch, đọc chain, retry; worker gọi hàm nghiệp vụ đã thống nhất, không tạo bộ quy tắc thứ hai. API ví dùng xác thực chung của DEV 2. Migration cho cả Fuji/worker phải qua DEV 2 điều phối thứ tự và review.

### Bản đồ file dự kiến

Đây là quy ước cho scaffold khi được giao triển khai, **không phải xác nhận các thư mục đã tồn tại**. Nếu source đã có cấu trúc phù hợp, dùng cấu trúc đó và cập nhật bảng; không tạo module trùng để khớp tên.

| Vùng dự kiến | Owner | Phối hợp |
| --- | --- | --- |
| `src/app/**/page.tsx`, layout, `src/components/`, `src/lib/api-client/` | DEV 1 | Component ví là ngoại lệ của DEV 3; FE giữ màn hình bao quanh. |
| `src/app/api/`, `src/server/` | DEV 2 | DEV 3 làm endpoint ví/adapter Fuji với review của DEV 2. |
| `supabase/migrations/`, `supabase/seed.sql` | DEV 2 | DEV 3 hỗ trợ áp dụng vào môi trường đã được phép. |
| `src/contracts/`, `tests/fixtures/` | DEV 2 | DTO/validation/fixture chung, FE và DevOps review phần tiêu thụ. `src/contracts/` là hợp đồng dữ liệu API. |
| `contracts/`, `src/lib/fuji/`, `src/components/wallet/`, `worker/` | DEV 3 | `contracts/` ở gốc là Solidity; ABI/component phải khớp bản đã deploy. |
| `.github/workflows/`, script triển khai, `.env.example`, cấu hình toolchain | DEV 3 | DEV 2 review DB/server env, DEV 1 review build web; env mẫu chỉ có placeholder. |
| Manifest, lockfile, cấu hình build/test chung | DEV 3 điều phối | Dùng package manager của repo/scaffold và một lockfile tương ứng; không sửa đồng thời. |
| Test module | Owner module | DEV 3 điều phối E2E, mỗi DEV sửa lỗi phần mình. |
| `docs/`, `AGENTS.md` | Theo nội dung | DEV 2 giữ API/schema, DEV 1 giữ luồng UI, DEV 3 giữ runbook/ABI; thay đổi xuyên vai trò cần review liên quan. |

Owner là người chịu trách nhiệm và review, không ngăn hỗ trợ. Khi cần sửa vùng khác, ghi rõ phạm vi bàn giao và thống nhất trước khi sửa đồng thời. Không để hai agent sửa cùng file trong cùng checkout.

## 4. Hợp đồng để chạy song song

Trước khi FE dùng mock hoặc BE/worker triển khai, thống nhất:

1. Method, route, DTO, nullable, enum, quyền và mã lỗi theo API docs. Giữ UUID, camelCase, ISO 8601 có múi giờ và VND số nguyên; không đổi đơn vị âm thầm.
2. Chuỗi `demandItemId → proposalId → draftId → versionId → roundId → contractId`. Phân biệt UUID `versionId`, số `version`, `versionHash` và `roundKey`; không dùng thay nhau.
3. Fixture 10→7 với phần 2+2+3; các biến thể thiếu ví, thiếu xác nhận, yêu cầu sửa, hết hạn, xung đột lượng. Mock/API thật dùng cùng DTO và error envelope.
4. Component ký nhận vòng/phiên bản, trả trạng thái ví và tx hash/lỗi. Gửi giao dịch thành công chưa có nghĩa backend đã xác nhận; UI chờ kết quả API đã đồng bộ.
5. Interface BE–worker: payload outbox, khóa chống lặp, kết quả và retry. Chốt chuẩn hóa/hash phiên bản với test vector chung BE–Fuji trước khi mở vòng thật.

FE không tự tạo endpoint/enum để vừa UI. Đổi interface phải cập nhật đặc tả, kiểu, fixture, producer và consumer trong cùng PR hoặc chuỗi PR tương thích có thứ tự rõ. Consumer review trước merge; không merge producer làm hỏng consumer đang chạy.

Mock chỉ bật tường minh trong dev/test, không âm thầm thay API thật khi lỗi. Bàn giao ghi rõ mock hay API thật. Xác nhận Fuji giả chỉ dùng test, không tính vào nghiệm thu demo.

## 5. Bất biến nghiệp vụ

- Một tài khoản có thể mua và bán, tối đa một nhóm hoạt động. Đại diện phải chấp thuận vai trò. Seller và đại diện duyệt cùng hợp đồng là hai tài khoản khác nhau.
- Một đề nghị/hợp đồng xử lý một SKU. Seller chào lượng tối đa. Mỗi hộ sửa dòng mình khi nháp mở; hộ khởi tạo gửi bản chung. Seller approve, reject hoặc yêu cầu sửa. Điều khoản và dòng hàng đã gửi bất biến.
- Seller chào 10 chai, chỉ ba hộ góp 2+2+3: chỉ chốt và giao 7 chai cho ba hộ đó. Không tự chia thêm cho hộ không tham gia hoặc tăng lên 10.
- Mỗi phiên bản có tối đa một vòng Fuji. Mọi hộ có phần dương cần ví verified, đủ quyền và khác nhau. Thiếu ví: seller APPROVE trả `409 WALLET_NOT_READY`, bản giữ `SUBMITTED`, không mở vòng thiếu người.
- Chỉ tính xác nhận đúng chain, contract, vòng, hash, ví snapshot và deadline theo chính sách block đã chốt. Cần đủ **từng hộ**, không biểu quyết đa số hoặc chỉ tin số đếm. Bản mới qua seller và tất cả hộ lại từ đầu.
- Đại diện duyệt cuối sau đủ xác nhận đúng bản. Kiểm trạng thái, hạn và lượng theo món/hộ dưới khóa. Thiếu lượng: lưu `STOCK_CONFLICT` và outbox rồi trả `409`; không rollback mất bản ghi xung đột, không sửa bản đã ký.
- Duyệt thành công tạo đúng một hợp đồng, khoản cọc và `pending` cùng transaction. Cọc hợp lệ mới chuyển `pending` sang `reserved`. Giữ `pending + reserved + received ≤ target` theo món/hộ; `missing = target − reserved − received`, `offerable = missing − pending`.
- Backend tính tiền từ giá/lượng đã chốt, không tin tổng tiền client. VND số nguyên; cọc seller và tiền hàng hộ tách riêng. Cọc tính theo [quy tắc dữ liệu](docs/schema.md#quy-tắc-dữ-liệu): `max(50_000, ceil(goodsVnd / 10))`. Đơn 0đ vẫn có cọc seller, không tạo khoản tiền hàng hộ. Chuyển `bigint` DB sang JSON phải kiểm giới hạn số nguyên an toàn.
- POST nghiệp vụ dùng `Idempotency-Key` theo API: cùng khóa/cùng dữ liệu trả kết quả trước, khác dữ liệu trả `409`. Khóa duy nhất chặn áp dụng thu tiền, xác nhận và chi/hoàn lặp. Tiền trễ/nộp thêm đi đối soát/hoàn, không kích hoạt lại đơn.
- Seller và đại diện duyệt cùng phiên bản biên nhận. Áp thực nhận, giải phóng lượng giữ và lập chi/hoàn đúng một lần. Giao thiếu tính tiền theo thực nhận từng hộ.
- Ops ghi `POSTED` bằng mã SIM duy nhất. Chỉ `COMPLETED` khi đủ khoản bắt buộc đã ghi và không còn khoản bị khóa. `NEEDS_REVIEW/HANDOFF` giữ lượng, khóa quyết toán; `NEEDS_REVIEW/DEPOSIT` giữ riêng cọc, không chặn tiền hàng đã xác định.
- Hết giờ không tự coi đã giao hoặc tự phạt cọc. Hủy, hạn, rời nhóm/đổi ví theo đặc tả; thao tác ghi kiểm hạn tại server, không chỉ dựa worker hoặc nút UI.

Demo dùng Core Wallet + Fuji thật, tiền `SIM`, Gemini tạo giỏ nháp có nhập tay dự phòng. Đổi giá/lượng hoặc lịch sau chốt, thanh toán thật và phân xử cọc thuộc sau demo. Không bật payOS chỉ vì template hoặc tài liệu có endpoint.

## 6. Quy tắc kỹ thuật

- Một codebase Next.js/TypeScript/Tailwind cho web/API; Supabase Auth/PostgreSQL/Storage; worker chạy riêng từ cùng codebase. Không thêm microservices hoặc abstraction ngoài nhu cầu task.
- Logic nghiệp vụ dùng chung ở server. Giao dịch toàn vẹn phải chạy trên cùng transaction DB hoặc hàm DB phù hợp; nhiều lệnh Supabase độc lập không tạo thành một transaction.
- Tuân thứ tự khóa trong kiến trúc; đọc lại trạng thái, phiên bản, hạn và lượng sau khóa. Ghi nghiệp vụ/outbox cùng transaction; không giữ khóa trong khi gọi Gemini/RPC/dịch vụ ngoài.
- Worker có retry/backoff, khóa chống lặp, cursor bền vững. Ghi event và cursor cùng transaction; restart không bỏ qua log chưa xử lý. Chốt chính sách block/replay/reorg trước cổng Fuji thật.
- Không sửa migration đã áp staging; thêm migration tiếp theo. Seed/reset chỉ ở môi trường dev/demo đã xác minh và được phép; không reset DB dùng chung để chữa test ngoài phạm vi được giao.
- Server kiểm phiên/quyền theo nhóm/đối tượng. RLS là lớp bổ sung; route dùng service role vẫn tự kiểm quyền. UI ẩn nút không thay authorization.
- Private key, service role key, Gemini key chỉ ở server/secret store; không có trong biến public, fixture, log hay commit. Không yêu cầu seed phrase. Storage bằng chứng private, URL ký có hạn sau kiểm quyền.
- Fuji chỉ lưu dữ liệu xác minh cần thiết. Thông tin hộ, ghi chú, liên hệ, ảnh và VND nằm trong app; log hạn chế dữ liệu riêng. Gemini output qua validation, không tự xác nhận giỏ hoặc quyết định tiền/lượng.
- Đọc script manifest/runbook trước khi chạy; dùng package manager/lệnh hiện có. Không công bố lệnh build/test chưa tồn tại, không tính test trong `ref/` là kiểm chứng OOPS.

## 7. Nhận và bàn giao task cho agent

1. Đọc hướng dẫn, tài liệu và source liên quan; kiểm thay đổi đang có, không ghi đè phần việc khác.
2. Task cần owner, file, input/output, dependency, acceptance criteria và effort gồm review/debug/integration. Tách UI/server của task cũ và tính lại giờ, không chuyển nguyên khối sang DEV 2 với ước lượng cũ.
3. Xác định contract/fixture sẵn sàng. Thiếu API thật thì làm qua interface chung; thiếu quyết định nghiệp vụ thì báo phần bị chặn và tiếp tục phần độc lập.
4. Làm một lát có thể nghiệm thu, tái sử dụng module hiện có. Không refactor ngoài phạm vi, tạo dịch vụ trùng hoặc tắt validation/test để che lỗi.
5. Review diff, chạy kiểm tra liên quan, cập nhật tài liệu/interface khi đổi hành vi.
6. Bàn giao kết quả thực, phần còn mock/chưa kiểm và blocker. Người thật review thay đổi quan trọng trước merge/release.

```text
Task ID / owner:
Mục tiêu và ca nghiệm thu:
Căn cứ: file + mục/dòng; SHA hoặc phiên bản contract nếu có.
Được sửa / phần thuộc owner khác:
Input: DTO, fixture, ABI, schema và dependency.
Output: UI/API/hàm worker/bằng chứng.
Bất biến cần giữ:
Kiểm thử và môi trường được phép:
Effort: code + review + debug + integration; reviewer:
Ngoài phạm vi / quyết định còn thiếu:
Bàn giao: file đổi, lệnh + kết quả, mock còn lại, blocker.
```

Truyền context bằng mẫu này, không chỉ “làm theo agent trước”. Nếu AI đưa giải pháp lệch codebase, chỉ rõ contract/test vi phạm và sửa trong task. Đổi kiến trúc hoặc yêu cầu cốt lõi cần quyết định người phụ trách/người dùng; sửa lỗi trong phạm vi đã giao không cần xin lại quyền.

## 8. Git, review và tích hợp

- Khi được giao triển khai, nhánh ngắn `feat/<task-id>-<mo-ta>`, `fix/<task-id>-<mo-ta>` hoặc `docs/<task-id>-<mo-ta>`. Một checkout/worktree có một agent đang sửa; nhiều phiên trên một máy dùng worktree nếu cần, port/env tách riêng.
- Đồng bộ `main` đầu ngày/trước checkpoint sau khi bảo toàn thay đổi. Không tự stash, reset, clean hoặc checkout đè việc người khác. Không force-push nhánh chung.
- PR cho một task/lát nhỏ, ghi hành vi trước/sau, dependency, API/migration/ABI, lệnh kiểm tra, bằng chứng và phần chưa đạt. Không ghi “đã test” chung chung.
- PR P0 có ít nhất một DEV khác review. API cần consumer review; DB/quyền/tiền/lượng cần DEV 2 review hoặc DEV khác khi DEV 2 là tác giả; ABI/worker/môi trường tương tự với DEV 3. Không tự review thay người thứ hai.
- Squash merge khi được phép và qua quality gates. Tích hợp ít nhất mỗi ngày. Mock đã merge phải tách khỏi demo thật.
- Conflict API/migration do owner điều phối, đọc cả hai phía và kiểm lại. Không chọn toàn bộ “ours/theirs” để bỏ qua hành vi.
- Release ghi SHA, migration đã áp, chain/address/ABI, cấu hình không nhạy cảm và smoke result. Giữ bản đã đạt gần nhất; rollback app kiểm tương thích DB, không tự rollback migration mất dữ liệu.

## 9. Quality gates và Definition of Done

**Task tài liệu:** đối chiếu nguồn, kiểm liên kết và quyết định đã chốt; Markdown thuần không yêu cầu build app.

**Task code:** build/typecheck, lint nếu có, test liên quan qua; contract/caller đồng bộ; không lộ secret; review phù hợp và bằng chứng nghiệm thu. Thiếu môi trường ghi `NOT RUN` với lý do, không coi là pass. Không mở rộng hoặc lặp test nếu không có thay đổi/rủi ro mới.

| Phần đổi | Bằng chứng tương ứng |
| --- | --- |
| UI/API client | Luồng thành công/tải/lỗi, sai vai/hết phiên, nối API thật; kiểm màn điện thoại cho luồng chính. |
| API/quyền | Validation, sai vai/truy cập chéo nhóm, trạng thái/phiên bản cũ, request lặp. |
| DB/tiền/lượng | Integration PostgreSQL, hai request cạnh tranh, rollback lỗi, thu/chi lặp, đối soát; unit mock không chứng minh khóa DB. |
| Fuji/worker | Sai ví/vòng/hash, thiếu hộ, bản cũ/hết hạn, event lặp, restart/cursor; giao dịch Fuji thật cho cổng tích hợp. |
| Hạ tầng | Deploy theo SHA, web/DB/worker hoạt động, health/log không lộ dữ liệu, smoke và runbook phục hồi. |

Các ca P0 cần bằng chứng trước release:

- 10→7, yêu cầu sửa rồi approve bản mới; thiếu ví/xác nhận không chốt; xung đột lượng không đổi bản đã ký.
- Target 12, đơn 8 chờ cọc: `missing=12`, `offerable=4`; sau cọc thiếu 4; nhận 6 và giải phóng phần giữ thì thiếu 6.
- Đơn 0đ: seller cọc 50.000đ, bàn giao, ops hoàn cọc `POSTED`, đơn `COMPLETED`.
- Đơn 8 × 2.000đ: 16.000đ tiền hàng tách cọc; nhận 6 thì chi 12.000đ/hoàn 4.000đ theo hộ; gửi lặp không tăng tiền/lượng.
- Một bên duyệt quá hạn chuyển `NEEDS_REVIEW`; chặn truy cập chéo nhóm; Gemini lỗi vẫn nhập tay; worker phục hồi không mất việc.

Task dùng fixture có thể đạt nghiệm thu module nếu issue quy định, nhưng chưa đạt DoD tích hợp. Screenshot UI hoặc hash do client gửi không thay bằng chứng trạng thái server/chain.

## 10. Checkpoint và quyết định còn mở

| Mốc | Kết quả cần kiểm |
| --- | --- |
| D1 | Owner, tách UI/server và cân effort; DTO/fixture/ABI; quyền môi trường/công cụ. |
| D2 | Staging web/DB/worker/health; FE–BE tích hợp phần nền. |
| D3 | Giao dịch Fuji thật và bằng chứng ví, không chỉ test local. |
| D4 | Nối bản seller chấp thuận, vòng Fuji, duyệt cuối và đường thu SIM. |
| D5 | Ca 0đ trọn trên staging qua Fuji thật tới `COMPLETED`. |
| D6 | Đơn có giá, giao thiếu, ca lỗi/restart; đóng phạm vi. |
| D7 | Regression, đối soát, release ổn định, runbook/seed demo. |

Đây là checkpoint kế hoạch hiện có, không khẳng định phân công mới đã cân bằng giờ. Trượt mốc phải ghi task còn lại, giờ theo owner và dependency, hỗ trợ critical path trước. Không tự cắt P0 hoặc tính AI như năng lực không giới hạn.

Trước phần triển khai phụ thuộc, ghi quyết định vào tài liệu tương ứng:

- **DEV 3 + DEV 2:** chuẩn credential/token, cấp/thu hồi, điều kiện đủ quyền Fuji; xác nhận block/cutoff/reorg, hash phiên bản, cấu hình chain/deployment.
- **DEV 2 + DEV 3:** deadline seller/hộ/đại diện/cọc/tiền hàng/bàn giao; không biến số tự chọn thành nghiệp vụ đã duyệt.
- **DEV 2 + DEV 1:** danh mục SKU seed, đơn vị chuẩn và nguồn quy tắc gợi ý.
- **Cả nhóm:** người giữ vai trò, năng lực SQL/Fuji, giờ thực tế, quyền Supabase/Gemini/host/RPC/AVAX testnet và người thay thế. Không đưa credential vào tài liệu.

Chỉ hỏi người dùng khi còn thiếu quyết định có ảnh hưởng đáng kể tới yêu cầu, kiến trúc, tiền, dữ liệu hoặc tiến độ. Nêu căn cứ, phần bị chặn và phương án đề xuất. Các mục này không ngăn hoàn thiện tài liệu hoặc phần việc độc lập.
