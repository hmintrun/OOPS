// What SenpAI practises, shared by the server (prompts, validation) and the UI.

export const GROUPS = [
  { key: "intro", name: "Mở đầu" },
  { key: "story", name: "Kể chuyện" },
  { key: "close", name: "Lương & chốt" },
] as const;
export type GroupKey = (typeof GROUPS)[number]["key"];

export type Scenario = {
  key: string;
  group: GroupKey | "full";
  title: string;
  sub: string;
  // What Miu should steer the session towards (English, goes into the prompt).
  focus: string;
  // Main questions in one session; follow-ups come on top.
  questions: number;
};

export const SCENARIOS: readonly Scenario[] = [
  { key: "full", group: "full", title: "Phỏng vấn thử đủ vòng", sub: "15 phút, Miu hỏi liên tục từ mở đầu tới chốt", focus: "a complete first-round interview: opening, motivation, two behavioural STAR questions, a salary or availability question, and a chance for the candidate to ask questions", questions: 8 },
  { key: "self", group: "intro", title: "Giới thiệu bản thân", sub: "Câu mở màn, nói gọn trong 1 phút", focus: "'Tell me about yourself' and short follow-ups on their background and why they fit this role", questions: 4 },
  { key: "why", group: "intro", title: "Vì sao chọn công ty này?", sub: "Miu bắt bài câu trả lời chung chung", focus: "motivation: why this company, why this role, why now; push back on generic answers", questions: 4 },
  { key: "sw", group: "intro", title: "Điểm mạnh, điểm yếu", sub: "Cấm nói “tôi quá cầu toàn”", focus: "strengths with evidence and a real weakness with what they do about it; reject cliché weaknesses", questions: 4 },
  { key: "client", group: "story", title: "Xử lý khách khó tính", sub: "Kể theo STAR, phải có kết quả", focus: "behavioural STAR questions about handling a difficult client or customer", questions: 4 },
  { key: "conflict", group: "story", title: "Bất đồng với đồng nghiệp", sub: "Kể sao cho không đổ lỗi", focus: "behavioural STAR questions about disagreeing with a colleague or manager and resolving it", questions: 4 },
  { key: "fail", group: "story", title: "Lần thất bại lớn nhất", sub: "Miu hỏi vặn: rồi học được gì?", focus: "behavioural STAR questions about a failure or mistake and what they learned", questions: 4 },
  { key: "ask", group: "close", title: "Hỏi ngược nhà tuyển dụng", sub: "Đừng hỏi lương ngay câu đầu", focus: "the end of the interview: invite the candidate's questions, answer briefly in character, and react to how good their questions are", questions: 4 },
  { key: "salary", group: "close", title: "Deal lương", sub: "Miu làm HR keo kiệt", focus: "salary expectations and negotiation; you are a stingy HR person who counters low", questions: 4 },
];

export function scenarioByKey(key: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

// Mistake categories. Feedback tags every correction with one, so the profile
// can count habits across sessions.
export const CATEGORIES = {
  tense: "Chia thì",
  article: "Mạo từ a, an, the",
  preposition: "Giới từ",
  word_choice: "Dùng từ",
  word_order: "Trật tự từ",
  plural: "Số ít, số nhiều",
  verb_form: "Dạng động từ",
  literal: "Dịch từng chữ",
  filler: "Ngập ngừng “ờ… à…”",
  structure: "Thiếu kết quả khi kể",
  pronunciation: "Phát âm",
  other: "Khác",
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [Category, ...Category[]];

export const EXPERIENCE = [
  { key: "student", name: "Sinh viên", en: "a student or fresh graduate" },
  { key: "junior", name: "1–3 năm", en: "1 to 3 years of experience" },
  { key: "senior", name: "Trên 3 năm", en: "more than 3 years of experience" },
] as const;

export const WHEN = [
  { key: "this_week", name: "Tuần này", en: "this week" },
  { key: "next_week", name: "Tuần sau", en: "next week" },
  { key: "none", name: "Chưa hẹn", en: "not scheduled yet" },
] as const;

export const SASS = [
  { name: "Hiền", line: ["Hôm qua bạn nói “wanted”", "đúng rồi. Giỏi."], en: "Warm and encouraging. Tease only very lightly." },
  { name: "Vừa", line: ["Chuyện hôm qua thì", "“wanted”. Nói lại."], en: "Deadpan with mild teasing, still kind underneath." },
  { name: "Gắt", line: ["Lại “want”? Tui", "nói mấy lần rồi."], en: "A blunt, sceptical recruiter. Tease more and push hard, but never insult the person." },
] as const;

// The free one-minute warm-up: three short questions, fixed so they cost nothing to ask.
export const WARMUP = [
  { en: "Hi, I'm Miu. Tell me a little about yourself.", vi: "Chào, tui là Miu. Kể sơ về bạn đi." },
  { en: "What do you do now, at work or at school?", vi: "Hiện giờ bạn làm gì, đi làm hay đi học?" },
  { en: "Tell me about something you did that you're proud of.", vi: "Kể một việc bạn làm mà bạn tự hào." },
] as const;
export const WARMUP_SECONDS = 60;
