import { SCENARIOS, scenarioByKey } from "@/lib/content";
import { activity, doneInterviews, liveInterview, profile, scenarioCountsSince } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { challenge, habits, league, profileView, streak } from "@/lib/progress";
import { phraseBook } from "@/lib/review";
import { dayEnd } from "@/lib/time";

// GET /api/progress -> everything Home, Profile and Scenarios show.
export const GET = route((user) => {
  const now = Date.now();
  const done = doneInterviews(user.id);
  const book = phraseBook(user.id);
  const lg = league(user.id, user.username);
  const today = challenge();
  const live = liveInterview(user.id);
  const counts = Object.fromEntries(scenarioCountsSince(dayEnd() - 86_400_000).map((c) => [c.scenario, c.n]));
  const best: Record<string, number> = {};
  for (const d of done) best[d.scenario] = Math.max(best[d.scenario] ?? 0, d.score ?? 0);

  const doneToday = done.some((d) => d.scenario === today.key && d.finished_at >= dayEnd() - 86_400_000);
  const next = !doneToday ? today : (SCENARIOS.find((s) => s.key !== "full" && !(s.key in best)) ?? today);
  const answered = live ? (JSON.parse(live.turns) as { who: string }[]).some((t) => t.who === "you") : false;

  return ok({
    username: user.username,
    profile: profileView(profile(user.id)),
    streak: streak(user.id),
    stats: {
      minutes: Math.round(activity(user.id).reduce((s, a) => s + a.secs, 0) / 60),
      sessions: done.length,
      known: book.known.length,
    },
    habits: habits(user.id),
    due: book.due.length,
    phrases: book.due.length + book.later.length + book.known.length,
    league: { rank: lg.me.rank, pts: lg.me.pts, size: lg.board.length, ahead: lg.ahead, top: lg.board.slice(0, 3).map((r) => r.name), endsAt: lg.endsAt },
    challenge: { key: today.key, title: today.title, endsAt: dayEnd(), doneToday },
    // A room still on the clock, or one that ran out with answers waiting for feedback.
    live:
      live && (live.ends_at > now || answered)
        ? { id: live.id, title: scenarioByKey(live.scenario)?.title ?? "", left: Math.max(0, live.total - live.asked), open: live.ends_at > now }
        : null,
    next: { key: next.key, title: next.title, sub: next.sub, practising: counts[next.key] ?? 0 },
    best,
    counts,
  });
});
