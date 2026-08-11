import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
const sql = neon(process.env.NEON_DATABASE_URL);
const file = fs.readFileSync('db/schema.sql','utf8');
const stmts = file.split(/;\s*\n(?=[A-Z-]|$)/).map(s=>s.trim()).filter(s=>s && !s.startsWith('--'));
for (const s of stmts) { await sql.query(s); }
console.log('ok', (await sql`select count(*) from users`)[0]);
