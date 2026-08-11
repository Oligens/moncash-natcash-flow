import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
const sql = neon(process.env.NEON_DATABASE_URL);
const rd = f => fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const apps = rd('apps.jsonl'), subs = rd('subs.jsonl');
const roles = [['6f91544a-e09d-43ed-be79-abfd160ecde2',true],['2164b895-15d0-416e-b2b5-2c4797766306',false],['721b8fcd-bc0f-4e58-9cb9-9ce1d7d5374d',false]];
for (const [id, admin] of roles) {
  await sql`insert into users (id, email, password_hash, is_admin) values (${id}, ${'legacy-'+id.slice(0,8)+'@zaka.local'}, null, ${admin}) on conflict (id) do nothing`;
}
for (const a of apps) {
  await sql`insert into apps (id,name,slug,api_key,owner_id,moncash_number,natcash_number,qr_image_url,sender_whitelist,amount_regex,name_regex,reference_regex,strict_name_match,relay_last_seen_at,created_at,updated_at)
    values (${a.id},${a.name},${a.slug},${a.api_key},${a.owner_id},${a.moncash_number},${a.natcash_number},${a.qr_image_url},${a.sender_whitelist},${a.amount_regex},${a.name_regex},${a.reference_regex},${a.strict_name_match},${a.relay_last_seen_at},${a.created_at},${a.updated_at ?? a.created_at})
    on conflict (id) do nothing`;
}
for (const s of subs) {
  await sql`insert into subscriptions (id,app_id,user_id,user_phone,account_name,provider,plan_type,amount,status,reference,created_at,expires_at)
    values (${s.id},${s.app_id},${s.user_id},${s.user_phone},${s.account_name},${s.provider},${s.plan_type},${s.amount},${s.status},${s.reference},${s.created_at},${s.expires_at}) on conflict (id) do nothing`;
}
console.log(await sql`select (select count(*) from users) users,(select count(*) from apps) apps,(select count(*) from subscriptions) subs`);
