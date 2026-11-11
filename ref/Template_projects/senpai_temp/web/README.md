# SenpAI web · luyện phỏng vấn tiếng Anh với Miu

Phỏng vấn thử bằng giọng nói với Miu (AI đóng vai nhà tuyển dụng), trả theo buổi 10 MIU qua x402.
Chỉ chạy testnet (Avalanche Fuji). MIU là token thử do SenpAI tự phát hành, không có giá trị.
Tài khoản username/password, ví tạo trong trình duyệt, token MiuCoin và facilitator x402 đều tự làm;
dịch vụ ngoài duy nhất là API AI cho Miu (DeepSeek Flash; `AI_PROVIDER=claude` để dùng Claude).

## Chạy thử

Cần Node 22.13+ (dùng `node:sqlite`).

1. `npm install`
2. `npm run setup`: tạo `.env.local` với khoá relayer và `APP_SECRET`, rồi in ra địa chỉ relayer.
   Địa chỉ MiuCoin cũng được tính sẵn (giao dịch đầu tiên của relayer là lệnh deploy), nên build app được trước khi relayer có gas.
   Thêm `DEEPSEEK_API_KEY=...` vào `.env.local` (hoặc dùng Claude: `AI_PROVIDER=claude` + `ANTHROPIC_API_KEY=...`).
   Thiếu khoá thì mọi thứ khác vẫn chạy, riêng Miu báo "Máy chủ chưa có khoá AI cho Miu".
3. Nạp một ít AVAX Fuji cho địa chỉ relayer từ vòi Fuji của Avalanche. Relayer trả gas cho mọi giao dịch, người dùng không cần AVAX.
4. `npm run token:deploy`: deploy MiuCoin lên Fuji, relayer làm owner, địa chỉ token được ghi vào `.env.local`.
5. `npm run model:pull`: tải model chấm phát âm (~300 MB, một lần) vào `data/models`. Bỏ qua bước này thì app vẫn chạy, chỉ không chấm phát âm.
6. `npm run dev`, mở http://localhost:3000.
7. Tạo tài khoản: nói thử 1 phút (miễn phí) để Miu soi ra 3 tật, rồi chọn vị trí, kinh nghiệm, ngày phỏng vấn, dán JD nếu có.
8. Tạo tài khoản là ví có sẵn **100.000 MIU** thử: relayer mint ngay sau khi đăng ký (tài khoản cũ chưa có thì nhận ở lần đăng nhập sau). Nếu lần mint đó lỗi, Ví MIU hiện nút nhận lại.
9. Trang chủ hoặc **Đổi bài** → chọn bài → **Ký và trả 10 MIU** → biên lai → vào phòng. Nói (hoặc gõ) với Miu tới khi Miu chốt hoặc bấm **Xong** để xem điểm.

Giọng nói: trình duyệt nhận giọng tiếng Anh bằng Web Speech API (Chrome, Edge, Safari). Miu đọc bằng giọng của server (Edge read-aloud, xem dưới),
server lỗi hay mạng chậm thì đọc bằng giọng có sẵn của máy.
Cùng lúc đó trình duyệt ghi âm câu trả lời để server chấm phát âm (xem dưới).
Trình duyệt không nghe được hoặc chặn micro thì tự chuyển sang gõ phím; câu gõ không tính giây nói cho chuỗi ngày và không chấm phát âm.

`npm run status` xem số AVAX còn lại của relayer. Biến `NEXT_PUBLIC_*` được nhúng lúc build, nên deploy token mới thì phải chạy lại `npm run dev` hoặc `npm run build`.

## Tài khoản và ví

- Mật khẩu không bao giờ rời khỏi trình duyệt. Trình duyệt chạy PBKDF2-SHA256 (600k vòng) ra 64 byte: nửa đầu là khoá AES-GCM để khoá private key của ví, nửa sau là `authKey` gửi lên server để đăng nhập.
- Server chỉ lưu `scrypt(authKey)` và bản ví đã mã hoá. Server không ký thay người dùng được.
- Không có email nên **quên mật khẩu là mất ví**. Sai mật khẩu 5 lần thì khoá đăng nhập 5 phút.
- Tải lại trang thì ví bị khoá lại, lúc trả tiền sẽ hỏi mật khẩu để mở.

## Luồng x402

```
web  POST /api/session {role, scenario}   -> 402 + header PAYMENT-REQUIRED: 10 MIU trên Fuji
web  ví ký uỷ quyền EIP-3009 (không tốn gas), client tự chặn nếu bị đòi quá 10 MIU
web  POST lại, kèm header PAYMENT-SIGNATURE
api  kiểm tra điều khoản khớp và người ký đúng là ví của tài khoản đang đăng nhập
api  facilitator verify + settle: relayer gửi transferWithAuthorization, chờ xác nhận
api  200 + header PAYMENT-RESPONSE + vé HMAC (mở phòng trong 30 phút)
web  /interview đổi vé lấy phòng: POST /api/interview/start (id phòng = id vé, gọi lại vẫn ra phòng cũ)
```

## Miu (Claude)

```
start   system prompt (vai Miu, vị trí, JD, bài luyện, 3 tật cũ, mức khịa) + "bắt đầu" -> câu hỏi 1
turn    câu trả lời + bộ đếm "đã hỏi x/y câu, còn n phút" -> Miu phản ứng, hỏi vặn hoặc sang câu mới
finish  cả bản ghi + tốc độ nói (từ/phút) + điểm phát âm đã đo -> điểm Ngữ pháp, Trôi chảy, Nội dung, tối đa 5 câu sửa
```

- `lib/claude.ts`: mặc định DeepSeek `deepseek-flash` (đổi bằng `DEEPSEEK_MODEL`). Với `AI_PROVIDER=claude`: `claude-opus-5-5` (đổi bằng `CLAUDE_MODEL`), structured outputs bằng Zod, `effort` low cho lượt hỏi đáp và medium cho chấm điểm,
  prompt caching tự động, bật server-side fallback (`fallbacks: "default"`) để khi bị từ chối thì API tự chuyển model.
- DeepSeek: cùng SDK, gọi cổng tương thích Anthropic của DeepSeek. Flash nhanh hơn Pro ~40% (lượt hỏi đáp ~1.6 s, chấm điểm ~3.7 s).
  DeepSeek bỏ qua structured outputs, nên schema thành một tool bắt buộc gọi (tắt thinking), kết quả vẫn kiểm bằng Zod, sai thì hỏi lại một lần.
  Hội thoại lưu câu trả lời dạng JSON thuần (đổi qua lại giữa hai bên không vỡ phòng đang dở); lúc gửi DeepSeek thì các lượt cũ được gửi lại dạng tool_use + tool_result, vì thấy JSON thuần Flash chỉ trả mỗi `say`. Khoá Claude trong env không bao giờ bị gửi sang DeepSeek.
  Câu trả lời của DeepSeek được stream: `say` (câu tiếng Anh của Miu) viết xong là server bắt đầu làm giọng ngay, trong lúc DeepSeek còn viết bản dịch và mẹo
  (~0,8 giây trước khi xong lượt), nên giọng Miu thường đã sẵn khi lượt về tới trình duyệt. Thẻ gợi ý làm sẵn giọng câu mẫu theo cách đó.
  Lưu ý: câu trả lời và JD của người dùng khi đó đi qua máy chủ DeepSeek.
- `lib/coach.ts`: prompt và schema. Bản ghi giọng nói và JD được đánh dấu là dữ liệu, không phải lệnh.
- `lib/interview.ts`: phòng do server điều khiển. Hội thoại lưu nguyên khối nội dung trả về, chỉ nối thêm. Mỗi phòng chỉ một lượt chạy cùng lúc,
  hết giờ (15 phút + 1 phút trễ) thì không nhận câu trả lời, câu hỏi vặn cũng có trần.
- Câu sai vào **Sổ câu**, ôn lại theo lịch 1, 3, 7, 16 ngày (`lib/review.ts`), chấm ngay trong trình duyệt (`lib/compare.ts`).
- Chuỗi ngày: nói đủ 1 phút/ngày theo giờ Việt Nam, có lượt đóng băng (giữ 7 ngày được thêm 1, tối đa 2).
  Giải tuần: điểm mỗi buổi (gấp đôi với thử thách hôm nay), +5 mỗi câu ôn đúng khi đến hạn, +20 cho lần nói thử đầu.
- Nói thử 1 phút miễn phí nên giới hạn 3 lần/ngày mỗi tài khoản.

Không có gói Pro (web trả theo buổi) và chưa có thông báo đẩy.

## Giọng Miu (Edge read-aloud)

`POST /api/tts` làm giọng Miu trên server bằng giọng đọc của Microsoft Edge (dịch vụ sau nút "Đọc to" của Edge, qua WebSocket,
không cần khoá; mỗi kết nối kèm mã Sec-MS-GEC tính từ đồng hồ, xem `lib/edge-tts.ts`). MP3 24 kHz.
Edge đọc cả câu dài rất chậm (3–8 giây) nhưng từng câu ngắn thì dưới 1 giây, nên server tách lời Miu thành từng câu, gửi song song rồi nối MP3 lại
(khoảng lặng chỗ nối giống hệt Edge tự ngắt câu). Một kết nối chưa trả sau 1,2 giây hay trả về rỗng thì mở thêm kết nối thứ hai, cái nào xong trước lấy cái đó.
Một câu 0,5–1,5 giây tuỳ lúc Microsoft đông hay vắng (mở sẵn kết nối không giúp gì: đã đo A/B, thời gian nằm ở phía Microsoft).
Giữ 300 câu gần nhất trong bộ nhớ nên câu đã đọc phát lại ngay; câu tiếp theo của Miu được làm giọng ngay khi AI vừa viết xong, trước khi trình duyệt hỏi.

- 4 giọng nữ (`lib/voices.ts`): Tươi tắn (`en-US-AvaNeural`, mặc định), Vui tươi (`en-US-AnaNeural`), Nhẹ nhàng (`en-US-JennyNeural`), Giọng Anh (`en-GB-LibbyNeural`). Cài đặt vẫn cho chọn giọng của máy.
  Chỉ dùng giọng thường: lúc Microsoft đông, các giọng Multilingual (và Emma, Sonia) chậm lên 2–5 giây một câu, còn mấy giọng này vẫn dưới ~1 giây.
- `TTS_PROVIDER=minimax` + `MINIMAX_API_KEY` chuyển sang MiniMax `speech-2.8-turbo` (đổi bằng `MINIMAX_TTS_MODEL`), stream, ~0,7 giây một câu.
  Mỗi server chỉ dùng một nguồn để Miu không đổi giọng giữa buổi. `npm run test:e2e` kiểm Edge; `E2E_TTS=minimax` kiểm MiniMax.
- Mỗi tài khoản tối đa 1.000 câu/ngày, mỗi câu tối đa 500 ký tự.
- Trình duyệt phát qua một thẻ audio dùng chung, mở khoá ở lần chạm đầu (iOS chỉ cho phát tiếng do một lần chạm khởi động).
  Server báo không có giọng, lỗi, hay 5 giây chưa có tiếng thì đọc bằng giọng của máy.

## Phát âm (tự host)

Claude không nghe được âm thanh, nên phát âm chấm bằng một model nhận âm vị chạy ngay trên server:
`wav2vec2-lv-60-espeak-cv-ft` (Apache-2.0, bản ONNX int8 của onnx-community, ~300 MB) qua `@huggingface/transformers` + onnxruntime.
Âm thanh không rời khỏi server và không được lưu; chỉ lưu kết quả chấm.

```
trình duyệt  ghi âm song song với nhận giọng -> giải mã, chuyển 16 kHz mono -> gửi PCM kèm câu trả lời (multipart)
server       model đọc ra chuỗi âm vị (chỉ cho thắng các âm tiếng Anh) ; chữ nhận được -> âm chuẩn theo CMU dict
             dóng hai chuỗi (Needleman-Wunsch) -> điểm từng từ, các lỗi: nuốt âm cuối, rớt phụ âm, đọc sai âm, chêm "ơ"
```

- `lib/phonemes.ts`: bảng âm, dóng hàng, chấm điểm, mẹo tiếng Việt cho từng lỗi. Nguyên âm được chấm dễ (giọng nào cũng lệch chút),
  phụ âm cuối thì chấm kỹ vì đó là lỗi hay gặp nhất của người Việt.
- `lib/pronounce.ts`: nạp model (lần đầu ~1 giây), mỗi lần chấm một câu (~0,4 giây cho 6 giây nói), tối đa 120 giây mỗi câu.
  Câu dài được cắt thành đoạn ≤ 12 giây ở chỗ lặng nhất rồi chấm lần lượt: chấm 60 giây một lượt cần ~2 GB RAM, theo đoạn thì cả câu 2 phút chỉ ~1,15 GB.
  `PRON_THREADS` giới hạn số luồng onnxruntime (trong container bị giới hạn CPU).
- Phòng phỏng vấn: chấm chạy nền sau khi Miu đã trả lời, nên không làm chậm hội thoại; lúc chấm điểm thì đợi tối đa 30 giây.
  Điểm Phát âm được đưa vào prompt chấm để Claude tính vào điểm tổng, Claude không tự bịa nhận xét về phát âm.
- Nói thử: tật phát âm (nếu lặp từ 2 lần) chiếm ô thứ 3, đếm thật chứ không đoán. Ôn câu: `POST /api/pronounce` (tối đa 20 giây, 300 lần/ngày).
- Hồ sơ: "Lỗi bạn hay mắc" gộp lỗi âm thanh của 40 câu nói gần nhất.
- Thiếu model (chưa `model:pull`) thì câu trả lời vẫn đi bình thường, chỉ không có điểm Phát âm. Server không bao giờ tự tải model.
- `PRON_MODEL_DIR` đổi chỗ để model (mặc định `data/models`).

- `contracts/src/MiuCoin.sol`: ERC-20 + EIP-2612 + EIP-3009 (`transferWithAuthorization`). Sửa xong chạy `npm run token:build` để cập nhật `contracts/MiuCoin.json`.
- `lib/relayer.ts`: facilitator x402 tự host (`@x402/core` + `@x402/evm`), cũng là ví mint 100.000 MIU chào mừng (`lib/welcome.ts`, một lần mỗi tài khoản).
- `app/api/session/route.ts`: endpoint thu tiền theo chuẩn x402 v2.
- `lib/vault.ts`: tạo và mở ví bằng mật khẩu.
- `lib/pay.ts`: client x402 với giới hạn chi tiêu theo token.
- `components/miu-art.ts` và `app/miu.css`: sinh tự động từ bộ vẽ Miu, đừng sửa tay.

## Deploy

Chạy một container `next start` (SQLite và model nằm ngoài image). Image build trên Mac, không build trên server:

```
npm run build                                   # .next, nhúng NEXT_PUBLIC_* từ .env.local
docker buildx build --platform linux/amd64 -f deploy/Dockerfile -t senpai-web:v1 --load .
docker save senpai-web:v1 | gzip > senpai-web-v1.tar.gz
```

`deploy/compose.yml` là bản cho box Solana: `/opt/senpai-web`, chỉ mở trên WireGuard `10.66.0.3:8480`, 2 CPU / 1,5 GB.
`data/` (SQLite, chủ uid 1000) và `models/` (chép từ `data/models` của máy build) là thư mục trên server, `senpai.env` lấy từ `.env.local`.
`GET /api/health` trả `{ok, ai, aiKey, token, pronunciation, voice, tts}`: đang dùng AI nào, thiếu khoá, token chưa deploy, thiếu model hay chưa có giọng đều thấy ở đây.
Bắt buộc HTTPS ở ngoài (trình duyệt chỉ cho micro trên https). Đổi `senpai.env` xong phải `docker compose up -d --force-recreate`.
Vòi và trả tiền tự từ chối khi MiuCoin chưa có trên chain, để không lỡ dùng mất nonce deploy của relayer.

## Kiểm thử

`npm run test:e2e` (hoặc `E2E_AI=claude npm run test:e2e` cho nhánh Claude) chạy anvil local (cổng ngẫu nhiên, chain 31337), deploy MiuCoin, bật một API DeepSeek giả (trả lời bằng tool bắt buộc, stream SSE)
và `next dev` với DB tạm, rồi kiểm:
- x402: 402, ví rỗng bị từ chối, 100.000 MIU tự vào ví khi đăng ký (và khi đăng nhập với tài khoản cũ), trả tiền, phát lại chữ ký, sửa số tiền, giới hạn chi tiêu phía client,
  vé chỉ mở cho đúng người, dùng ví người khác, khoá đăng nhập, bài không tồn tại.
- Luyện tập: mở phòng hai lần ra một phòng, người khác không đọc/trả lời được, request gửi Claude (model, fallback, cache, effort, schema),
  bấm gửi hai lần, khoá sai và bị từ chối, chấm điểm lặp lại không gọi Claude lần nữa, ôn câu, đóng băng chuỗi, giới hạn nói thử, giải tuần.
- Phát âm (cần `npm run model:pull` và lệnh `say` của macOS, thiếu thì bỏ qua): `say` đọc một câu chuẩn và cùng câu đó nuốt hết âm cuối;
  câu chuẩn phải ≥ 85, câu nuốt âm ≤ 75 và bị gọi đúng tật "Nuốt âm cuối"; lượt trả lời có âm thanh được chấm và vào prompt chấm điểm;
  nói thử có tật phát âm đo được; `/api/pronounce` từ chối thiếu âm thanh, thiếu chữ, quá 20 giây.
- UI bằng Chrome ở 390×844: đăng ký → nói thử → mục tiêu → trang chủ → ví (đã có MIU) → trả tiền → phòng (gợi ý, dịch, hỏi vặn, tải lại)
  → kết quả → thẻ khoe → ôn câu → sổ câu, chuỗi, giải tuần, cài đặt, hồ sơ → tải lại rồi mở ví trả lần nữa.
  Có model thì câu đầu ở mỗi màn nói đi qua micro giả của Chrome (phát file `say`) và một bộ nhận giọng giả, các câu còn lại gõ phím.

Cần Foundry (`anvil`) và Google Chrome. Đặt `E2E_SHOTS=<thư mục>` để giữ screenshot. Test không gọi Claude thật.
