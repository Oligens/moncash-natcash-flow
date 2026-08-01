export const ADMIN_UNLOCK_KEY = "zaka.admin.unlocked";

export function isAdminUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdminUnlocked(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
    else window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  } catch {
    /* stockage indisponible */
  }
}
