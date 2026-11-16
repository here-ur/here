# 웹 음성 — GPT-Live

- 대상: 개발 웹, `feature/live-voice` → `dev`
- 음성 모델: `gpt-live-1`
- 한국어 목소리: `noeul` (Noeul)
- 서버 설정: `LIVE_MODEL`, `LIVE_VOICE`; 미설정 시 위 기본값 적용
- 인증: 기존 서버 `OPENAI_API_KEY` 재사용, 브라우저에 키 반환 없음
- 기존 프로필의 Realtime 목소리 선택값: Live 연결에는 적용하지 않음. 현재 웹은 Noeul 통일
- iOS 기존 `/api/realtime`: 기존 계약 유지. 네이티브 Live 전환은 별도 작업

## 연결

- 브라우저 SDP → 회원·동의·요청 한도 확인 → `/api/live` → OpenAI `/v1/live/sessions`
- `session.started` 이후 마이크 입력 활성화
- 일반 음성 연결: 인사 반복 없음
- 홈 인사: 별도 요청 시에만 생성. 마이크 없이 무음 트랙 사용, 브라우저 자동 재생 정책 준수
- 입 모양·말하는 상태: 실제 출력 오디오 분석
- 종료: 입력·재생 즉시 중지, `session.close` 전송 → `session.closed` 수신 후 정리 (15초 제한)

## 기억·검색

- 사용자·캐릭터 자막: 서로 독립적으로 수신, 타임스탬프 유지
- Live 자막에 발언 종료 이벤트 없음. 2.5초 수신 간격/크기 제한/연결 종료 기준으로 저장 단위 구분
- 사용자 자막만 기존 `/api/voice-memory`로 요약 저장 요청, 고유 source ID로 중복 방지
- 오디오 원본 저장 없음, OpenAI `store: false`
- 기억 조회·최신 정보·복잡한 고민: Live client delegation → `/api/live/delegate`
- 기존 Runyour 채팅 모델의 추론·기억 조회·웹검색·안전 안내 재사용
- 검색 출처: 화면 표시, 음성에서는 링크 낭독 제외
- 백엔드 처리 중 새 발언: 오래된 결과 발화 방지, 최신 문맥으로 재요청
- Live 추가 문맥: 요청당 500토큰 제한. 한국어·이모지 포함 UTF-8 440바이트 이하로 분할
- 요약 모델·임베딩 모델: 기존 설정 유지

## 검증

- 자동 테스트 358개 통과, 프로덕션 빌드 통과
- 비로그인 `/api/live`: 401, 세션 발급 차단
- 개발 계정으로 로컬 WebRTC 연결·듣기 상태 확인
- Noeul 한국어 인사: 자막·실제 오디오 출력 감지·재생 종료 확인
- 새 모델에서 실제 사용자 발화 → 기억 저장 → 다음 음성 회상, 실제 검색 질의: 별도 실사용 검증 필요

## 비용

- GPT-Live 음성 세션: $0.05/분, 초 단위 과금, 무음·백엔드 대기 포함
- WebRTC 초기화: 15초분 예약 과금 후 실행 세션 사용량과 상계
- 위임한 채팅 모델·웹검색·요약·임베딩: 각각 별도 비용

## 근거

- [Live 연결](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [한국어 Noeul·자막·종료 규격](https://developers.openai.com/api/docs/guides/live-conversations)
- [백엔드 위임](https://developers.openai.com/api/docs/guides/live-delegation)
- [GPT-Live 모델](https://developers.openai.com/api/docs/models/gpt-live-1)
