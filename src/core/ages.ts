/**
 * Age groups a lesson is written for. The age shapes what the AI is asked to
 * write, which slide types make sense, and which themes are suggested.
 */

export type AgeBand = "preschool" | "lower-primary" | "upper-primary" | "secondary" | "adult";

export interface AgeProfile {
  id: AgeBand;
  label: string;
  /** Short form for theme hints, e.g. "3–5". */
  years: string;
  /** Told to the AI: what children of this age can handle. */
  guidance: string;
  /** Slide types that need more reading or analysis than this age can manage. */
  avoid: string[];
  /** New words per lesson when the teacher gives no word list. */
  words: [number, number];
  /** Theme a lesson made for this age starts with. */
  theme: string;
  /** Pictures found automatically are drawings rather than photos. */
  clipart: boolean;
  /** Games are suggested by default; for adults they are there only when the teacher adds them. */
  games: boolean;
}

export const AGE_PROFILES: AgeProfile[] = [
  {
    id: "preschool",
    label: "Mầm non (3–5 tuổi)",
    years: "3–5",
    guidance:
      "Trẻ chưa biết đọc: chỉ dạy danh từ cụ thể nhìn thấy được và lời chào đơn giản; câu hỏi thật ngắn để giáo viên đọc to; mỗi slide rất ít chữ; nhiều trò chơi bằng hình.",
    avoid: ["grammar", "fill-blank", "sentence-order"],
    words: [4, 6],
    theme: "panda",
    clipart: true,
    games: true,
  },
  {
    id: "lower-primary",
    label: "Tiểu học lớp 1–3 (6–8 tuổi)",
    years: "6–8",
    guidance:
      "Trẻ mới đọc được tiếng Việt: từ cụ thể, mẫu câu rất ngắn (3–5 chữ Hán), giải thích tiếng Việt đơn giản; xen kẽ trò chơi để giữ tập trung.",
    avoid: [],
    words: [5, 8],
    theme: "garden",
    clipart: true,
    games: true,
  },
  {
    id: "upper-primary",
    label: "Tiểu học lớp 4–5 (9–11 tuổi)",
    years: "9–11",
    guidance:
      "Học được mẫu câu và hội thoại ngắn; giải thích ngữ pháp bằng ví dụ thay vì thuật ngữ; vẫn cần trò chơi nhưng ít hơn.",
    avoid: [],
    words: [6, 10],
    theme: "notebook",
    clipart: false,
    games: true,
  },
  {
    id: "secondary",
    label: "THCS (12 tuổi trở lên)",
    years: "12+",
    guidance:
      "Học được cấu trúc ngữ pháp có tên gọi, câu dài hơn và hội thoại theo tình huống; ít trò chơi trẻ con, nhiều câu hỏi luyện tập.",
    avoid: [],
    words: [8, 12],
    theme: "ink",
    clipart: false,
    games: true,
  },
  {
    id: "adult",
    label: "Người lớn / sinh viên",
    years: "15+",
    guidance:
      "Người học tự đọc được và học có hệ thống: gọi đúng tên ngữ pháp (chủ ngữ, vị ngữ, lượng từ, bổ ngữ…) và từ loại; giải thích rõ cách dùng, từ mở rộng, từ trái nghĩa; câu ví dụ dài hơn, có pinyin và nghĩa; luyện dịch Việt–Trung và đặt câu. Trò chơi trẻ con không phù hợp; nếu có hoạt động thì là thi đua theo đội.",
    avoid: ["whats-missing", "guess-picture", "memory"],
    words: [10, 15],
    theme: "classic",
    clipart: false,
    games: false,
  },
];

export function ageProfile(id: AgeBand): AgeProfile {
  return AGE_PROFILES.find((a) => a.id === id) ?? AGE_PROFILES[0]!;
}

/** "3–8 tuổi" for a theme suited to preschool and lower primary. */
export function ageRangeLabel(ages: AgeBand[]): string {
  const picked = AGE_PROFILES.filter((a) => ages.includes(a.id));
  if (!picked.length) return "";
  const from = picked[0]!.years.split("–")[0]!.replace("+", "");
  const last = picked[picked.length - 1]!.years;
  return last.endsWith("+") ? `${from}+ tuổi` : `${from}–${last.split("–")[1]} tuổi`;
}
