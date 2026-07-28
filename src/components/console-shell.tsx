import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutGrid, LogOut, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-display text-lg font-bold">
              Kès<span className="text-primary">Pro</span>
            </Link>
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link to="/dashboard">
                  <LayoutGrid className="size-4" /> Applications
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link to="/api-docs">
                  <Terminal className="size-4" /> API
                </Link>
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" /> Déconnexion
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
