import { acceptInviteInput, membership } from "@/contracts/foundation";
import { acceptInvite } from "@/server/groups";
import { write } from "@/server/http";

export const POST = write(acceptInviteInput, membership, 200, (db, { actor }, body) => acceptInvite(db, actor.userId, body.token));
