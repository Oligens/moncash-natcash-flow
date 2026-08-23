import { createFileRoute } from "@tanstack/react-router";

const STATE_COOKIE = "zaka_google_state";
const stateAge = 10 * 60;
const DEFAULT_GOOGLE_REDIRECT_URI = "https://zakaproht.vercel.app/api/auth/google/callback";

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function getGoogleRedirectUri() {
  return process.env["GOOGLE_REDIRECT_URI"]?.trim() || DEFAULT_GOOGLE_REDIRECT_URI;
}

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async () => {
        const clientId = process.env["GOOGLE_CLIENT_ID"];
        if (!clientId) return new Response("GOOGLE_CLIENT_ID manquant", { status: 500 });

        const state = crypto.randomUUID();
        const redirectUri = getGoogleRedirectUri();
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "openid email profile",
          state,
          access_type: "online",
          prompt: "select_account",
        });
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
            "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${stateAge}`,
          },
        });
      },
    },
  },
});

export { redirect };
