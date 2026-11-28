# 제품 분석 (PostHog)

대상: 운영 `here-prod.vercel.app`(Vercel Production, main에 병합되면), 개발 서버 `here-dev.vercel.app`과 작업 브랜치(Vercel Preview). 로컬은 `.env.local`에 키를 직접 넣었을 때만.
구현: `src/lib/analytics.ts`(목록·거르기·전송), `src/instrumentation-client.ts`(앱이 뜰 때 한 번 시작).

## 켜지는 조건

- `NEXT_PUBLIC_POSTHOG_KEY`가 있을 때만 켜진다. 비어 있으면 posthog-js를 불러오지도 않는다.
- 어느 서버에서 켤지는 Vercel 환경변수로만 정한다(코드에는 서버별 차단이 없다). 2026-11-28 사용자 결정으로 운영도 켠다.
- 실제 사용자 출시 전 개인정보 처리방침에 "PostHog(미국 리전)로 앱 사용 기록을 모은다"를 적어야 한다(팀·법무 확인).
- 이벤트마다 `app_env`(`production`·`development`·`preview`·`local`)를 붙여 환경을 나눠 본다.

## 보내는 것

| 이벤트 | 속성 | 언제 |
|---|---|---|
| onboarding_step_viewed | scene(무대 장면 이름) | 캐릭터 만나기 장면이 바뀔 때. 들은 것 정리는 meet에 포함 |
| onboarding_completed | | 이름 짓기의 마지막 버튼 |
| home_viewed | | 홈이 화면에 올라올 때(다른 화면에서 돌아올 때 포함) |
| menu_opened | | 메뉴 열기 |
| text_opened | | 글 입력창 열기 |
| chat_message_sent | | 글 보내기 |
| chat_reply_received / chat_reply_failed | | 글 답변 성공·실패 |
| voice_started | | 마이크가 열린 음성 연결 |
| voice_failed | reason: no_mic·error | 음성 연결 실패 |
| voice_ended | seconds | 연결된 음성 대화를 닫을 때 |
| report_opened | mode: insight·library | 리포트 열기 |
| coming_soon_shown | feature: help·friends·garden | 준비 중 안내 |

- 회원은 `SHA-256("here-analytics-v1:" + 회원 ID)`로만 묶는다(`identify`). 전화번호·이름·생일·성별은 사람 속성으로도 보내지 않는다. 로그아웃하면 `reset`으로 끊는다.
- 브라우저·OS·화면 크기·쿼리를 뺀 주소처럼 PostHog가 붙이는 기본 정보 중 사람을 가리키지 않는 것만 남긴다.
- 회원 연결은 Account의 layout effect에서 하고, 모든 호출을 한 줄로 세워 연결이 끝난 뒤에 이벤트가 나간다(첫 `home_viewed`가 익명으로 남지 않게). 개발 모드(StrictMode)에서는 `home_viewed`가 두 번 찍힌다.
- 위치는 남기지 않는다: PostHog 프로젝트의 GeoIP 변환(Data management → Transformations)을 일시정지했다(2026-11-28). 켜 두면 서버가 IP로 도시·우편번호·대략 위경도를 붙인다. IP 자체도 "Discard client IP data"로 저장하지 않는다.

## 보내지 않는 것

- 대화 원문, 받아쓴 말, 이름(사용자·고양이), 온보딩 답, 표정(하늘), 위기 감지·109 표시 여부, 동의 답, 기억 내용.
- 자동 클릭 수집(autocapture), 페이지뷰 자동 수집, 화면 녹화(session replay), 히트맵, 오류 자동 수집, 설문, 기능 플래그. 모두 꺼 두고, 외부 스크립트도 불러오지 않는다.
- `before_send`에서 한 번 더 거른다: 위 표에 없는 이벤트는 버리고, 표에 없는 속성·`$set`·`$referrer`·주소의 쿼리·해시를 지운다.

이벤트를 더하려면 `EVENTS`에 이름과 허용 값을 적고 이 표를 같이 고친다. 자유 문자열 속성은 받지 않는다.

## PostHog 프로젝트 설정

- 프로젝트: Here (US Cloud, 무료 플랜이라 프로젝트 하나, 시간대 Asia/Seoul). "Discard client IP data" 켬, GeoIP 변환 일시정지.
- 대시보드(그래프 9개는 같고 필터만 다름): [Here 운영 지표](https://us.posthog.com/project/773744/dashboard/2424560) `app_env = production`, [Here 개발 확인](https://us.posthog.com/project/773744/dashboard/2424869) `app_env = development·preview`. 그래프: 온보딩 장면별 퍼널, 온보딩 완료 → 첫 글, 재방문, 하루 사용자, 글 vs 음성, 글 답변 실패율, 음성 길이·실패 이유, 리포트·메뉴·준비 중 안내. 이벤트 원본은 [Activity](https://us.posthog.com/project/773744/activity/explore).
- 키는 Vercel의 **Production**(main → here-prod)과 **Preview**(dev 브랜치 → here-dev, 작업 브랜치 미리보기)에 넣는다. Development에는 넣지 않는다(넣으면 `vercel env pull`로 팀원 로컬에서 분석이 켜진다). `NEXT_PUBLIC_` 값은 빌드할 때 들어가므로 바꾸면 다시 배포해야 한다.
- 로컬은 기본으로 꺼 둔다. 분석을 손볼 때만 그 사람이 `.env.local`에 `NEXT_PUBLIC_POSTHOG_KEY`를 잠깐 넣고(이벤트에 `app_env: local`이 붙는다), 끝나면 지운다. 키는 PostHog → Settings → General의 Project token.
