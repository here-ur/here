@AGENTS.md

# Here!

말로 이야기하면 들어 주고, 필요할 때 가까운 정신건강의학과로 이어 주는 앱. 지금은 MVP 단계.

- 프로젝트 홈: https://app.notion.com/p/3a3d23ad25db82448d1601010d0ed47b
- PRD: [docs/PRD.md](docs/PRD.md) — 확정된 결정의 기준. 논의는 [Notion PRD](https://app.notion.com/p/3fad23ad25db81e3baf6da6653cf98bb)에서 하고, 정해지면 이 파일에 PR로 반영한다.
- IA (화면 흐름): https://app.notion.com/p/3fad23ad25db81488f05e5503e5af0e3

## MVP 범위 — 기능은 두 개뿐

1. **음성 대화**: 말하기 → STT → AI 답변 → TTS
2. **병원 연계**: 심평원 병원정보 API로 가까운 정신건강의학과 목록 + 전화(`tel:`)·지도 링크

이 둘 밖의 기능(로그인, 서버 저장, 예약, 감정 분석 등)은 만들지 않는다. 예외로 "내 기록"(아래)만 붙였다. 아이디어는 PRD의 "MVP 다음에"에 적는다.

## 기술 결정

- Next.js (App Router, TypeScript, `src/`) + Tailwind, Vercel 배포
- **API 키는 서버에만**: OpenAI·심평원 키는 `src/app/api/**/route.ts`에서만 쓴다. 키를 `NEXT_PUBLIC_*`로 두거나 클라이언트 코드에서 쓰지 않는다. 음성 대화는 브라우저가 OpenAI realtime에 직접 붙지만, 서버(`/api/realtime`)가 발급한 60초짜리 임시 키만 쓴다.
- 키는 `.env.local`(커밋 금지, `.gitignore`에 이미 있음)과 Vercel 환경변수에 둔다.

## 반드시 지킬 것

- **위기 표현**(자살·자해 등)이 나오면 AI 답변보다 먼저 자살예방상담전화 **109** 안내를 보여 준다. `tel:109`로 바로 걸 수 있게 한다.
- **AI는 진단하지 않는다.** 병명·약·처방을 말하지 않고, 대화 상대가 AI라는 걸 화면에서 알린다.
- **병원 알선 금지** (의료법 27조 3항): 특정 병원을 추천·우선 노출하거나 병원에서 수수료를 받는 구조를 만들지 않는다. 목록은 거리순 같은 중립 기준으로만 정렬한다.
- **비대면 진료 중개 금지**: 2026-12-24부터 플랫폼 신고·인증 대상이다. MVP는 정보 + 전화·지도 링크까지만 한다.

## 정한 것 (PRD 체크리스트)

- **AI·음성**: OpenAI realtime `gpt-realtime-2.1-mini` 하나로 듣기·답하기·말하기를 한다(WebRTC, `src/lib/realtime.ts`). 받아쓰기는 `gpt-4o-mini-transcribe`, 목소리는 `marin`. 키는 `OPENAI_API_KEY` 하나. 몽글이 지시문과 도구는 `src/app/api/realtime/route.ts`.
- **대화 시작·끝**: 시작 화면의 "이야기 시작하기" → 몽글이 인사. "대화 마치기"를 누르면 시작 화면으로.
- **내 기록**: 첫 화면 오른쪽 위 버튼. 프로토타입 "내 기록"의 하루하루 탭만 옮겼다. 대화는 이 기기의 `localStorage`에만 30일 남기고(`src/lib/log.ts`), 서버로 보내지 않는다. 마주하기·마음 점검·상담·병원 탭은 기분 고르기, PHQ-9·GAD-7, 예약 데이터가 있어야 해서 아직 없다.
- **대화 화면은 통화처럼**: 대화 중에는 말풍선 없이 몽글이와 상태(듣는 중·말하는 중)·통화 시간만 보인다. 아래 버튼은 소리·마이크·글로 쓰기·끝내기. 대화 내용은 끝낸 뒤 "오늘 나눈 이야기"로 한꺼번에 보여 준다. 자막 버튼(기본 꺼짐)을 켜면 몽글이 말이 글로 보인다.
- **글 입력**: 둔다. 마이크를 못 쓰면 글 입력과 자막이 자동으로 켜진다. 마이크는 늘 열려 있다(말이 끝나면 알아서 답함).
- **병원 권유**: AI가 대화를 보고 권한다(`show_clinics` 도구). 권할 때도 "전문가와 이야기해 보는 것도 방법" 정도로만, 진단처럼 들리지 않게.
- **위기 감지**: 받아쓰는 중인 내 말에 키워드(`src/lib/crisis.ts`)가 보이거나, 몽글이가 `show_crisis_help` 도구를 부르면 109 안내를 띄운다. realtime은 서버가 답을 먼저 막을 수 없어서, 화면 안내를 최대한 빨리 띄우는 쪽으로 지킨다.

아직 안 정한 것은 임의로 정하지 말고 팀에 먼저 묻는다.

## 화면 흐름

IA 초안: **시작 → 음성 대화 → (필요할 때) 병원 연계**

몽글이 프로토타입(https://claude.ai/artifact/Pwz8N8Urai8gAqZWQFRkmr)의 화면 흐름과 생김새(하늘색 그라데이션, 보라 버튼, 말풍선, 가운데 마이크 버튼, 캐릭터 이름 "몽글이")를 따른다. 기분 고르기 화면과 내 기록의 나머지 탭은 MVP 범위 밖이라 뺐다. 프로토타입의 기능 코드는 가져오지 않는다.

## 병원정보 API

공공데이터포털의 "건강보험심사평가원_병원정보서비스"(data.go.kr 15001698)를 쓴다. 구현은 `src/app/api/hospitals/route.ts`.

- `hospInfoServicev2/getHospBasisList`에 `xPos`(경도)·`yPos`(위도)·`radius`(m)·`dgsbjtCd=03`(정신건강의학과)·`_type=json`
- 응답 `response.body.items.item`은 결과가 하나면 객체, 없으면 빈 문자열로 온다 → 배열로 정규화
- 거리 필드는 확인되지 않아 서버에서 직접 계산(`src/lib/geo.ts`)해 거리순 정렬
- 실제 키로 한 번도 호출해 보지 않았다. 첫 호출 때 `_type=json`과 필드 이름(`yadmNm`, `addr`, `telno`, `clCdNm`, `XPos`, `YPos`)이 맞는지 확인한다.

## 브랜치

- `main`: 상용 배포, 기본 브랜치. 작업 브랜치는 `main`에서 만들고, PR도 `main`으로 보낸다.
- 작업 브랜치 이름: `feat/...`, `fix/...`

## 명령어

```bash
npm run dev    # 개발 서버
npm run build  # 빌드 확인
npm run lint
npm test       # src/**/*.test.ts (node --test)
```

키는 `.env.example`을 `.env.local`로 복사해서 채운다.
