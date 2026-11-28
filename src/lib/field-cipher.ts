// 서버 전용. 대화 원문과 기억 요약을 DB에 넣기 전에 암호화하고, 읽을 때 복호화한다.
// 언어와 상관없는 저장 형식 (나중에 Java/Spring 서버도 같은 행을 읽을 수 있게 docs/ENCRYPTION.md와 맞춘다):
//   AES-256-GCM, 12바이트 무작위 IV, 16바이트 태그. 저장값은 iv || 암호문 || 태그를 표준 base64로 인코딩한 것.
//   AAD = "<테이블>.<컬럼>:<user_id>" (UTF-8). 다른 사용자 행으로 옮긴 암호문은 복호화되지 않는다.
//   key_version 0은 암호화 전 평문 행, 1 이상은 DATA_ENCRYPTION_KEY_<n>으로 암호화한 행.
//   contentHash = HMAC-SHA256(DATA_HMAC_KEY_1, 원문)의 소문자 hex. 원문을 저장하지 않고 재전송 중복을 판단할 때 쓴다.
// 원문·암호문·키·AAD 값은 절대 로그로 남기지 않는다.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_KEY_VERSION = 32_767; // DB 컬럼이 smallint

export type CipherKeys = { current: number; keys: ReadonlyMap<number, Buffer>; hmacKey: Buffer };
export type EncryptedField = { value: string; keyVersion: number };
export type BatchMessage = { id: string; role: string; at: string; content: string };

export class FieldCipherError extends Error {
  constructor(code: string) { super(code); }
}

function decodeKey(value: string | undefined, name: string): Buffer {
  const key = value && /^[A-Za-z0-9+/]+={0,2}$/.test(value.trim()) ? Buffer.from(value.trim(), "base64") : null;
  if (!key || key.length !== KEY_BYTES) throw new FieldCipherError(`invalid_key:${name}`);
  return key;
}

/** DATA_ENCRYPTION_KEY_<n>을 모두 읽는다. 키가 없거나 형식이 틀리면 평문으로 넘어가지 않고 바로 에러를 낸다. */
export function loadCipherKeys(env: Record<string, string | undefined>): CipherKeys {
  const current = Number(env.DATA_ENCRYPTION_KEY_CURRENT);
  if (!Number.isSafeInteger(current) || current < 1 || current > MAX_KEY_VERSION) throw new FieldCipherError("invalid_current_key");
  const keys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(env)) {
    const version = /^DATA_ENCRYPTION_KEY_([1-9]\d{0,4})$/.exec(name)?.[1];
    if (version && value && Number(version) <= MAX_KEY_VERSION) keys.set(Number(version), decodeKey(value, name));
  }
  if (!keys.has(current)) throw new FieldCipherError("missing_current_key");
  return { current, keys, hmacKey: decodeKey(env.DATA_HMAC_KEY_1, "DATA_HMAC_KEY_1") };
}

export function fieldAad(table: string, column: string, userId: string): string {
  return `${table}.${column}:${userId.toLowerCase()}`;
}

/** iv는 고정 테스트 벡터용으로만 넘긴다. 실제로는 매번 새 무작위 IV를 쓴다. */
export function encryptField(plain: string, aad: string, keys: CipherKeys, iv: Buffer = randomBytes(IV_BYTES)): EncryptedField {
  const key = keys.keys.get(keys.current);
  if (!key || iv.length !== IV_BYTES) throw new FieldCipherError("encrypt_failed");
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { value: Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64"), keyVersion: keys.current };
}

export function decryptField(value: string, keyVersion: number, aad: string, keys: CipherKeys): string {
  if (keyVersion === 0) return value; // 암호화 전 평문 행. 나중에 변환 스크립트가 암호화한다
  const key = keys.keys.get(keyVersion);
  if (!key) throw new FieldCipherError("unknown_key_version");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new FieldCipherError("decrypt_failed");
  const raw = Buffer.from(value, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new FieldCipherError("decrypt_failed");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new FieldCipherError("decrypt_failed"); // 키나 AAD가 다르거나 데이터가 변조된 경우
  }
}

export function contentHash(plain: string, keys: CipherKeys): string {
  return createHmac("sha256", keys.hmacKey).update(plain, "utf8").digest("hex");
}

/** 원문 기준 배치 지문(메시지 순서도 반영). 암호문은 매번 달라도 같은 배치의 재전송이면 같은 값이 나온다. */
export function batchFingerprint(messages: readonly BatchMessage[], keys: CipherKeys): string {
  const lines = messages.map(m => contentHash([m.id, m.role, m.at, m.content].join("\u0000"), keys));
  return contentHash(lines.join("\n"), keys);
}
