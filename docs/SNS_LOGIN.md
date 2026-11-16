# 로그인 재설계

브랜치: `feature/sns-login` · 기준: 신규 가입 · 휴대폰 계정 이전/병합 제외

## 화면

- 시작: 카카오로 시작하기 / 구글로 시작하기 / 이메일로 시작하기
- 버튼: 아이콘 + 문구, 간격 8px, 묶음 중앙 정렬
- 이메일 로그인: 이메일 + 비밀번호
- 이메일 가입: 이메일 입력 → 인증번호 입력 → 비밀번호 생성·확인 → 기존 이용 동의 → 캐릭터 설정
- 비밀번호 재설정: 이메일 → 인증번호 → 새 비밀번호
- 휴대폰 입력·SMS 인증·휴대폰 비밀번호 로그인 제거
- 인증번호 입력: 6자리 고정, 3칸–3칸 배치. Supabase OTP Length를 6으로 설정
- 인증 후 기존 쿠키 세션 유지, 회원·동의 확인 유지

## 구현

- Supabase `signInWithOAuth`, PKCE 콜백 `/auth/callback`
- 콜백: 일회용 코드 중복 교환 방지, 취소/실패 안내, 15초 응답 제한
- 인증 완료 후 앱 진입 시 서버에서 회원 등록·동의 상태 확인
- 이메일 가입 `signInWithOtp(shouldCreateUser: true)` → `verifyOtp` → `updateUser(password)`
- 재로그인 `signInWithPassword`
- 가입 메일 재전송: `signInWithOtp(shouldCreateUser: true)`
- 재설정: `resetPasswordForEmail` → `verifyOtp(type: recovery)` → `updateUser(password)`
- 신규 회원: `register_verified_member()` RPC
- 이메일 회원 등록: 이미 이메일 인증된 계정의 비밀번호 변경을 Auth trigger로 확인한 뒤 등록
- 이메일 OTP만 완료한 계정: 회원 권한 없음, 새로고침해도 비밀번호 생성부터 계속
- SNS 회원 등록: 서버에서 Google/Kakao identity 확인 후 RPC로 등록
- 회원 ID: `auth.uid()`만 사용, 클라이언트 user ID·사용자 수정 가능한 metadata 사용 금지
- 기존 회원의 반복 등록 없음, 동시 호출은 `on conflict` 처리
- 미설정 SNS: 외부 오류 페이지로 보내지 않고 앱 안에서 안내

## 개발 Supabase 연결 준비

프로젝트: `here-dev` / `mwjwfumpxdlllikcdvkh`

1. 카카오 개발자 앱 생성, 카카오 로그인 활성화, REST API 키·Client Secret 준비
2. Google Cloud OAuth 동의 화면 및 웹 클라이언트 생성, Client ID·Client Secret 준비
3. 두 공급자에 등록할 콜백: `https://mwjwfumpxdlllikcdvkh.supabase.co/auth/v1/callback`
4. Supabase Auth → Providers에 각각 연결, Google/Kakao 활성화
5. 카카오 이메일을 필수 수집하지 않을 경우 Supabase의 이메일 없는 사용자 허용 설정 확인
6. Supabase Auth → URL Configuration → Redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://here-dev.vercel.app/auth/callback`
7. Custom SMTP 연결, 발신 이메일/도메인 인증
8. Confirm email 유지, Email provider 활성화 유지
9. Confirm sign up / Magic link or OTP / Reset password 메일 템플릿을 아래 인증번호 템플릿으로 설정
10. 개발 DB에 `0010_social_signup.sql` 적용 후, 새 UI 배포 시 `0011_email_signup.sql` 적용
11. 새 UI 개발 배포와 함께 Phone provider 비활성화

운영 Supabase와 운영 배포 변경 없음. 카카오 실제 인증·회원 등록 검증 완료. Google 실제 인증·회원 등록 검증 완료. 이메일 SMTP 설정은 남음.

현재 개발 DB: Email/Confirm email/Kakao/Google 활성, Phone 비활성, Custom SMTP 미연결(2026-11-16 확인).
기본 메일의 링크를 그대로 쓰면 앱의 인증번호 단계와 맞지 않으므로 SMTP·템플릿 설정을 완료한 뒤 가입 시험.

### Confirm sign up / Magic link or OTP

제목: `[Here] 이메일 인증번호`

```html
<h2>Here 이메일 인증</h2>
<p>가입 화면에 아래 인증번호를 입력해 주세요.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>직접 요청하지 않았다면 이 메일을 무시해 주세요.</p>
```

### Reset password

제목: `[Here] 비밀번호 재설정 인증번호`

```html
<h2>비밀번호 재설정</h2>
<p>Here 비밀번호 재설정 화면에 아래 인증번호를 입력해 주세요.</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>직접 요청하지 않았다면 이 메일을 무시해 주세요.</p>
```

## 실제 연결 후 검증

- 카카오/구글 최초 가입 → 동의 → 홈
- SNS 취소/거절 → 재시도 화면
- 이메일 가입: 인증 전 및 비밀번호 생성 전 회원 접근 차단, 비밀번호 생성 후 회원 등록·동의
- 이메일 인증번호 만료·재전송·틀린 번호
- 이메일+비밀번호 재로그인, 틀린 비밀번호
- 비밀번호 재설정·새 비밀번호 로그인
- 재접속 시 세션 복원, 캐릭터 재설정 없음
- 다른 계정 데이터 접근 불가

참고: [Supabase 이메일 인증](https://supabase.com/docs/guides/auth/auth-email-passwordless), [OAuth PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

개발 화면 미리보기: `/dev/email-auth` (로컬 개발 모드 전용, 메일 전송·세션 생성 없음)

## 검증 상태 (2026-11-16)

- 전체 자동 테스트: 344개 통과
- 프로덕션 빌드 및 OAuth 변경 파일 ESLint: 통과
- 로컬 브라우저: SNS 취소 후 재시도 화면 확인
- 개발 DB: `0010_social_signup.sql` 적용 완료. Google/Kakao identity를 확인한 본인 회원 등록만 허용
- 이메일 전환 `0011_email_signup.sql`: 개발 DB 적용 완료. 기존 Phone 회원 자동 등록 트리거 제거, 이메일 인증 후 비밀번호 생성 시 회원 등록
- 카카오 앱: Here Dev / ID `1652045`, 로그인 활성, Client Secret 활성
- 카카오 수집: 닉네임·프로필 사진 선택 동의, 이메일 제외. 기본 Supabase `account_email` scope를 queryParams로 제외(KOE205 방지)
- 카카오 Supabase: 공급자 활성 및 이메일 없는 계정 허용, 인증 키는 Supabase에만 저장
- 인증 복귀 주소: `http://localhost:3000/auth/callback`, `https://here-dev.vercel.app/auth/callback` 등록
- 카카오 실제 시험: 선택 개인정보 미제공 → 인증 → 신규 닉네임 설정 화면 진입. DB 확인: Kakao identity 1건 / members 1건
- 새로고침: 재인증 없이 닉네임 설정 화면 복원. 온보딩 완료·장시간 재접속은 미검증
- Google 프로젝트: `here-dev-ur1006` / Here Dev, Here 공용 계정 소유. 승인받은 사용자 데이터 정책 동의 완료
- Google OAuth Client: `Here Dev Supabase Web`, 개발 Supabase 콜백 한 개 등록. Client Secret은 Supabase에만 저장
- Google 공급자 활성. nonce 검사 유지, 이메일 필수 유지. 실제 요청 범위 `email profile`
- Google 게시 상태: 테스트 중. 등록 테스트 사용자 `hereur1006@gmail.com`; 일반 공개 게시·브랜딩 검증은 별도
- Google 실제 시험: 공용 Google 계정 → 인증 → 신규 닉네임 설정 화면 진입, 새로고침 후 재인증 없음
- DB 확인: Google identity 1건 / members 1건, Kakao identity 1건 / members 1건. 두 방식 모두 자동 회원 등록 확인
- 온보딩 이후 전체 이용 흐름, 다른 팀원 계정, 장시간 세션 복원: 이번 시험 범위 외
- 배포 대상: `feature/sns-login` → `dev` / `https://here-dev.vercel.app`
- 이메일 발송 대기: Here 소유 도메인 없음. 배포에서는 이메일 버튼에 준비 중 안내 표시
- SMTP·인증번호 템플릿 설정 후 `NEXT_PUBLIC_EMAIL_AUTH_ENABLED=true`로 재배포하여 이메일 가입 활성화. 로컬 개발에서는 화면 확인 가능

## 개발 배포

- 2026-11-16: `0d044a1` 개발 배포 Ready, `here-dev.vercel.app` 연결 확인
- 기존 휴대폰 로그인: 개발 Supabase Phone provider 비활성화 완료
- 이메일 준비 중 안내: 개발 배포 화면에서 확인
- 배포 Google 시험: Here 공용 계정 인증 → Here 이용 동의 화면 복귀 확인
- 배포 Kakao 시험: Here Dev 동의 화면 진입 확인. 추가 개인정보 제공 동의는 진행하지 않음
