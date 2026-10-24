# Here!

AI와 말로 이야기하고, 필요할 때 도움받기에서 실제 사람인 상담사를 살펴보는 앱 (MVP).

홈 하단의 말풍선 버튼은 같은 홈에서 입력창만 펼친다. 메시지를 보내면 홈 안에 말풍선이 나타나며, 닫기(X)·Escape는 말풍선과 입력창을 숨기고 기본 홈으로 돌아간다. 대화와 초안은 다시 열 때 유지한다. 전송할 때 마이크 연결 없이 `/api/chat`을 통해 Runyour AI의 답변을 받는다. 마이크 버튼은 OpenAI Realtime으로 연결하며 같은 홈에서 몽글이를 확대하고 종료(X)·마이크 컨트롤을 펼친다. 몽글이가 먼저 인사하며, 인사 음성 재생이 끝난 뒤 마이크 입력을 연다. 몽글이의 얼굴·몸 동작은 입력·연결 상태를 표현하며 감정을 분석하지 않는다. 왼쪽 파일 첨부(+)는 기기에서 선택한 파일의 이름·용량을 확인하는 UI이며, 파일 내용을 읽거나 전송하지 않는다.

도움받기는 매번 상담 안내부터 열리며, 건너뛰기 또는 상담사 둘러보기로 목록에 진입한다. 상담사 카드는 프로필 바텀시트, 이야기하기는 별도 통화 미리보기 화면을 연다. 프로필은 예시 데이터이며 실제 상담 연결·녹음·예약·결제·리포트 공유는 제공하지 않는다. [원본 기획 시트](https://docs.google.com/spreadsheets/d/1ipT7eUM78gbYJlWxezUrxTPejYT98gBZfAfGedI8Ud8/edit?gid=552197863)의 준비 중인 상담 흐름과 현재 구현 범위는 [PRD](docs/PRD.md)에서 구분한다.

화면은 기존 제품 프레임(최대 너비 430px, 높이 `100dvh`, 최소 높이 640px)을 유지한다. [SEED Design](https://github.com/daangn/seed-design)의 `@seed-design/css@3.0.3`을 기준으로 타이포그래피·간격·라운드·모션을 적용하고, 기존 제품의 컬러·그라디언트는 유지한다. 비컬러 토큰은 `src/app/seed-foundation.css`, 화면 크기는 `src/app/app-frame.css`에서 관리한다.

```bash
npm install
npm run dev
```

`.env.example`을 참고해 필요한 서버 환경변수를 `.env.local`에 설정한다. 실제 키는 커밋하거나 `NEXT_PUBLIC_*`로 노출하지 않는다.

- 글 대화: `RUNYOUR_API_KEY`. 기본 API 주소는 `https://api.runyour.ai/v1`, 모델은 `openai/gpt-5.6-sol`이다. Responses API(`/responses`)와 `reasoning.effort: medium`으로 추론·함수 도구를 함께 사용한다. `RUNYOUR_BASE_URL`·`CHAT_MODEL`로 변경할 수 있다.
- 음성 대화: `OPENAI_API_KEY`. `REALTIME_MODEL` 기본값은 `gpt-realtime-2.1-mini`다. 글 대화 키와 별도로 설정한다.

글 대화는 JSON 응답을 기다린 후 성공한 사용자 글·답변을 기기 기록에 저장한다. 실패하면 입력을 유지한다. 글에서 음성으로 전환할 때 이전 글 맥락은 새 음성 세션에 자동 전달되지 않는다. 기록은 기기에서 30일간 보관하며, 답변 생성에 필요한 메시지는 서버를 거쳐 Runyour AI로 전달한다.

로컬 작업 중 온보딩을 건너뛰려면 `.env.development.local`에 `NEXT_PUBLIC_SKIP_ONBOARDING=true`를 설정한다.
저장된 프로필이 없으면 기본 몽글이로 홈을 열며, 이 기본 프로필은 저장하지 않는다. 배포 빌드에는 적용되지 않는다.
온보딩을 다시 확인하려면 값을 `false`로 바꾸고 개발 서버를 다시 실행한다. 이미 저장된 프로필이 있다면 메뉴의 "처음부터 다시 하기"로 초기화한다.

프로젝트 규칙과 결정 사항은 [CLAUDE.md](CLAUDE.md)를 보세요.
