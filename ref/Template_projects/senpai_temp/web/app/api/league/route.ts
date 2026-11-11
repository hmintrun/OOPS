import { ok, route } from "@/lib/http";
import { league } from "@/lib/progress";

// GET /api/league -> this week's board.
export const GET = route((user) => ok(league(user.id, user.username)));
