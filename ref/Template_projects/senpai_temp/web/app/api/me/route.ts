import { currentUser } from "@/lib/auth";

// GET /api/me -> who is signed in, plus the encrypted wallet so a reloaded
// page can unlock it again with the password.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not_signed_in" }, { status: 401 });
  return Response.json(
    { username: user.username, address: user.address, keystore: JSON.parse(user.keystore) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
