import { scenarioByKey } from "@/lib/content";
import { doneInterviews } from "@/lib/db";
import { ok, route } from "@/lib/http";

// GET /api/interviews -> finished sessions, newest first.
export const GET = route((user) =>
  ok(doneInterviews(user.id).map((d) => ({ id: d.id, title: scenarioByKey(d.scenario)?.title ?? d.scenario, score: d.score, at: d.finished_at }))),
);
