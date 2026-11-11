import { createGroupInput, membership } from "@/contracts/foundation";
import { createGroup } from "@/server/groups";
import { write } from "@/server/http";

export const POST = write(createGroupInput, membership, 201, (db, { actor }, body) => createGroup(db, actor.userId, body));
