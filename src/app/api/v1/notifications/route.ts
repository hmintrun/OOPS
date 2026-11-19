import { notificationList, notificationQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listNotifications } from "@/server/notifications";

export const GET = read(notificationList, (db, call) => listNotifications(db, call.actor.userId, input(notificationQuery, queryParams(call.request))));
