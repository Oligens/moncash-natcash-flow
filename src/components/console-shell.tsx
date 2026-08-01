import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutGrid, LogOut, Smartphone, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZakaLogo } from "@/components/zaka-logo";
import { AdminUnlock } from "@/components/admin-unlock";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Applications", icon: LayoutGrid },
  { to: "/relay", label: "Zaka Relay", icon: Smartphone },
  { to: "/api-docs", label: "API", icon: Terminal },
] as const;

export function ConsoleShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });


  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/">
              <ZakaLogo markClassName="size-8" />
            </Link>
            <div className="flex flex-wrap items-center gap-1">
              {NAV.map((item) => (
                <Button
                  key={item.to}
                  asChild
                  variant="ghost"
                  size="sm"
                  className={cn("gap-2", pathname.startsWith(item.to) && "bg-secondary")}
                >
                  <Link to={item.to}>
                    <item.icon className="size-4" /> {item.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
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
