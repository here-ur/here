# 캐릭터 만나기 무대 (1번 톤)

첫 실행의 '캐릭터 만나기' 화면을 그리는 파일이에요. 시안에서 만든 화면을 그대로 올린 것이라 React 컴포넌트가 아니고, 브라우저가 바로 읽는 스크립트와 스타일이에요.

- 세우는 곳: `src/app/OnboardingStage.tsx` — 이 파일들을 받아 섀도 루트 안에 무대를 세우고(앱의 스타일과 섞이지 않게), 화면 크기에 맞춰 줄이거나 늘려요.
- 값을 잇는 곳: `src/app/Onboarding.tsx` — 하던 자리를 남기고, 마지막에 고른 답을 프로필로 바꿔요.
- 문구: `src/lib/onboarding.ts`가 기준이에요. 무대를 세울 때 `copy.js`의 질문·대답·첫 화면 문구를 그 값으로 덮어써요. 문구는 거기서 고치세요.

## 파일

| 파일 | 하는 일 |
|---|---|
| `copy.js` | 무대의 문구 틀(`HereCopy`). 앱이 덮어쓰지 않는 문구(이름 짓기, 109 안내 등)는 여기 값이 그대로 나와요. |
| `cat.js` | 고양이 배우(`HereCat`): 자세 바꾸기, 걷기. 그림은 `public/characters/motion/`의 파일을 써요. |
| `sound.js` | 효과음(`HereSound`). 소리 파일 없이 그 자리에서 만들어요. 켬/끔은 앱의 효과음 설정과 같은 값이에요. |
| `phone.js`, `phone.css` | 무대의 뼈대(`HerePhone`)와 장면 다섯 개: 만남, 내 이름, 질문 1, 질문 3, 이름 짓기 |
| `scenes/promise.*` | 시작 전 약속. 앱에서는 알림만 모드(AI·기록·109 안내와 '알겠어요')로 떠요. |
| `scenes/q2.*`, `scenes/q4.*`, `scenes/meet.*` | 질문 2(돌림판), 질문 4(밀어서 고르기), 데려가기(걷기 영상 자동 재생 · 냥줍하기로 이름 짓기) |
| `scenes/birthday.*`, `scenes/gender.*` | 생일(숫자 굴리기), 성별(여성·남성). 물어야 하는 회원에게만 열려요. |

## 고칠 때

- 파일을 고치면 `src/app/OnboardingStage.tsx`의 `STAGE_VERSION`을 올려 주세요. 브라우저가 옛 파일을 붙잡지 않게 해요.
- 장면을 더하거나 빼면 같은 파일의 `SCRIPTS`·`STYLES` 목록과 `src/lib/onboarding.ts`의 `STAGE_SCENES`를 같이 고쳐요.
- 무대는 390×844 기준으로 그려요. 스타일의 선택자는 모두 `.hp`로 시작하고, `position: fixed`와 뷰포트 단위는 쓰지 않아요(테스트가 확인해요).
- 장면을 만드는 법(`HerePhone.addScene`, `ctx`, `HerePhone.ui`)은 시안 폴더의 `attempts/pop/NOTES.md`에 적혀 있어요. 시안 폴더에는 화면을 눌러 보며 찍는 도구도 있어요.
- 확인: `/dev/first-run`(2 캐릭터 만나기), `/dev/onboarding-overview`(장면 펼쳐 보기).
