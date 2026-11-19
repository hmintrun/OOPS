import { notification, notificationInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { markNotificationRead } from "@/server/notifications";

export const PATCH = write(notificationInput, notification, 200,
  (db, call) => markNotificationRead(db, call.actor.userId, objectId(call)),
);
