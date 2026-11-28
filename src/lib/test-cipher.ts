// 테스트 전용 고정 키. 실제 환경변수 키와 무관하며 운영 코드에서 import하지 않는다.
import { loadCipherKeys } from "./field-cipher.ts";
import { userCipher } from "./conversation-cipher.ts";

export const TEST_CIPHER_ENV = {
  DATA_ENCRYPTION_KEY_1: Buffer.alloc(32, 7).toString("base64"),
  DATA_ENCRYPTION_KEY_CURRENT: "1",
  DATA_HMAC_KEY_1: Buffer.alloc(32, 9).toString("base64"),
};
export const testCipher = (userId = "00000000-0000-4000-8000-000000000001") => userCipher(userId, loadCipherKeys(TEST_CIPHER_ENV));
