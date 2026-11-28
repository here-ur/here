import { test } from "node:test";
import assert from "node:assert/strict";
import {
  batchFingerprint, contentHash, decryptField, encryptField, fieldAad, FieldCipherError, loadCipherKeys,
} from "./field-cipher.ts";

// docs/ENCRYPTION.md와 같은 고정 테스트 벡터. Java/Spring으로 옮겨도 이 값이 그대로 나와야 한다.
const KEY_1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="; // bytes 0x00..0x1f
const HMAC_KEY = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8="; // bytes 0x20..0x3f
const IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const AAD_A = fieldAad("conversation_messages", "content", USER_A);
const VECTOR_PLAIN = "안녕, 호야";
const VECTOR_CIPHER = "AAECAwQFBgcICQoLq5de8EBw7jtg2S9nJFVz1N6dCSSyah7Zv0bROHsm";
const VECTOR_HASH = "3f1f332dce0e12958c3c9d7d422ff172b4d8dced6a74db45ba7057b11fba81a6";
const VECTOR_BATCH = "5afc937f057f628c5b3542c2658fec4723fecdf51f613391c44a3762e0b61800";

const env = { DATA_ENCRYPTION_KEY_1: KEY_1, DATA_ENCRYPTION_KEY_CURRENT: "1", DATA_HMAC_KEY_1: HMAC_KEY };
const keys = loadCipherKeys(env);
const batch = [
  { id: "m1", role: "user", at: "2026-11-26T00:00:00.000Z", content: "안녕" },
  { id: "m2", role: "assistant", at: "2026-11-26T00:00:01.000Z", content: "…뭐야." },
];

test("고정 키·IV로 암호화하면 문서의 테스트 벡터와 같은 값이 나온다", () => {
  // given / when
  const encrypted = encryptField(VECTOR_PLAIN, AAD_A, keys, IV);
  // then
  assert.deepEqual(encrypted, { value: VECTOR_CIPHER, keyVersion: 1 });
});

test("HMAC과 배치 지문은 문서의 테스트 벡터와 같다", () => {
  // given / when / then
  assert.equal(contentHash(VECTOR_PLAIN, keys), VECTOR_HASH);
  assert.equal(batchFingerprint(batch, keys), VECTOR_BATCH);
});

test("암호화한 값을 복호화하면 한글·이모지·8,000자 원문이 그대로 돌아온다", () => {
  for (const plain of ["", "오늘 좀 지쳤어 😮‍💨", "가".repeat(8000)]) {
    // given
    const encrypted = encryptField(plain, AAD_A, keys);
    // when
    const decrypted = decryptField(encrypted.value, encrypted.keyVersion, AAD_A, keys);
    // then
    assert.equal(decrypted, plain);
  }
});

test("같은 원문을 두 번 암호화하면 IV가 달라 암호문이 서로 다르다", () => {
  // given / when
  const first = encryptField(VECTOR_PLAIN, AAD_A, keys);
  const second = encryptField(VECTOR_PLAIN, AAD_A, keys);
  // then
  assert.notEqual(first.value, second.value);
});

test("암호문을 한 바이트라도 바꾸면 복호화가 실패한다", () => {
  // given
  const raw = Buffer.from(VECTOR_CIPHER, "base64");
  raw[14] ^= 1;
  // when / then
  assert.throws(() => decryptField(raw.toString("base64"), 1, AAD_A, keys), FieldCipherError);
});

test("다른 사용자의 행으로 옮긴 암호문은 복호화되지 않는다", () => {
  // given
  const aadB = fieldAad("conversation_messages", "content", USER_B);
  // when / then
  assert.throws(() => decryptField(VECTOR_CIPHER, 1, aadB, keys), FieldCipherError);
});

test("다른 컬럼 용도로 옮긴 암호문은 복호화되지 않는다", () => {
  // given
  const otherColumn = fieldAad("conversation_memories", "summary", USER_A);
  // when / then
  assert.throws(() => decryptField(VECTOR_CIPHER, 1, otherColumn, keys), FieldCipherError);
});

test("key_version 0인 기존 평문 행은 그대로 돌려준다", () => {
  // given / when / then
  assert.equal(decryptField("암호화 전 원문", 0, AAD_A, keys), "암호화 전 원문");
});

test("없는 키 버전과 깨진 base64는 명확한 에러로 거절한다", () => {
  // given / when / then
  assert.throws(() => decryptField(VECTOR_CIPHER, 2, AAD_A, keys), /unknown_key_version/);
  assert.throws(() => decryptField("not base64!!", 1, AAD_A, keys), /decrypt_failed/);
  assert.throws(() => decryptField("AAAA", 1, AAD_A, keys), /decrypt_failed/);
});

test("키가 없거나 32바이트가 아니면 평문으로 넘어가지 않고 에러를 낸다", () => {
  // given / when / then
  assert.throws(() => loadCipherKeys({ ...env, DATA_ENCRYPTION_KEY_1: undefined }), /missing_current_key/);
  assert.throws(() => loadCipherKeys({ ...env, DATA_ENCRYPTION_KEY_1: Buffer.alloc(16).toString("base64") }), /invalid_key/);
  assert.throws(() => loadCipherKeys({ ...env, DATA_HMAC_KEY_1: undefined }), /invalid_key:DATA_HMAC_KEY_1/);
  assert.throws(() => loadCipherKeys({ ...env, DATA_ENCRYPTION_KEY_CURRENT: "0" }), /invalid_current_key/);
});

test("키 교체 후에도 옛 버전 키로 만든 암호문을 읽고, 새 값은 새 버전으로 쓴다", () => {
  // given
  const rotated = loadCipherKeys({ ...env, DATA_ENCRYPTION_KEY_2: HMAC_KEY, DATA_ENCRYPTION_KEY_CURRENT: "2" });
  // when
  const old = decryptField(VECTOR_CIPHER, 1, AAD_A, rotated);
  const fresh = encryptField(VECTOR_PLAIN, AAD_A, rotated);
  // then
  assert.equal(old, VECTOR_PLAIN);
  assert.equal(fresh.keyVersion, 2);
});

test("HMAC은 같은 원문이면 같고, 원문이나 키가 다르면 달라진다", () => {
  // given
  const otherKeys = loadCipherKeys({ ...env, DATA_HMAC_KEY_1: KEY_1 });
  // when / then
  assert.equal(contentHash("응", keys), contentHash("응", keys));
  assert.notEqual(contentHash("응", keys), contentHash("응.", keys));
  assert.notEqual(contentHash("응", keys), contentHash("응", otherKeys));
});

test("배치 지문은 메시지 순서나 내용이 바뀌면 달라진다", () => {
  // given / when / then
  assert.notEqual(batchFingerprint([...batch].reverse(), keys), VECTOR_BATCH);
  assert.notEqual(batchFingerprint([{ ...batch[0], content: "안녕!" }, batch[1]], keys), VECTOR_BATCH);
});

test("8,000자 한글 암호문은 DB 상한(44,000자) 안에 들어간다", () => {
  // given / when
  const encrypted = encryptField("가".repeat(8000), AAD_A, keys);
  // then
  assert.ok(encrypted.value.length <= 44_000, String(encrypted.value.length));
});
