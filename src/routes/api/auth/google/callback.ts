import { createFileRoute } from "@tanstack/react-router";
import { createSession } from "@/lib/auth.server";
import { db } from "@/lib/db.server";

const STATE_COOKIE = "zaka_google_state";
const DEFAULT_GOOGLE_REDIRECT_URI = "https://zakaproht.vercel.app/api/auth/google/callback";

function getCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function getGoogleRedirectUri() {
  return process.env["GOOGLE_REDIRECT_URI"]?.trim() || DEFAULT_GOOGLE_REDIRECT_URI;
}

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const savedState = getCookie(request, STATE_COOKIE);
        const redirectUri = getGoogleRedirectUri();
        const appOrigin = new URL(redirectUri).origin;
        const failure = `${appOrigin}/auth?oauth_error=google`;
        if (!code || !state || !savedState || !safeEqual(state, savedState)) return Response.redirect(failure, 302);

        const clientId = process.env["GOOGLE_CLIENT_ID"];
        const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
        if (!clientId || !clientSecret) return new Response("Configuration Google incomplète", { status: 500 });

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenResponse.ok) return Response.redirect(failure, 302);
        const tokens = (await tokenResponse.json()) as { access_token?: string };
        if (!tokens.access_token) return Response.redirect(failure, 302);

        const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!profileResponse.ok) return Response.redirect(failure, 302);
        const profile = (await profileResponse.json()) as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
        };
        if (!profile.sub || !profile.email || profile.email_verified === false) return Response.redirect(failure, 302);

        const sql = db();
        const email = profile.email.toLowerCase();
        const existing = (await sql`
          SELECT id FROM users WHERE google_sub = ${profile.sub} OR lower(email) = ${email} LIMIT 1
        `) as { id: string }[];
        let userId = existing[0]?.id;
        if (userId) {
          await sql`UPDATE users SET google_sub = ${profile.sub}, updated_at = now() WHERE id = ${userId}`;
        } else {
          const claimed = (await sql`SELECT count(*)::int AS n FROM users`) as { n: number }[];
          const rows = (await sql`
            INSERT INTO users (email, google_sub, is_admin) VALUES (${email}, ${profile.sub}, ${(claimed[0]?.n ?? 0) === 0})
            RETURNING id
          `) as { id: string }[];
          userId = rows[0]!.id;
        }

        await createSession(userId);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${appOrigin}/dashboard`,
          },
        });
      },
    },
  },
});
