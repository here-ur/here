# 서버 에러 기록 (app_errors)

서버에서 조용히 넘기던 에러를 외부 서비스 없이 DB 테이블 `app_errors`에 **코드만** 쌓는다. 30일 지나면 매일 지운다.

- DB: `supabase/migrations/0031_app_errors.sql`
- 코드: `src/lib/error-report.ts` (`reportError(client, source, error, detail)`)
- 저장하지 않는 것: 에러 메시지 원문, 스택, 요청 내용, 대화 내용, 토큰·키, 전화번호·이메일

## 컬럼

| 컬럼 | 내용 |
|---|---|
| `source` | 어디서 났나 (아래 표) |
| `code` | 무슨 에러. DB 코드(`PGRST202`, `23505`), `http_503`, `timeout`, `decrypt_failed` 등 |
| `user_id` | 요청한 회원. 크론 작업자는 비어 있음 |
| `detail` | 숫자·참거짓만 담은 작은 정보 (`{"status": 503, "attempt": 2}`) |
| `count` | 한 묶음 안에서 난 횟수 |
| `first_seen_at` / `last_seen_at` | 묶음이 시작된 시각 / 마지막으로 난 시각 |

**묶음**: `source + code + user_id`가 같고 시작(`first_seen_at`)이 1분 안이면 같은 행의 `count`만 오른다. 길게 이어지는 장애도 1분마다 한 행씩 끊겨 시간대별 흐름이 보인다.

## source

| source | 어디서 |
|---|---|
| `auth.member` | 로그인·회원 확인 실패 (모든 API 공통) |
| `consent.check` / `consent.save` | 동의 확인 실패 (모든 API 공통) / 동의 저장 실패 |
| `cipher.keys` | 암호화 키 설정 오류 |
| `quota.check` / `quota.status` | 사용량 확인 실패(요청은 막힘) / 남은 대화량 조회 실패 |
| `chat.reply` | `/api/chat` 응답이 5xx이거나 AI 서비스가 요청 한도로 거절(429) |
| `chat.context` | 답변 전 맥락(기억 검색·요약) 준비 실패. code에 원인이 붙음 (예: `context_unavailable:http_429`) |
| `chat.save` | 답변 직후 대화 저장 실패 |
| `conversations.save` / `conversations.load` | 대화 기록 저장·조회 실패 |
| `activity.refresh` / `activity.sync` | 리포트 숫자 갱신(응답 뒤) 실패 / 리포트·정원 기록 동기화 실패 |
| `report.sky` | 리포트 하루 표정 AI 실패 (앱은 조용히 6시간 뒤 재시도) |
| `memory.summary` | 대화 요약(기억 만들기) 실패 |
| `memories.load` / `memories.update` | 기억 목록 조회 / 기억 삭제·동의 철회 실패 |
| `home.greeting` | 홈 인사 실패 (화면은 기본 문구로 대체) |
| `live.session` / `realtime.session` | 음성 세션 생성 실패 (AI 크레딧 소진이면 `provider_quota`) |
| `live.context` / `live.delegate` | 음성 맥락 준비 실패 / 음성 답변 위임 실패 |
| `voice.memory` | 음성 기억(예전 경로) 실패 |
| `web.search` | 웹 검색 실패 (개발 전용) |
| `worker.conversation` | 대화 요약 크론 작업자 실패 |
| `worker.context` | 기억 정리(대화 직후·밤 크론) 실패 |
| `app_errors.overflow` | 아래 상한에 걸려 기록하지 못한 횟수 |

새 지점을 추가할 때는 이 표에 함께 적는다. 로그인 없는 작업자는 `worker.`로 시작해야 기록된다.

## 상한 (도배·용량 방지)

기록 함수는 크론 작업자 때문에 공개 키(anon)로도 부를 수 있어서 상한을 둔다.

| 상한 | 값 |
|---|---|
| 하루 전체 새 행 | 5,000 (30일 ≈ 60MB) |
| 1분 전체 새 행 | 200 |
| 회원 한 명의 1분 새 행 | 30 |
| 로그인 없는 호출 | `worker.*`만, 1분 20 |

넘친 기록은 `app_errors.overflow / dropped` 행에 숫자만 센다. 이 행이 보이면 도배나 큰 장애가 있었다는 뜻이다.

## 보는 법 (Supabase SQL Editor)

```sql
-- 최근 하루 에러 순위
select source, code, sum(count) as times, count(distinct user_id) as users, max(last_seen_at) as last
from app_errors where first_seen_at > now() - interval '1 day'
group by 1, 2 order by times desc;

-- 특정 에러의 시간대별 흐름
select date_trunc('hour', first_seen_at) as hour, sum(count) as times
from app_errors where source = 'chat.reply' and first_seen_at > now() - interval '3 days'
group by 1 order by 1;
```

`users`가 많으면 여러 사람에게 퍼진 장애, 1이면 한 사람에게만 반복되는 문제일 가능성이 높다.

DB 자체가 멈추면 여기에 기록할 수 없다. 그런 장애는 Supabase 로그로 본다.
브라우저에서만 나는 에러(화면 오류, 마이크 권한 등)는 이 기록 대상이 아니다.
