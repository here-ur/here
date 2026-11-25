"use client";

import { formatWithdrawalDeadline } from "@/lib/member-withdrawal";
import AuthScreen from "./AuthScreen";
import { Button } from "./ui/Button";

/** 탈퇴 유예기간(7일) 안에 다시 로그인한 회원에게 보여 주는 화면. 앱에는 들이지 않고 탈퇴를 취소할지 묻는다.
 * 로그인만으로는 취소되지 않는다. 환영 화면과 같은 침실 그림 위에 안내와 검정 알약 버튼을 둔다. */
export default function WithdrawalPending({ until, busy = false, error = "", onCancel, onSignOut }: {
  until: string; busy?: boolean; error?: string; onCancel: () => void; onSignOut: () => void;
}) {
  return <AuthScreen>
    <div className="here-auth-welcome">
      <h1 className="here-auth-brand"><span>나와 가장 가까운 친구</span><span>here</span></h1>
      <div className="here-auth-welcomeBottom here-auth-retry">
        <div role="status" className="here-auth-unavailable">
          <p className="here-auth-withdraw-title">탈퇴를 신청한 계정이에요</p>
          <p className="here-auth-withdraw-desc">{formatWithdrawalDeadline(new Date(until))}까지 탈퇴를 취소할 수 있어요. 그 뒤에는 이 계정으로 다시 로그인할 수 없어요.</p>
        </div>
        {error && <p role="alert" className="here-auth-unavailable auth-provider-error">{error}</p>}
        <Button tone="ink" fullWidth loading={busy} onClick={onCancel}>탈퇴 취소하고 돌아가기</Button>
        <Button variant="tonal" tone="ink" fullWidth disabled={busy} onClick={onSignOut}>로그아웃</Button>
      </div>
    </div>
  </AuthScreen>;
}
