/** Targeted development rollout. No db push, no production, no automatic cron activation.
 * SUPABASE_ACCESS_TOKEN stays in an ignored .env.development.local/.env.local or the shell.
 * node scripts/activate-development-context.mts          -> inspect schema
 * node scripts/activate-development-context.mts --apply  -> apply only missing, known migrations
 */
import env from '@next/env';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

env.loadEnvConfig(process.cwd(), true);
const ref = 'mwjwfumpxdlllikcdvkh';
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` || process.env.VERCEL_ENV === 'production') throw Error('development_database_required');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('SUPABASE_ACCESS_TOKEN is not configured. No database or environment changes made.'); process.exit(1); }
async function query(sql: string, readOnly: boolean): Promise<Record<string, unknown>[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) { await response.body?.cancel(); throw Error(`database_query_failed_${response.status}`); }
  const body = await response.json();
  if (!Array.isArray(body)) throw Error('invalid_database_response');
  return body;
}
const apply = process.argv.includes('--apply');
const base = await query(`select to_regclass('public.conversation_memories') is not null as memories,
 to_regclass('public.conversation_batches') is not null as batches,
 to_regprocedure('public.conversation_is_enabled()') is not null as consent,
 to_regprocedure('public.finish_memory(uuid,uuid,text,extensions.vector,text,text)') is not null as finish;`, true);
if (Object.values(base[0] ?? {}).some(x => x !== true) || !base[0]) throw Error('existing_memory_migrations_required');
const migrations = [
 { file: '0018_conversation_worker.sql', probe: "select to_regclass('public.conversation_worker_runs') is not null as table_ready, to_regprocedure('public.claim_conversation_work(text)') is not null as function_ready" },
 { file: '0021_conversation_context.sql', probe: "select to_regclass('public.chat_context_state') is not null as table_ready, to_regprocedure('public.context_access_revision()') is not null as function_ready" },
 { file: '0023_live_context_snapshot.sql', probe: "select to_regprocedure('public.read_live_context()') is not null as function_ready" },
];
for (const migration of migrations) {
  const [state] = await query(migration.probe, true);
  const flags = Object.values(state);
  if (flags.every(x => x === true)) { console.log(`${migration.file}: already present`); continue; }
  if (flags.some(x => x === true)) throw Error(`partial_migration_requires_review_${migration.file}`);
  if (!apply) { console.log(`${migration.file}: missing`); continue; }
  await query(await readFile(new URL('../supabase/migrations/' + migration.file, import.meta.url), 'utf8'), false);
  const [verified] = await query(migration.probe, true);
  if (!Object.values(verified).every(x => x === true)) throw Error(`migration_verification_failed_${migration.file}`);
  console.log(`${migration.file}: applied and verified`);
}
if (apply) {
  await query("notify pgrst, 'reload schema';", false);
  const envPath = fileURLToPath(new URL('../.env.development.local', import.meta.url));
  let text = await readFile(envPath, 'utf8').catch(() => '');
  text = /^MEMORY_ENABLED=.*$/m.test(text) ? text.replace(/^MEMORY_ENABLED=.*$/m, 'MEMORY_ENABLED=true') : text.trimEnd() + '\nMEMORY_ENABLED=true\n';
  await writeFile(envPath, text); await chmod(envPath, 0o600);
  console.log('Local MEMORY_ENABLED=true. Remote deployment and cron settings are unchanged.');
}
