import { ok, route } from "@/lib/http";
import { phraseBook } from "@/lib/review";

// GET /api/phrases -> { due, later, known }
export const GET = route((user) => ok(phraseBook(user.id)));
