# 대화·기억 암호화

대화 원문과 기억 요약을 **서버(Vercel)에서 AES-256-GCM으로 암호화**해 DB에는 암호문만 저장한다. 키는 Vercel 환경변수에만 있고 DB에는 없다.

```
브라우저 ──평문(HTTPS)──▶ 서버(키 보유) ──암호문──▶ Supabase
                          ↑ 암호화·복호화는 여기서만
```

- 구현: `src/lib/field-cipher.ts`(형식), `src/lib/conversation-cipher.ts`(사용자별 도우미)
- DB: `supabase/migrations/0030_field_encryption.sql`
- 기존 평문 변환: `scripts/encrypt-existing-data.mts`

## 대상

| 테이블.컬럼 | 버전 컬럼 | 비고 |
|---|---|---|
| `conversation_messages.content` | `content_key_version` | 재전송 비교용 `content_hash`(원문 HMAC)도 저장 |
| `conversation_memories.summary` | `summary_key_version` | 빈 요약(`''`)은 "지움"이라 암호화하지 않음 |
| `chat_context_state.summary` | `summary_key_version` | 위와 같음 |

암호화하지 않는 것: 임베딩 벡터(DB에서 벡터 검색을 해야 함), Auth 메타데이터, 회원 정보.

## 저장 형식 (언어와 무관한 규격)

나중에 서버를 다른 언어(예: Java/Spring)로 옮겨도 같은 키로 같은 행을 읽고 쓸 수 있게 Node 전용 기능 없이 정했다.

| 항목 | 규격 | Java 대응 |
|---|---|---|
| 알고리즘 | AES-256-GCM, NoPadding | `Cipher.getInstance("AES/GCM/NoPadding")` |
| IV | 12바이트, 매번 무작위 | `SecureRandom` 12바이트 |
| 태그 | 16바이트 | `new GCMParameterSpec(128, iv)` |
| 저장값 | 표준 base64(패딩 있음) of `iv ‖ 암호문 ‖ 태그` | `doFinal()` 결과(`암호문‖태그`) 앞에 iv |
| 문자열 | UTF-8 | `StandardCharsets.UTF_8` |
| AAD | `"<테이블>.<컬럼>:<user_id 소문자>"` | `cipher.updateAAD(...)` |
| key_version | 0 = 평문, n = `DATA_ENCRYPTION_KEY_<n>` | |
| content_hash | 소문자 hex `HMAC-SHA256(DATA_HMAC_KEY_1, 원문)` | `Mac.getInstance("HmacSHA256")` |
| 배치 지문 | 메시지마다 `HMAC(id␀role␀at␀content)` → hex를 `\n`으로 이어 다시 HMAC | |

AAD에 user_id를 넣기 때문에 암호문을 다른 사용자 행으로 옮기면 복호화가 실패한다.

### 테스트 벡터

`src/lib/field-cipher.test.ts`에 고정돼 있다. 다른 언어 구현은 같은 값을 내야 한다(Java 17로 일치 확인함).

| 항목 | 값 |
|---|---|
| 암호화 키 | bytes `0x00..0x1f` = `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=` |
| HMAC 키 | bytes `0x20..0x3f` = `ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=` |
| IV | bytes `0x00..0x0b` |
| AAD | `conversation_messages.content:00000000-0000-4000-8000-000000000001` |
| 원문 | `안녕, 호야` |
| 암호문 | `AAECAwQFBgcICQoLq5de8EBw7jtg2S9nJFVz1N6dCSSyah7Zv0bROHsm` |
| HMAC | `3f1f332dce0e12958c3c9d7d422ff172b4d8dced6a74db45ba7057b11fba81a6` |

## 키 관리

| 환경변수 | 값 |
|---|---|
| `DATA_ENCRYPTION_KEY_1` | `openssl rand -base64 32` |
| `DATA_ENCRYPTION_KEY_CURRENT` | `1` |
| `DATA_HMAC_KEY_1` | `openssl rand -base64 32` (암호화 키와 다른 값) |

- 로컬·dev·prod는 **모두 다른 키**를 쓴다. Vercel에는 Preview(dev)와 Production에 따로 **Sensitive**로 등록한다.
- `NEXT_PUBLIC_`을 붙이지 않는다. 코드·문서·노션·메신저에 키 값을 적지 않는다.
- **키를 잃으면 암호화된 데이터를 영구히 복구할 수 없다.** 등록 전에 비밀번호 관리자 등 안전한 곳에 백업한다.
- 키가 없거나 형식이 틀리면 서버는 평문으로 저장하지 않고 503을 돌려준다.
- Vercel 환경변수에 접근할 수 있는 사람은 복호화할 수 있다. Vercel 팀 권한은 꼭 필요한 사람만 둔다.

### 키 교체

1. `DATA_ENCRYPTION_KEY_2`를 추가하고 `DATA_ENCRYPTION_KEY_CURRENT=2`로 바꾼다. 1번 키는 지우지 않는다.
2. 새로 저장되는 값은 2번, 기존 값은 1번 키로 계속 읽힌다.
3. 옛 값을 2번으로 다시 암호화한 뒤에만 1번 키를 지운다(재암호화 스크립트는 필요할 때 만든다).

`DATA_HMAC_KEY_1`을 바꾸면 기존 `content_hash`와 비교가 안 되므로 바꾸지 않는다.

## 적용 순서

1. 대상 DB에 `0030` 적용. 새 파라미터는 기본값이 평문 동작이라 기존 코드가 그대로 동작한다.
2. Vercel에 키 등록 → 암호화 코드 배포. 이때부터 새 데이터는 암호문.
3. 기존 평문 변환:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATA_ENCRYPTION_KEY_1=... DATA_ENCRYPTION_KEY_CURRENT=1 DATA_HMAC_KEY_1=... \
     node scripts/encrypt-existing-data.mts          # 바꿀 행 수 확인
     node scripts/encrypt-existing-data.mts --apply  # 실제 변환 (여러 번 돌려도 안전)
   ```
   키는 **그 DB를 쓰는 서버와 같은 키**여야 한다.
4. 평문(버전 0)이 0건인지 확인:
   ```sql
   select 'messages', count(*) from conversation_messages where content_key_version = 0
   union all select 'memories', count(*) from conversation_memories where summary_key_version = 0 and summary <> ''
   union all select 'context', count(*) from chat_context_state where summary_key_version = 0 and summary <> '';
   ```

운영 DB는 이 테이블들이 생길 때부터 암호화 코드가 함께 배포되므로 변환이 필요 없다.

## 되돌리기

코드만 되돌리면 옛 코드가 암호문을 읽지 못한다. 반드시 먼저 평문으로 복원한다.
```bash
node scripts/encrypt-existing-data.mts --decrypt          # 복원할 행 수 확인
node scripts/encrypt-existing-data.mts --decrypt --apply  # 평문(버전 0)으로 복원
```
그다음 코드를 되돌린다. 0030 자체를 되돌리는 방법은 마이그레이션 파일 끝에 적혀 있다.

## 한계

- AI 서비스(Runyour·OpenAI)에는 답변·요약을 만들기 위해 원문이 전송된다. 암호화는 DB 저장 구간만 보호한다.
- 임베딩 벡터는 평문이다. 원문을 그대로 복원할 수는 없지만 대략적인 의미는 추정될 수 있다.
- 브라우저 localStorage의 대화 기록(30일)은 이 암호화 범위 밖이다.
- 법적으로 저장 시 암호화가 의무인 항목(「개인정보의 안전성 확보조치 기준」 제7조: 비밀번호·고유식별정보·생체인식정보 등)에 대화 내용은 들어 있지 않다. 정신건강 관련 내용이 들어갈 수 있는 민감정보라 자발적으로 보호하는 조치다.
