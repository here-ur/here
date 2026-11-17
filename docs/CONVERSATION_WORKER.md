# 대화 요약 자동 재시도 — 개발

- 대상: `here-dev.vercel.app`, 개발 DB `mwjwfumpxdlllikcdvkh`
- 운영: 코드의 환경·DB 제한으로 차단. 운영 DB·cron 변경 없음
- 실행: Supabase Cron → `pg_net` → 개발 웹의 `POST /api/internal/conversation-worker`
- 주기: 5분, 회당 최대 2개. 사용자 재접속 없이 실행
- 모델: 기존 Luna 요약 + `text-embedding-3-large` 1536차원. 기존 개발 API 키 사용
- 대상: 최신 동의가 유효한 회원의 최근 30일 대화 중 아직 기억이 만들어지지 않은 구간
- 재시도: 최초 포함 최대 5회. 실패 후 1분 → 5분 → 30분 → 2시간 대기
- 중단 복구: 2분이 지난 처리 중 작업에 새 lease 발급. 이전 lease의 저장 거절
- HTTP 전송 실패: 요약 시도와 별개. 구간당 7일 내 최대 12회 dispatch, 오래 대기한 구간 우선
- 한도 도달: `failed` 상태 유지, 자동 무한 재시도 없음. 원문 30일 만료는 그대로 적용
- 직접 접속 중 처리: 동일한 재시도 한도·대기시간 사용
- 보관: 작업 실행 메타데이터 7일. 원문·요약·임베딩 추가 복사 없음
- 삭제/철회: 기억 삭제 후 재생성 차단. 동의 철회 시 배치와 작업 토큰 함께 삭제, 처리 중 결과 저장 거절

## 권한

- 관리자 키·회원 세션을 스케줄러에 저장하지 않음
- DB가 구간별 무작위 토큰 생성, DB에는 SHA-256 해시만 저장
- 토큰 유효기간 2분, 해당 구간 1회 claim·1회 결과 저장만 허용
- 작업 발급·dispatch: DB 관리자/cron만 실행 가능
- claim·finish RPC: 공개 API 역할로 호출하되 유효한 작업 토큰 필수. 계정 ID·배치 ID를 호출자가 선택할 수 없음
- 토큰을 가진 서버에만 해당 구간과 직전 두 발언 전달. 다른 계정/구간 조회 불가
- HTTP 응답·애플리케이션 로그: 처리 여부/상태/소요시간만. 원문·요약·벡터·토큰·사용자 ID 제외
- `pg_net` 내부 요청 큐는 서버 전용. 공개 역할의 `net` 스키마 접근 차단

## 적용 순서

1. `0018_conversation_worker.sql`: 재시도 규칙·작업 토큰·RPC
2. 개발 브랜치 배포: worker API
3. `0019_conversation_worker_cron.sql`: 개발 주소 고정 dispatch·5분 cron
4. DB 실행 결과와 실제 모델을 통한 가상 대화 요약·임베딩 확인

## 확인 SQL

```sql
-- 원문이나 계정 정보 없이 처리 상태 확인
select outcome, count(*) from public.conversation_worker_runs group by outcome;
select status, attempts, count(*) from public.conversation_memories
where attempts >= 5 and status in ('pending','failed') group by status, attempts;
select jobname, schedule, active from cron.job where jobname='here-conversation-worker';
select status, return_message, start_time from cron.job_run_details
where jobid=(select jobid from cron.job where jobname='here-conversation-worker')
order by start_time desc limit 5;
```

- 중지: `select cron.unschedule('here-conversation-worker');` — 원문·기억 삭제 없음
- 재개: `0019` 마지막 `cron.schedule` 문 실행
- 실제 구간을 임의로 초기화하거나 재처리하지 않음. 한도 도달 건은 제공자/설정 오류부터 조사
- 검증 범위: 익명·제3자 차단, 토큰 만료·재사용, 중단 복구, 5회 한도, 철회·삭제 중 저장 차단, 원문 만료
- 두 실제 회원의 수동 격리 검증은 기존 보류 유지. DB 격리는 가상 회원으로 자동 검증

참고: [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)
