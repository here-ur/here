"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
import { createOAuthCompletion, type OAuthCompletion } from "@/lib/oauth-callback";
import AuthScreen from "../../AuthScreen";
import { Button } from "../../ui/Button";

// Strict Mode에서도 동일한 클라이언트의 일회용 code를 다시 교환하지 않는다.
let complete: ReturnType<typeof createOAuthCompletion> | undefined;

export default function AuthCallback() {
  const [result, setResult] = useState<OAuthCompletion | null>(null);
  useEffect(() => {
    let active = true;
    complete ??= createOAuthCompletion(browserSupabase());
    void complete(location.href).then(result => {
      if (!active) return;
      // 임의 next URL이나 공급자 오류문을 렌더링하지 않는다.
      if (result === "success") location.replace("/");
      else { history.replaceState(null, "", "/auth/callback"); setResult(result); }
    });
    return () => { active = false; };
  }, []);
  if (!result) return <AuthScreen loading />;
  return <AuthScreen>
    <div className="here-auth-welcome"><div className="here-auth-welcomeBottom here-auth-retry">
      <p role="alert" className="here-auth-unavailable">{result === "cancelled" ? <>로그인을 취소했어요.<br />원할 때 다시 시작할 수 있어요.</> : <>로그인을 완료하지 못했어요.<br />시작한 브라우저에서 다시 시도해 주세요.</>}</p>
      <Button tone="ink" fullWidth onClick={() => location.replace("/")}>로그인 화면으로</Button>
    </div></div>
  </AuthScreen>;
}
