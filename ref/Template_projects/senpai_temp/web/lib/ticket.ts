import "server-only";
import { randomUUID } from "node:crypto";
import { sign, verify } from "./signed";

// A ticket is what one paid session buys: one interview room for one scenario,
// opened before `exp`. Its id becomes the interview id.
export type Ticket = { id: string; uid: number; role: string; scenario: string; payer: string; tx: string; exp: number };

export const issueTicket = (t: Omit<Ticket, "id">) => sign("ticket", { id: randomUUID(), ...t });
export const readTicket = (token: string | null | undefined) => verify<Ticket>("ticket", token);
