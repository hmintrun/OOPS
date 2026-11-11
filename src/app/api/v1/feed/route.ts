import { feed, feedQuery } from "@/contracts/foundation";
import { readFeed } from "@/server/campaigns";
import { input, queryParams, read } from "@/server/http";

export const GET = read(feed, (db, { request }) => readFeed(db, input(feedQuery, queryParams(request))));
