# Here iOS — SwiftUI 첫 구현

- 기반: SwiftUI, iOS 17 이상, iPhone 세로 화면
- 디자인 기준: Apple 공식 iOS UI Kit. 실제 구현은 SwiftUI Form, NavigationStack, Toolbar, Menu, Sheet, 시스템 서체·Dynamic Type·SF Symbols 사용
- 현재 웹 화면을 WebView로 감싸지 않는 네이티브 앱
- Git: 기존 Here 저장소의 `ios/`, `feature/ios-swiftui` 브랜치
- 개발 API: https://here-dev.vercel.app
- 개발 DB: `here-dev` / `mwjwfumpxdlllikcdvkh`
- 운영 웹·운영 DB 변경 없음

## Xcode에서 실행

1. 저장소 루트의 `.env.development.local`에 기존 개발용 공개 Supabase URL/Publishable Key 준비
2. 저장소 루트에서 `python3 ios/configure-dev.py` 실행
3. `ios/Here.xcodeproj` 열기
4. Scheme `Here`, 실행 대상 iPhone 시뮬레이터 선택 후 ⌘R
5. 실제 개발 계정으로 SMS 로그인. 브라우저와 iOS 앱은 세션 저장 공간이 달라 앱에서 최초 1회 인증 필요

Xcode 프로젝트와 공유 Scheme은 저장소에 포함. 프로젝트 설정 변경 시 `brew install xcodegen` 후 `xcodegen generate --spec ios/project.yml`로 재생성.

`Here Preview` Scheme은 Debug 전용 화면 미리보기. 서버 로그인·대화·데이터 저장 없음. 앱 상단에 미리보기 상태 표시. 일반 `Here` Scheme은 실제 인증 흐름.

실제 iPhone 설치는 Xcode의 Signing & Capabilities에서 본인 개발 Team 지정 필요. TestFlight/앱스토어 제출 구성은 아직 미포함.

## 구현 범위

- 로그인: 휴대폰 번호 → 인증번호. 신규 가입: 초대코드 → 휴대폰 번호 → 인증번호
- 인증 후 members 확인, 미가입 계정만 초대코드 단계
- Supabase Swift SDK 2.55.6, 앱 전용 Keychain 저장, 만료 시 토큰 갱신, 앱 복귀 시 계정 확인
- 네트워크/프로필 조회 실패를 신규 가입으로 처리하지 않고 재시도 제공
- 기존 `here_profile_v1` 사용자 메타데이터 읽기·쓰기. 웹에서 저장한 이름/색상/목소리/스타일 유지
- 개인정보·민감정보 각각 동의, 상세 본문 접기, 하단 고정 CTA. 개발 동의 초안과 버전은 웹 API와 일치
- 고양이 홈, 같은 홈에서 텍스트 입력 확장, 닫으면 홈 복귀
- `/api/chat` 연결, 기존 서버 프롬프트·기억·검색 사용. 답변 실패 시 입력 보존, 중복 전송 방지
- 기본 Markdown 강조/링크 표시. 표/코드 블록 등 전체 Markdown 렌더러는 후속 범위
- 메시지 원문은 실행 중 메모리에만 보관. 앱 로컬 저장소에 영구 저장하지 않음

## 아직 미구현 / 검증 구분

- iOS 실시간 음성 대화, 마이크 권한, 음성에 맞춘 표정·입 모양, 걷기
- 파일 첨부, 라이브러리/내 기록, 기타 웹 메뉴 이식
- 실제 사용자 SMS 인증 → 프로필 복원 → 채팅/기억 저장 end-to-end 검증
- 실제 계정의 앱 종료·장기 미접속 후 세션 갱신 검증
- 앱 아이콘, 운영 빌드 설정, 서명, TestFlight/앱스토어 심사 준비

음성 버튼은 준비 중 안내만 표시하며 마이크나 과금 API를 실행하지 않음. 미리보기 응답을 실제 AI 응답처럼 표시하지 않음.

## 보안·환경

- `Config.plist`는 Git 제외. `Config.example.plist`에 형식만 포함
- 앱에는 공개 Supabase URL/Publishable Key만 포함. Runyour/OpenAI/service-role/Twilio 비밀 키 금지
- 인증 토큰은 SDK Keychain에 저장. 토큰·전화번호·대화 로그 출력 금지
- API 요청 시 Bearer 인증. 서버의 회원/RLS/동의/사용량 제한 재사용
- Preview는 Debug에서만 가능하며 서버 API 호출 차단
- 계정 로그아웃 시 화면 메모리의 프로필과 대화 제거

## 검증 명령

```sh
xcodebuild -project ios/Here.xcodeproj -scheme Here \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Here.xcodeproj -scheme Here \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

2026-11-12 검증: Xcode 26.6 / iPhone 17, iOS 26.5 시뮬레이터 빌드 성공. 입력 정규화·대화 길이 제한·웹 프로필 호환 단위 테스트 5개 통과. 로그인 화면, 미리보기 홈, 채팅 입력창 열기·닫기, 음성 준비 중 안내 직접 확인.

실제 SMS/채팅 통합 및 장기 세션 유지 검증은 미완료. 미리보기는 이 검증을 대체하지 않음.
