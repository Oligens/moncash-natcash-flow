import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | undefined;

/** Client SQL Neon (HTTP) — compatible Cloudflare Workers et Vercel. */
export function db(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];
    if (!url) {
      // En environnement de production (Vercel), on log l'erreur pour le débogage
      console.error("[db.server] Variable d'environnement NEON_DATABASE_URL manquante");
      throw new Error("Configuration de la base de données manquante. Vérifiez les variables d'environnement.");
    }
    _sql = neon(url);
  }
  return _sql;
}

export type Row = Record<string, unknown>;
