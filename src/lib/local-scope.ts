let owner: string | null = null;

export function setLocalOwner(userId: string | null) {
  owner = userId;
}

export function accountKey(key: string): string | null {
  return owner ? `${key}.${owner}` : null;
}

type KeyStore = Pick<Storage, "length" | "key" | "removeItem">;

/** 이 계정의 기기 기록(대화 원문·리포트 숫자·프로필 캐시·임시 저장 등)을 모두 지운다. 탈퇴할 때 쓴다.
 * 계정별 키는 모두 계정 ID를 이름에 담으므로(accountKey 등) ID가 들어간 키만 지우고 효과음 같은 기기 설정은 남긴다. */
export function clearAccountStorage(userId: string, stores: (KeyStore | undefined)[]) {
  if (!userId) return;
  for (const store of stores) {
    try {
      if (!store) continue;
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.includes(userId)) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
    } catch { /* 저장소를 못 쓰면 지울 기록도 읽을 수 없다. */ }
  }
}
