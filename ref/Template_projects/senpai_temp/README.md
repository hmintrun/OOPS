# SenpAI · luyện phỏng vấn tiếng Anh với Miu

Phỏng vấn thử bằng giọng nói với Miu, nhà tuyển dụng do AI đóng vai: Miu hỏi, nghe bạn trả lời, hỏi tiếp, gợi ý khi bí, rồi chấm điểm và chỉ lỗi (cả phát âm).
Trả theo buổi, 10 MIU một buổi qua x402 trên Avalanche Fuji testnet. MIU là token thử, không có giá trị.

Bản chạy thật: https://dapp.team1vn.xyz

- `web/`: app web (Next.js). Cách chạy, cấu hình và deploy nằm trong [web/README.md](web/README.md).
- `web/contracts/`: MiuCoin (ERC-20 có EIP-3009), Foundry.
- `character/`: bản thử nhân vật SVG đời đầu (Aiko), app hiện tại không dùng.

Phần tự làm: tài khoản, ví trong trình duyệt, token, facilitator x402, chấm phát âm (wav2vec2 phoneme, ONNX, chạy trên server).
Dịch vụ ngoài: DeepSeek (hoặc Claude) cho Miu, giọng đọc Microsoft Edge cho giọng của Miu.

Mã Sec-MS-GEC trong `web/lib/edge-tts.ts` port từ [msedge-tts](https://github.com/Migushthe2nd/MsEdgeTTS) (MIT).

MIT License.
