import { notificationInput, notificationList, notificationQuery, notificationReadAllResult } from "@/contracts/orders";
import { input, queryParams, read, write } from "@/server/http";
import { listNotifications, markAllNotificationsRead } from "@/server/notifications";

export const GET = read(notificationList, (db, call) => listNotifications(db, call.actor.userId, input(notificationQuery, queryParams(call.request))));

export const PATCH = write(notificationInput, notificationReadAllResult, 200,
  (db, call) => markAllNotificationsRead(db, call.actor.userId),
);
