/** 0030 적용 뒤, 암호화 전에 저장된 평문(key_version 0)을 암호화한다. 지우지 않고 그 자리에서 바꾼다.
 *
 * node scripts/encrypt-existing-data.mts                 -> 바꿀 행 수만 센다 (아무것도 바꾸지 않음)
 * node scripts/encrypt-existing-data.mts --apply         -> 평문을 암호화한다
 * node scripts/encrypt-existing-data.mts --decrypt       -> (되돌리기) 암호문을 평문으로 바꿀 행 수만 센다
 * node scripts/encrypt-existing-data.mts --decrypt --apply -> 암호문을 평문(key_version 0)으로 되돌린다
 *
 * 필요한 환경변수 (셸에서 직접 넘긴다. 출력하지 않는다):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  -> 대상 DB. 모든 사용자 행을 바꿔야 해서 service role이 필요하다.
 *   DATA_ENCRYPTION_KEY_<n>, DATA_ENCRYPTION_KEY_CURRENT, DATA_HMAC_KEY_1 -> 그 DB를 쓰는 서버와 "같은" 키.
 * 여러 번 돌려도 안전하다. 이미 바뀐 행은 key_version 조건 때문에 다시 건드리지 않는다.
 * .env 파일은 일부러 읽지 않는다: 로컬 키로 dev/prod 데이터를 암호화하면 그 서버가 영영 읽지 못한다.
 */
import { createClient } from "@supabase/supabase-js";
import { userCipher, serverCipherKeys } from "../src/lib/conversation-cipher.ts";

const apply = process.argv.includes("--apply");
const decrypt = process.argv.includes("--decrypt");
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없어요. 아무것도 바꾸지 않았습니다."); process.exit(1); }
let keys: ReturnType<typeof serverCipherKeys>;
try { keys = serverCipherKeys(process.env); }
catch { console.error("DATA_ENCRYPTION_KEY_<n> / DATA_ENCRYPTION_KEY_CURRENT / DATA_HMAC_KEY_1을 셸에서 넘겨 주세요. 아무것도 바꾸지 않았습니다."); process.exit(1); }
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const PAGE = 200;

type Target = { table: string; column: "content" | "summary"; version: string; key: string[] };
const targets: Target[] = [
  { table: "conversation_messages", column: "content", version: "content_key_version", key: ["user_id", "id"] },
  { table: "conversation_memories", column: "summary", version: "summary_key_version", key: ["user_id", "id"] },
  { table: "chat_context_state", column: "summary", version: "summary_key_version", key: ["user_id"] },
];

// 바꿀 대상: 암호화면 평문(버전 0)이면서 비어 있지 않은 값, 되돌리기면 암호문(버전 1 이상)
function pending(t: Target) {
  const q = db.from(t.table).select([...t.key, t.column, t.version].join(","), { count: "exact" });
  return decrypt ? q.gt(t.version, 0) : q.eq(t.version, 0).neq(t.column, "");
}

function convert(t: Target, row: Record<string, unknown>) {
  const cipher = userCipher(String(row.user_id), keys);
  const value = String(row[t.column]);
  const version = Number(row[t.version]);
  if (t.column === "content") {
    if (decrypt) return { content: cipher.decryptContent(value, version), content_key_version: 0 };
    const stored = cipher.encryptContent(value);
    return { content: stored.content, content_key_version: stored.key_version, content_hash: stored.hash };
  }
  const table = t.table as "conversation_memories" | "chat_context_state";
  if (decrypt) return { summary: cipher.decryptSummary(table, value, version), summary_key_version: 0 };
  const encrypted = cipher.encryptSummary(table, value);
  return { summary: encrypted.value, summary_key_version: encrypted.keyVersion };
}

console.log(`대상: ${new URL(url).host} / 모드: ${decrypt ? "되돌리기(복호화)" : "암호화"} / ${apply ? "실제 변경" : "확인만"}`);
for (const t of targets) {
  const { count, error } = await pending(t).limit(1);
  if (error) throw Error(`${t.table}: 조회 실패`);
  console.log(`- ${t.table}.${t.column}: ${count ?? 0}행`);
  if (!apply) continue;
  let changed = 0;
  for (;;) {
    const { data, error: readError } = await pending(t).limit(PAGE);
    if (readError) throw Error(`${t.table}: 조회 실패`);
    if (!data?.length) break;
    let progressed = 0;
    for (const row of data as unknown as Record<string, unknown>[]) {
      // 읽은 뒤 앱이 같은 행을 바꿨으면(버전이 달라졌으면) 건드리지 않는다.
      let update = db.from(t.table).update(convert(t, row)).eq(t.version, row[t.version] as number);
      for (const k of t.key) update = update.eq(k, row[k] as string);
      const { data: done, error: writeError } = await update.select(t.key[0]);
      if (writeError) throw Error(`${t.table}: 저장 실패`);
      progressed += done?.length ?? 0;
    }
    changed += progressed;
    if (!progressed) break; // 남은 행이 모두 동시에 바뀐 경우 무한 반복하지 않는다
  }
  console.log(`  -> ${changed}행 변경`);
}
