import { me, patchMeInput } from "@/contracts/foundation";
import { read, write } from "@/server/http";
import { readMe, updateContact } from "@/server/profiles";

export const GET = read(me, (db, { actor }) => readMe(db, actor), { createProfile: true });
export const PATCH = write(patchMeInput, me, 200, (db, { actor }, body) => updateContact(db, actor, body.contactPrivate));
