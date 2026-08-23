import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { unlockAdminAccess } from "@/lib/admin.functions";
import { setAdminUnlocked } from "@/lib/admin-gate";

/** Déclencheur secret : Alt + Ctrl + P ouvre la connexion administrateur. */
export function AdminUnlock() {
  const navigate = useNavigate();
  const unlock = useServerFn(unlockAdminAccess);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.ctrlKey && (event.key === "p" || event.key === "P" || event.code === "KeyP")) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await unlock({ data: { email, password } });
      if (!result.ok) {
        // Afficher le message d'erreur spécifique si disponible
        setError((result as any)?.error || "Accès refusé.");
        return;
      }
      setAdminUnlocked(true);
      setOpen(false);
      setPassword("");
      await navigate({ to: "/admin-zaka-pro" });
    } catch (err) {
      console.error("[ADMIN] Erreur lors du déverrouillage:", err);
      setError("Erreur de connexion. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEmail("");
          setPassword("");
          setError("");
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Accès restreint
          </DialogTitle>
          <DialogDescription>
            Zone réservée au créateur de la plateforme Zaka.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email administrateur</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Mot de passe administrateur</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending || password.length === 0 || email.length === 0}>
            {pending ? "Vérification…" : "Déverrouiller"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
