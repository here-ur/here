/** here-dev only: apply the withdrawal migrations and try a withdrawal end to end with a throwaway account.
 * No db push, no production. SUPABASE_ACCESS_TOKEN stays in an ignored .env.development.local or the shell; nothing secret is printed.
 * node scripts/try-member-withdrawal.mts          -> inspect only
 * node scripts/try-member-withdrawal.mts --apply  -> apply 0025/0026/0027/0028 if missing
 * node scripts/try-member-withdrawal.mts --try    -> create a test member, withdraw, cancel within the grace period,
 *                                                    withdraw again, finalize after 7 days (sign-in blocked), then purge
 * Optional: a running `npm run dev` on APP_URL (default http://localhost:3100) is also checked with the old token.
 */
import env from '@next/env';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

env.loadEnvConfig(process.cwd(), true);
const ref = 'mwjwfumpxdlllikcdvkh';
const url = `https://${ref}.supabase.co`;
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== url || process.env.VERCEL_ENV === 'production') throw Error('development_database_required');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!token) { console.error('SUPABASE_ACCESS_TOKEN is not configured. No database changes made.'); process.exit(1); }

async function query(sql: string, readOnly: boolean): Promise<Record<string, unknown>[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error(`database_query_failed_${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw Error('invalid_database_response');
  return body;
}
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

const probe = async () => (await query(`select
  to_regprocedure('public.withdraw_member()') is not null as withdraw_fn,
  to_regprocedure('public.purge_withdrawn_members()') is not null as purge_fn,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='members' and column_name='withdrawn_at') as withdrawn_col,
  exists(select 1 from cron.job where jobname='here-withdrawn-purge') as purge_cron,
  to_regprocedure('public.cancel_withdrawal()') is not null as cancel_fn,
  to_regprocedure('public.finalize_withdrawals()') is not null as finalize_fn,
  exists(select 1 from cron.job where jobname='here-withdrawal-finalize') as finalize_cron,
  to_regclass('public.privacy_consents') is not null as launch_hardening_0024`, true))[0];
const apply = async (file: string) => { await query(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'), false); console.log(`${file}: applied`); };

const before = await probe();
console.log('here-dev state:', before);
if (process.argv.includes('--apply')) {
  const parts = [before.withdraw_fn, before.purge_fn, before.withdrawn_col];
  if (parts.some(Boolean) && !parts.every(Boolean)) throw Error('partial_0025_requires_review');
  if (!parts.every(Boolean)) await apply('0025_member_withdrawal.sql'); else console.log('0025: already present');
  if (!before.purge_cron) await apply('0026_withdrawn_purge_cron.sql'); else console.log('0026: already present');
  if (before.cancel_fn !== before.finalize_fn) throw Error('partial_0027_requires_review');
  if (!before.cancel_fn) await apply('0027_withdrawal_grace.sql'); else console.log('0027: already present');
  if (!before.finalize_cron) await apply('0028_withdrawal_finalize_cron.sql'); else console.log('0028: already present');
  await query("notify pgrst, 'reload schema';", false);
  const after = await probe();
  if (Object.entries(after).some(([k, v]) => k !== 'launch_hardening_0024' && v !== true)) throw Error('migration_verification_failed');
  console.log('verified:', after);
}

if (process.argv.includes('--try')) {
  const keys = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()) as { name: string; type?: string; api_key: string }[];
  const service = keys.find(k => k.name === 'service_role')?.api_key ?? keys.find(k => k.type === 'secret')?.api_key;
  if (!service) throw Error('service_key_unavailable');
  const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const anon = { apikey: publishable, 'Content-Type': 'application/json' };
  const email = `withdraw-test-${Date.now()}@here.test`;
  const password = randomBytes(18).toString('base64url');
  const created = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }) }).then(r => r.json()) as { id?: string };
  if (!created.id) throw Error('test_user_create_failed');
  const id = created.id;
  console.log('test account created (here.test address, deleted at the end)');
  const appUrl = process.env.APP_URL ?? 'http://localhost:3100';
  type Tokens = { access_token?: string; refresh_token?: string; error_code?: string; code?: string };
  const signIn = async () => { const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: anon, body: JSON.stringify({ email, password }) }); return { ok: r.ok, status: r.status, body: await r.json() as Tokens }; };
  const rpc = async (name: string, access?: string) => { const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...anon, Authorization: `Bearer ${access}` }, body: '{}' }); return r.ok ? await r.json() : `http ${r.status}`; };
  const app = async (access?: string) => { try { return (await fetch(`${appUrl}/api/quota`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15000) })).status; } catch { return null; } };
  const code = (b: Tokens) => b.error_code ?? b.code;
  try {
    await query(`insert into public.members(user_id) values(${literal(id)}) on conflict do nothing`, false);
    const first = await signIn();
    check('test member can sign in', Boolean(first.body.access_token));
    const appBefore = await app(first.body.access_token);
    if (appBefore !== null) check('app API accepts the member', appBefore === 200, `status ${appBefore}`);
    else console.log('SKIP app API checks (no dev server at APP_URL)');

    check('withdraw_member returns ok', (await rpc('withdraw_member', first.body.access_token)) === 'ok');
    const [row] = await query(`select m.withdrawn_at is not null as marked, coalesce(u.banned_until > now(), false) as banned,
      (select count(*)::int from auth.sessions s where s.user_id=u.id) as sessions
      from auth.users u join public.members m on m.user_id=u.id where u.id=${literal(id)}`, true);
    check('member is marked withdrawn', row?.marked === true);
    check('not banned during the grace period', row?.banned === false);
    check('all sessions removed', row?.sessions === 0, `sessions ${row?.sessions}`);
    const refresh = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: anon, body: JSON.stringify({ refresh_token: first.body.refresh_token }) });
    check('old refresh token is refused', !refresh.ok, `status ${refresh.status}`);
    const user = await fetch(`${url}/auth/v1/user`, { headers: { ...anon, Authorization: `Bearer ${first.body.access_token}` } });
    check('old access token is refused by Auth', !user.ok, `status ${user.status}`);

    const grace = await signIn();
    check('can sign in again during the grace period', Boolean(grace.body.access_token), `status ${grace.status}`);
    const appPending = await app(grace.body.access_token);
    if (appPending !== null) check('app API refuses a withdrawn member', appPending === 403, `status ${appPending}`);
    check('cancel_withdrawal returns ok', (await rpc('cancel_withdrawal', grace.body.access_token)) === 'ok');
    const appRestored = await app(grace.body.access_token);
    if (appRestored !== null) check('app API accepts the member after cancelling', appRestored === 200, `status ${appRestored}`);

    check('withdraw again', (await rpc('withdraw_member', grace.body.access_token)) === 'ok');
    await query(`update public.members set withdrawn_at = now() - interval '7 days 1 minute' where user_id=${literal(id)}`, false);
    const late = await signIn();
    check('cancel after 7 days returns expired', (await rpc('cancel_withdrawal', late.body.access_token)) === 'expired');
    await query('select public.finalize_withdrawals()', false);
    const [fin] = await query(`select coalesce(u.banned_until > now() + interval '1 year', false) as banned, (select count(*)::int from auth.sessions s where s.user_id=u.id) as sessions from auth.users u where u.id=${literal(id)}`, true);
    check('finalize bans the account and drops sessions', fin?.banned === true && fin?.sessions === 0, `sessions ${fin?.sessions}`);
    const blocked = await signIn();
    check('password sign-in is refused as user_banned', !blocked.ok && code(blocked.body) === 'user_banned', `status ${blocked.status}, ${code(blocked.body)}`);

    await query(`update public.members set withdrawn_at = now() - interval '1 year 7 days 1 minute' where user_id=${literal(id)}`, false);
    const [purged] = await query('select public.purge_withdrawn_members() as count', false);
    const [gone] = await query(`select (select count(*)::int from auth.users where id=${literal(id)}) as users, (select count(*)::int from public.members where user_id=${literal(id)}) as members`, true);
    check('purge removes the account one year after it became final', Number(purged?.count) >= 1 && gone?.users === 0 && gone?.members === 0, `purged ${purged?.count}`);
  } finally {
    const [left] = await query(`select count(*)::int as n from auth.users where id=${literal(id)}`, true);
    if (left?.n) { await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin }); console.log('cleanup: test account deleted'); }
  }
  const failed = results.filter(r => !r[1]);
  console.log(failed.length ? `${failed.length} check(s) failed` : 'all checks passed');
  if (failed.length) process.exitCode = 1;
}
