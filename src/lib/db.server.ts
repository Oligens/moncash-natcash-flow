import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | undefined;

/** Client SQL Neon (HTTP) — compatible Cloudflare Workers et Vercel. */
export function db(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"];
    if (!url) throw new Error("NEON_DATABASE_URL manquant");
    _sql = neon(url);
  }
  return _sql;
}

export type Row = Record<string, unknown>;
