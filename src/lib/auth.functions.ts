import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentials = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(200),
});

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input) => credentials.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { hashPassword, createSession } = await import("./auth.server");
    const sql = db();
    const email = data.email.toLowerCase();

    const existing = (await sql`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`) as { id: string }[];
    if (existing.length) return { ok: false as const, error: "Un compte existe déjà avec cet email" };

    const claimed = (await sql`SELECT count(*)::int AS n FROM users WHERE password_hash IS NOT NULL`) as { n: number }[];
    const isFirst = (claimed[0]?.n ?? 0) === 0;
    const hash = await hashPassword(data.password);

    const rows = (await sql`
      INSERT INTO users (email, password_hash, is_admin)
      VALUES (${email}, ${hash}, ${isFirst})
      RETURNING id
    `) as { id: string }[];
    const userId = rows[0]?.id;
    if (!userId) return { ok: false as const, error: "Impossible de créer le compte" };

    if (isFirst) {
      await sql`
        UPDATE apps SET owner_id = ${userId}
        WHERE owner_id IS NULL
           OR owner_id IN (SELECT id FROM users WHERE password_hash IS NULL)
      `;
    }

    await createSession(userId);
    return { ok: true as const, userId, isAdmin: isFirst };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((input) => credentials.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { verifyPassword, createSession } = await import("./auth.server");
    const sql = db();
    const rows = (await sql`
      SELECT id, password_hash, is_admin
      FROM users
      WHERE lower(email) = ${data.email.toLowerCase()}
      LIMIT 1
    `) as { id: string; password_hash: string | null; is_admin: boolean }[];
    const user = rows[0];

    // Expected credential failures are returned as data, not thrown as
    // server errors, so the browser no longer reports a misleading HTTP 500.
    if (!user?.password_hash) return { ok: false as const, error: "Identifiants invalides" };
    if (!(await verifyPassword(data.password, user.password_hash))) {
      return { ok: false as const, error: "Identifiants invalides" };
    }

    await createSession(user.id);
    return { ok: true as const, userId: user.id, isAdmin: user.is_admin };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession } = await import("./auth.server");
  await destroySession();
  return { ok: true };
});

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("./auth.server");
  return await getSessionUser();
});
