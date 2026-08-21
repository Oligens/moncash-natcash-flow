import { getSessionUser } from "./auth.server";

/** Guard for every future /api/admin/* handler. Client storage is never trusted. */
export async function requireAdminApiRequest() {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return {
      user: null,
      response: new Response(JSON.stringify({ error: "Accès administrateur requis" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    } as const;
  }
  return { user, response: null } as const;
}