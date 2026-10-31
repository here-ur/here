# Here!

AI와 말로 이야기하고, 필요할 때 도움받기에서 실제 사람인 상담사를 살펴보는 앱 (MVP).

홈 하단의 말풍선 버튼은 같은 홈에서 입력창만 펼친다. 메시지를 보내면 홈 안에 말풍선이 나타나며, 닫기(X)·Escape는 말풍선과 입력창을 숨기고 기본 홈으로 돌아간다. 대화와 초안은 다시 열 때 유지한다. 전송할 때 마이크 연결 없이 `/api/chat`을 통해 Runyour AI의 답변을 받는다. 마이크 버튼은 OpenAI Realtime으로 연결하며 같은 홈에서 몽글이를 확대하고 종료(X)·마이크 컨트롤을 펼친다. 몽글이가 먼저 인사하며, 인사 음성 재생이 끝난 뒤 마이크 입력을 연다. 몽글이의 얼굴·몸 동작은 입력·연결 상태를 표현하며 감정을 분석하지 않는다. 왼쪽 파일 첨부(+)는 기기에서 선택한 파일의 이름·용량을 확인하는 UI이며, 파일 내용을 읽거나 전송하지 않는다.

도움받기는 매번 상담 안내부터 열리며, 건너뛰기 또는 상담사 둘러보기로 목록에 진입한다. 상담사 카드는 프로필 바텀시트, 이야기하기는 별도 통화 미리보기 화면을 연다. 프로필은 예시 데이터이며 실제 상담 연결·녹음·예약·결제·리포트 공유는 제공하지 않는다. [원본 기획 시트](https://docs.google.com/spreadsheets/d/1ipT7eUM78gbYJlWxezUrxTPejYT98gBZfAfGedI8Ud8/edit?gid=552197863)의 준비 중인 상담 흐름과 현재 구현 범위는 [PRD](docs/PRD.md)에서 구분한다.

화면은 기존 제품 프레임(최대 너비 430px, 높이 `100dvh`, 최소 높이 640px)을 유지한다. [SEED Design](https://github.com/daangn/seed-design)의 `@seed-design/css@3.0.3`을 기준으로 타이포그래피·간격·라운드·모션을 적용하고, 기존 제품의 컬러·그라디언트는 유지한다. 비컬러 토큰은 `src/app/seed-foundation.css`, 화면 크기는 `src/app/app-frame.css`에서 관리한다.

```bash
npm install
npm run dev
```

`.env.example`을 참고해 필요한 서버 환경변수를 `.env.local`에 설정한다. 비밀 키는 커밋하거나 `NEXT_PUBLIC_*`로 노출하지 않는다. Supabase publishable key만 브라우저용 공개 키로 사용한다.

### 초대·휴대폰 로그인(구현 중)

현재 가입 순서는 초대코드 → 휴대폰 번호 → SMS 인증번호다. 기존 회원의 로그인은 휴대폰 번호 → SMS 인증번호 순서다. 초대코드를 등록한 회원만 앱에 들어갈 수 있고, 회원은 메뉴에서 최대 3명이 사용할 수 있는 초대코드를 발급할 수 있다. `/api/chat`과 `/api/realtime`도 회원 토큰을 확인한다. Supabase 연결값이 없는 환경에서는 로그인 준비 안내만 표시된다.

1. Supabase 프로젝트를 만든다. Authentication에서 Phone 로그인을 켜고 [SMS 제공업체를 연결](https://supabase.com/docs/guides/auth/phone-login)한다. 가입 화면에서 초대코드를 먼저 확인하지만, 실제 배포 전에는 문자 발송 제한과 CAPTCHA도 설정한다.
2. Supabase SQL Editor에서 `supabase/migrations/20261029000000_invite_auth.sql`을 실행한다. 운영 `Here`(`jtgdmuenwsvjhnugytfa`)와 개발 `here-dev`(`mwjwfumpxdlllikcdvkh`)는 모두 서울 리전이며, 2026-10-31에 `members`·`invite_codes` 테이블과 접근 권한을 적용했다. 미사용 프랑크푸르트 프로젝트는 삭제했다. 개발·운영 데이터는 동기화하지 않는다.
3. `supabase/migrations/20261031000000_invite_three_uses.sql`도 적용한다. 이미 사용한 코드는 첫 사용자를 포함해 최대 3명이 사용할 수 있도록 이관된다. SQL Editor에서 `select public.bootstrap_invite_code();`를 실행해 첫 초대코드를 받는다. 서울 프로젝트에는 2026-10-31에 첫 코드를 한 번 발급했고, 결과는 해당 프로젝트의 SQL Editor 탭에 남겨 두었다. 기존 프로젝트의 코드는 새 프로젝트에서 사용할 수 없다. 다시 실행하면 새로운 코드가 추가로 발급되므로 필요할 때만 실행한다. 발급 결과를 공개 저장소에 기록하지 않는다.
4. Project URL과 publishable key를 로컬 환경의 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`에 넣고 개발 서버를 재시작한다. 로컬에는 운영이 아닌 `here-dev` 값을 `.env.development.local`에 넣는다. 이 파일은 `.env.local`보다 우선하고 Git에서 제외된다. publishable key는 브라우저 공개용이며, service role/secret key는 브라우저에 넣지 않는다.

### 개발·운영 분리

| 환경 | 브랜치 / Vercel 범위 | Supabase 프로젝트 |
| --- | --- | --- |
| 운영 | `main` / Production | `Here` — `jtgdmuenwsvjhnugytfa` |
| 팀 개발 | `dev` 및 작업 브랜치 / Preview | `here-dev` — `mwjwfumpxdlllikcdvkh` |
| 로컬 개발 | `localhost:3000` / Development | `here-dev` — `mwjwfumpxdlllikcdvkh` |

운영 주소는 https://here-mauve.vercel.app/ 이다. QA 환경은 별도로 만들지 않는다.

- 기능 작업은 `dev`에서 분기하고 PR을 `dev`로 병합한다. 개발 사이트에서 확인한 뒤 `dev` → `main` PR을 만들고, 사용자가 운영 반영을 명시적으로 승인했을 때만 병합한다. `main`에 직접 push하거나 개발 배포를 운영으로 Promote하지 않는다.
- Vercel의 Supabase URL·publishable key는 Production과 Preview/Development에 별도 값으로 저장한다. 공개 값은 빌드 시 포함되므로 환경별로 새로 빌드한다. 운영 회원·초대코드를 개발로 복사하거나 개발 테스트 데이터를 운영으로 옮기지 않는다.
- DB 구조 변경은 migration SQL로 기록하고 개발 DB에서 검증한 뒤 승인받아 운영 DB에 별도 적용한다. 코드 배포만으로 DB 변경이 자동 적용되지는 않는다. 현재 두 초기 migration은 SQL Editor로 적용했으므로 CLI migration 이력 동기화 없이 `db push`를 실행하지 않는다.
- AI 키와 공용 Twilio Verify 계정은 현재 공유한다. DB와 로그인 계정은 분리되지만 외부 API 사용량·문자 비용은 공유한다. 개발에서는 테스트 계정과 테스트 대화만 사용한다.
- 브랜치 보호 정책은 아직 별도 설정하지 않았다. 위 배포 승인 절차는 팀 작업 규칙이다.

프로필과 대화 기록은 현재 **계정별 브라우저 저장소**에만 남는다. 로그인 이전에 이 브라우저에 있던 기록은 다른 계정에 자동 연결하지 않는다. 서버 저장·요약·임베딩·학습 파이프라인·탈퇴 후 보존/삭제 정책은 아직 구현되지 않았다. 이 단계에서는 대화 데이터가 계정 간 섞이지 않도록 분리하는 데까지만 작업했다.

- 글 대화: `RUNYOUR_API_KEY`. 기본 API 주소는 `https://api.runyour.ai/v1`, 모델은 `openai/gpt-5.6-sol`이다. Responses API(`/responses`)와 `reasoning.effort: medium`으로 추론·함수 도구를 함께 사용한다. `RUNYOUR_BASE_URL`·`CHAT_MODEL`로 변경할 수 있다.
- 음성 대화: `OPENAI_API_KEY`. `REALTIME_MODEL` 기본값은 `gpt-realtime-2.1-mini`다. 글 대화 키와 별도로 설정한다.

글 대화는 JSON 응답을 기다린 후 성공한 사용자 글·답변을 기기 기록에 저장한다. 실패하면 입력을 유지한다. 글에서 음성으로 전환할 때 이전 글 맥락은 새 음성 세션에 자동 전달되지 않는다. 기록은 기기에서 30일간 보관하며, 답변 생성에 필요한 메시지는 서버를 거쳐 Runyour AI로 전달한다.

로컬 작업 중 온보딩을 건너뛰려면 `.env.development.local`에 `NEXT_PUBLIC_SKIP_ONBOARDING=true`를 설정한다.
저장된 프로필이 없으면 기본 몽글이로 홈을 열며, 이 기본 프로필은 저장하지 않는다. 배포 빌드에는 적용되지 않는다.
온보딩을 다시 확인하려면 값을 `false`로 바꾸고 개발 서버를 다시 실행한다. 이미 저장된 프로필이 있다면 메뉴의 "처음부터 다시 하기"로 초기화한다.

프로젝트 규칙과 결정 사항은 [CLAUDE.md](CLAUDE.md)를 보세요.
