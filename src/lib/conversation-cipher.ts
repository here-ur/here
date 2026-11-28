// 서버 전용. 사용자 한 명의 대화 원문·기억 요약을 암호화/복호화하는 도우미.
// AAD에 user_id가 들어가므로 요청한 사용자(또는 작업자가 받은 job.user_id)로만 만든다.
import {
  batchFingerprint, contentHash, decryptField, encryptField, fieldAad, FieldCipherError, loadCipherKeys, type CipherKeys,
} from "./field-cipher.ts";

export type SummaryTable = "conversation_memories" | "chat_context_state";
export type PlainHistoryMessage = { id: string; role: string; content: string; at: string };
export type StoredHistoryMessage = PlainHistoryMessage & { key_version: number; hash: string };

let cached: { source: string; keys: CipherKeys } | undefined;

/** 환경변수의 키를 읽는다. 값이 바뀌지 않으면 다시 파싱하지 않는다. 키가 없으면 에러(평문 저장 금지). */
export function serverCipherKeys(env: Record<string, string | undefined> = process.env): CipherKeys {
  const source = Object.keys(env).filter(k => k.startsWith("DATA_")).sort().map(k => `${k}=${env[k]}`).join("\n");
  if (cached?.source !== source) cached = { source, keys: loadCipherKeys(env) };
  return cached.keys;
}

export function userCipher(userId: string, keys: CipherKeys = serverCipherKeys()) {
  // user_id가 빠진 작업 데이터(0030 이전 DB 등)로 "undefined" 사용자 기준 암호문이 생기지 않게 막는다.
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new FieldCipherError("invalid_user");
  const contentAad = fieldAad("conversation_messages", "content", userId);
  /** 대화 한 건: 암호문, 키 버전, 재전송 비교용 원문 HMAC. */
  const encryptContent = (plain: string): { content: string; key_version: number; hash: string } => {
    const encrypted = encryptField(plain, contentAad, keys);
    return { content: encrypted.value, key_version: encrypted.keyVersion, hash: contentHash(plain, keys) };
  };
  return {
    encryptContent,
    /** save_conversation_batch에 넘길 메시지 배열과 원문 기준 배치 지문. */
    encryptBatch(messages: readonly PlainHistoryMessage[]): { messages: StoredHistoryMessage[]; fingerprint: string } {
      return {
        messages: messages.map(m => ({ ...m, ...encryptContent(m.content) })),
        fingerprint: batchFingerprint(messages, keys),
      };
    },
    decryptContent(value: string, keyVersion: number): string {
      return decryptField(value, keyVersion, contentAad, keys);
    },
    /** 빈 요약('')은 "지움"을 뜻하므로 암호화하지 않고 버전 0으로 둔다. */
    encryptSummary(table: SummaryTable, plain: string): { value: string; keyVersion: number } {
      if (plain === "") return { value: "", keyVersion: 0 };
      return encryptField(plain, fieldAad(table, "summary", userId), keys);
    },
    decryptSummary(table: SummaryTable, value: string, keyVersion: number): string {
      if (value === "") return "";
      return decryptField(value, keyVersion, fieldAad(table, "summary", userId), keys);
    },
  };
}

export type UserCipher = ReturnType<typeof userCipher>;

/** API용. 키 설정이 잘못됐으면 내부 정보 없이 503을 돌려준다(평문으로 저장하지 않음). */
export function requireCipher(userId: string): { cipher: UserCipher; response?: never } | { cipher?: never; response: Response } {
  try { return { cipher: userCipher(userId) }; }
  catch { return { response: Response.json({ error: "대화 보호 설정을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } }) }; }
}
