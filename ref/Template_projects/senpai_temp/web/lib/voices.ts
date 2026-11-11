// Miu's own voices, made on the server (lib/tts.ts): an Edge read-aloud voice by
// default, a MiniMax one when the server runs on MiniMax. The key is what Settings
// stores; "" is the default, so a fresh device gets Miu's voice. Edge's standard
// voices only: the Multilingual ones (and Emma, Sonia) slow to 2-5 s a sentence
// when Microsoft is busy, while these stay under ~1 s.
export const MIU_VOICES = [
  { key: "", edge: "en-US-AvaNeural", minimax: "English_radiant_girl", name: "Miu · Tươi tắn" },
  { key: "miu:playful", edge: "en-US-AnaNeural", minimax: "English_PlayfulGirl", name: "Miu · Vui tươi" },
  { key: "miu:soft", edge: "en-US-JennyNeural", minimax: "English_Soft-spokenGirl", name: "Miu · Nhẹ nhàng" },
  { key: "miu:uk", edge: "en-GB-LibbyNeural", minimax: "English_LovelyGirl", name: "Miu · Giọng Anh" },
] as const;

export const miuVoice = (key: string) => MIU_VOICES.find((v) => v.key === key);
