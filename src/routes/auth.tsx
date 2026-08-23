import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "@/lib/auth.functions";
import { ZakaMark } from "@/components/zaka-logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Console Zaka" },
      { name: "description", content: "Connectez-vous à la console de gestion Zaka avec votre e-mail et votre mot de passe." },
      { property: "og:title", content: "Connexion — Console Zaka" },
      { property: "og:description", content: "Accès sécurisé à la console Zaka." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp({ data: { email, password } });
        toast.success("Compte créé. Vous êtes connecté.");
      } else {
        await signIn({ data: { email, password } });
        toast.success("Connexion réussie.");
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="surface-hero flex min-h-screen items-center justify-center px-6">
      <div className="card-elevated w-full max-w-sm rounded-2xl border border-border bg-card p-8">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <ZakaMark className="size-9 sm:size-10" />
          <span>Za<span className="text-primary">ka</span></span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "Connectez-vous avec votre e-mail." : "Créez votre compte Zaka."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Traitement…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-5 w-full text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "J'ai déjà un compte"}
        </button>
      </div>
    </main>
  );
}
