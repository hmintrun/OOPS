import { createReliefInput, reliefList, reliefRequest } from "@/contracts/relief";
import { read, write } from "@/server/http";
import { createReliefRequest, listReliefRequests } from "@/server/relief";

export const GET = read(reliefList, (db, call) => listReliefRequests(db, call.actor.userId, call.actor.phone));

export const POST = write(
  createReliefInput,
  reliefRequest,
  201,
  (db, call, body) => createReliefRequest(db, call.actor.userId, body),
);
