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

- 발음별 입 모양(현재는 실제 재생 위치의 음량에 반응). 걷기는 적용 범위에서 제외
- 파일 첨부, 라이브러리/내 기록, 기타 웹 메뉴 이식
- 실제 텍스트 채팅 및 음성 기억의 DB 저장·새 세션 회상 end-to-end 검증
- 장기 미접속 후 세션 갱신 검증. 앱 프로세스 종료·재실행 복원은 확인 완료
- 앱 아이콘, 운영 빌드 설정, 서명, TestFlight/앱스토어 심사 준비

미리보기에서는 음성 권한 요청·세션 발급·마이크 전송 모두 차단. 실제 계정 로그인 후 이용 가능.

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
  -destination 'generic/platform=iOS Simulator' build
xcodebuild -project ios/Here.xcodeproj -scheme Here \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

2026-11-12 검증: Xcode 26.6 / iPhone 17, iOS 26.5 시뮬레이터 빌드 성공. 입력 정규화·대화 길이 제한·웹 프로필 호환 단위 테스트 5개 통과. 로그인 화면, 미리보기 홈, 채팅 입력창 열기·닫기, 음성 준비 중 안내 직접 확인.

최초 구현 당시 실제 SMS/채팅 통합 및 장기 세션 유지 검증은 미완료. 후속 로그인·음성 검증 결과는 아래 기록 참고. 미리보기는 이 검증을 대체하지 않음.

## iOS 음성 대화

- 마이크 버튼: 홈 안에서 종료·음소거 컨트롤로 확장
- 최초 사용 시 iOS 마이크 권한 요청. 거절 시 설정 이동 제공
- `/api/realtime` 임시 키 → 네이티브 URLSession WebSocket → OpenAI Realtime
- 앱에는 영구 AI API 키 없음. 서버의 모델·목소리·캐릭터 프롬프트 유지
- AVAudioEngine 음성 처리: 에코 제거, 입력 리샘플링, PCM16/24kHz 스트리밍·재생
- 사용자 발화 감지 시 답변 재생 중지, 실제 재생 시간까지 대화 내용 잘라내기
- 연결·재연결 시 인사 반복 없음. 자동 홈 인사 기능은 별도 미구현
- 확정 사용자 발언 → `/api/voice-memory` 요약 저장 요청. 원음 파일 저장 없음
- 기억 검색·웹 검색 도구 연결, 검색 출처 링크 표시. 저장 요청의 수락과 DB 저장 완료는 구분
- 시작 계정 고정: 대화 중 계정 변경·동의 철회 시 다른 계정으로 기억 저장 불가
- 앱 백그라운드·오디오 중단·경로 변경·연결 실패·종료 시 마이크 및 재생 정리
- 종료 중 수신한 임시 키·권한 결과 무시. 음성 세션은 최대 30분 후 종료, 사용자가 다시 시작
- WebSocket 오디오 버퍼는 네이티브에서 관리. 불안정한 네트워크에서 과도한 지연 발생 시 종료·재시도 안내. 실제 기기에서 스피커/이어폰·끼어 말하기 검증 필요

참고: [OpenAI WebSocket](https://developers.openai.com/api/docs/guides/voice-websockets), [Realtime 중단 처리](https://developers.openai.com/api/docs/guides/realtime-conversations), [Apple 음성 처리](https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:))

시뮬레이터도 기본 코드 서명 유지 필수. `CODE_SIGNING_ALLOWED=NO`로 실행하면 Keychain 저장 권한이 없어 SMS 인증 이후 세션을 복원하지 못할 수 있음. 로그인 화면 전에 안전한 저장소 쓰기·읽기 검증, 임시 검증 값 즉시 삭제.

2026-11-12 음성 구현 검증: 서명한 시뮬레이터 빌드에서 전체 17개 테스트 통과. 이전 서명 비활성 빌드에서는 동일 Keychain 테스트가 -34018로 실패하는 것 재현. 수정 빌드에서 실제 사용자 SMS 로그인 및 프로세스 종료 후 재실행 시 인증·캐릭터 설정 없이 홈 복원 확인. 실제 마이크 입력 후 사용자에게 음성 답변이 들리는 것 확인. 음소거·종료 및 홈 복귀 직접 확인. 기억 API 연결은 구현했지만 실제 DB 저장·새 세션 회상은 이번 테스트에서 미확인.

오디오 초기화 중 category 변경이나 실행 중인 엔진의 구성 알림은 종료로 처리하지 않음. 시작 직후 하드웨어 포맷 변경으로 엔진이 멈춘 경우 제한된 횟수로 재시작. 실제 전화 중단·이어폰 연결 변경 시에는 종료. 해당 구분 회귀 테스트 포함.

## 고양이 얼굴 애니메이션

- 새 정면 고양이 이미지 유지. Metal 눈꺼풀 변형으로 불규칙한 간격의 깜빡임
- 홈·채팅에서 같은 얼굴 컴포넌트 사용. 몸 이동·걷기·음성 시작 시 확대 없음
- PCM을 20ms 단위 음량으로 분석하고 AVAudioPlayerNode 재생 위치에 맞춰 입 벌림 적용
- 수신 시점이 아닌 재생 시점 기준. 무음·끼어 말하기·종료 시 닫힘, 중단된 버퍼 폐기
- 발음 인식/음소별 립싱크는 미포함. Reduce Motion·비활성 화면에서 자동 깜빡임 중지
- 서명한 시뮬레이터 빌드 및 전체 20개 테스트 통과. 실제 마이크 답변과 입 움직임의 사용자 체감 검증은 대기
- 최초 빌드 시 Metal Toolchain이 없으면 `xcodebuild -downloadComponent MetalToolchain` 실행
