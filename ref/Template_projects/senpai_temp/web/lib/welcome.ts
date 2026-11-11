import "server-only";
import { WELCOME_UNITS } from "./config";
import { record, welcomed } from "./db";
import { mint } from "./relayer";

// Every account gets WELCOME_UNITS test MIU once, minted by the relayer right
// after sign-up (or on the next login for accounts made before the gift existed).
const inFlight = new Map<number, Promise<string | null>>();

export type WelcomeState = "done" | "pending" | "missing";

export function welcomeState(userId: number): WelcomeState {
  if (inFlight.has(userId)) return "pending";
  return welcomed(userId, WELCOME_UNITS) ? "done" : "missing";
}

// Resolves to the mint tx, or null when the gift was already given.
export function grantWelcome(user: { id: number; address: string }): Promise<string | null> {
  const running = inFlight.get(user.id);
  if (running) return running;
  if (welcomed(user.id, WELCOME_UNITS)) return Promise.resolve(null);
  const job = mint(user.address as `0x${string}`, WELCOME_UNITS)
    .then((tx) => {
      record({ tx, userId: user.id, kind: "faucet", amount: WELCOME_UNITS });
      return tx;
    })
    .finally(() => inFlight.delete(user.id));
  inFlight.set(user.id, job);
  return job;
}
