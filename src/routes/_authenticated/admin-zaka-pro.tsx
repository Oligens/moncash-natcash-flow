import { createFileRoute, notFound } from "@tanstack/react-router";
import { isAdminUnlocked } from "@/lib/admin-gate";
import { AdminPage } from "./admin";

export const Route = createFileRoute("/_authenticated/admin-zaka-pro")({
  beforeLoad: () => {
    if (!isAdminUnlocked()) throw notFound();
  },
  component: AdminPage,
});