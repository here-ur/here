<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Here UI

- 새 화면과 기존 화면의 공통 UI에는 **Framework7 React의 iOS 테마**를 기본으로 사용한다. 먼저 `src/app/ui/`의 공통 컴포넌트를 확인하고, 새 공통 요소는 그 폴더에 추가한다.
- `src/app/layout.tsx`에서 `ui/FrameworkShell.tsx`와 `ui/framework7.css`를 연결한다. `FrameworkShell`은 `theme="ios"`를 사용한다. Framework7 패키지 CSS는 전용 파일에서 `framework7` 레이어로 불러오고, Here 테마 조정은 `ui/foundation.css`에서 `--f7-*` 변수로 관리한다.
- 공통 아이콘은 `framework7-icons`와 `src/app/art.tsx`의 `Icon`을 사용한다. 아이콘만 있는 버튼에는 동작을 설명하는 접근성 이름을 붙인다.
- 컴포넌트를 교체할 때 폼 제출, 키보드 입력, 포커스 복귀를 보존한다. Framework7 React가 필요한 DOM 속성이나 이벤트를 전달하지 않으면 네이티브 요소에 Framework7 클래스를 적용한다.
- UI 수정 후 로컬 브라우저에서 변경한 화면을 조작해 본다. 테마 로딩을 수정했다면 홈에서 반투명 첨부·글 대화 버튼과 파란 마이크 버튼을 확인하고 `npm run build`로 검증한다. `ios` 클래스 확인에 더해 실제 스타일이나 `--f7-glass-bg-color` 계산값을 확인한다.
