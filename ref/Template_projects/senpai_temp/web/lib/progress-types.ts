import type { Habit, ProfileView } from "./progress";

// Shape of GET /api/progress, for the client.
export type Progress = {
  username: string;
  profile: ProfileView;
  streak: {
    days: number;
    todayDone: boolean;
    todaySecs: number;
    week: { key: string; label: string; state: "done" | "frozen" | "missed" | "today" }[];
    endsAt: number;
    freezes: number;
  };
  stats: { minutes: number; sessions: number; known: number };
  habits: Habit[];
  due: number;
  phrases: number;
  league: { rank: number; pts: number; size: number; ahead: { name: string; gap: number } | null; top: string[]; endsAt: number };
  challenge: { key: string; title: string; endsAt: number; doneToday: boolean };
  live: { id: string; title: string; left: number; open: boolean } | null;
  next: { key: string; title: string; sub: string; practising: number };
  best: Record<string, number>;
  counts: Record<string, number>;
};
