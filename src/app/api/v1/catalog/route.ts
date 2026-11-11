import { catalog, catalogQuery } from "@/contracts/foundation";
import { listCatalog } from "@/server/campaigns";
import { input, queryParams, read } from "@/server/http";

export const GET = read(catalog, (db, { request }) => listCatalog(db, input(catalogQuery, queryParams(request)).category));
