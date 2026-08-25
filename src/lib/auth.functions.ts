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
    if (existing.length) throw new Error("Un compte existe déjà avec cet email");

    const claimed = (await sql`SELECT count(*)::int AS n FROM users WHERE password_hash IS NOT NULL`) as { n: number }[];
    const isFirst = (claimed[0]?.n ?? 0) === 0;
    const hash = await hashPassword(data.password);

    const rows = (await sql`
      INSERT INTO users (email, password_hash, is_admin)
      VALUES (${email}, ${hash}, ${isFirst})
      RETURNING id
    `) as { id: string }[];
    const userId = rows[0]!.id;

    if (isFirst) {
      await sql`
        UPDATE apps SET owner_id = ${userId}
        WHERE owner_id IS NULL
           OR owner_id IN (SELECT id FROM users WHERE password_hash IS NULL)
      `;
    }

    await createSession(userId);
    return { userId, isAdmin: isFirst };
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
    if (!user?.password_hash) throw new Error("Identifiants invalides");
    if (!(await verifyPassword(data.password, user.password_hash))) throw new Error("Identifiants invalides");

    await createSession(user.id);
    return { userId: user.id, isAdmin: user.is_admin };
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
