import { createFileRoute } from "@tanstack/react-router";

const STATE_COOKIE = "zaka_google_state";
const stateAge = 10 * 60;

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function getBaseUrl(request: Request) {
  return process.env["BASE_URL"]?.replace(/\/$/, "") ?? new URL(request.url).origin;
}

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env["GOOGLE_CLIENT_ID"];
        if (!clientId) return new Response("GOOGLE_CLIENT_ID manquant", { status: 500 });

        const state = crypto.randomUUID();
        const callback = `${getBaseUrl(request)}/api/auth/google/callback`;
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: callback,
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