import { draftVersion, sellerResponseInput, versionParam } from "@/contracts/negotiation";
import { unavailable } from "@/server/errors";
import { input, objectId, write } from "@/server/http";
import { requireDraftSeller } from "@/server/negotiation/drafts";
import { approveWithFujiEligibility, prepareVersionApproval } from "@/server/negotiation/rounds";
import { respondToVersion } from "@/server/negotiation/versions";

type PreparedApproval = Awaited<ReturnType<typeof prepareVersionApproval>>;

export const POST = write(sellerResponseInput, draftVersion, 200,
  (db, call, body, prepared?: PreparedApproval) => {
    const id = objectId(call);
    if (body.action === "APPROVE") {
      if (!prepared) throw unavailable();
      return approveWithFujiEligibility(db, call.actor.userId, id, prepared.versionId, prepared.round, body.note);
    }
    return respondToVersion(db, call.actor.userId, id, input(versionParam, call.version), body);
  },
  {
    authorize: (db, call) => requireDraftSeller(db, call.actor.userId, objectId(call)),
    prepare: async (call, body) => body.action === "APPROVE"
      ? prepareVersionApproval(call.actor.userId, objectId(call), input(versionParam, call.version))
      : undefined,
  },
);
