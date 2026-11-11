import { currentUser } from "@/lib/auth";
import { WELCOME_UNITS } from "@/lib/config";
import { grantWelcome } from "@/lib/welcome";

// POST /api/faucet -> the welcome gift (100,000 test MIU), for when the automatic
// mint after sign-up did not go through. Once per account.
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not_signed_in" }, { status: 401 });
  try {
    const tx = await grantWelcome(user);
    if (!tx) return Response.json({ error: "already_welcomed" }, { status: 409 });
    return Response.json({ tx, amount: WELCOME_UNITS.toString() });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "faucet_failed" }, { status: 503 });
  }
}
