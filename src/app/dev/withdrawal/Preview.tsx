"use client";

import { useEffect, useState } from "react";
import WithdrawalPending from "../../WithdrawalPending";

// 미리보기용 고정 마감(지금 시각을 읽으면 Next가 미리 그리기 경고를 낸다).
const UNTIL = "2026-12-03T06:30:00.000Z";
const ERROR = "탈퇴를 취소하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";

/** 탈퇴 유예기간 안에 다시 로그인했을 때의 화면을 로그인 없이 본다. ?error=1이면 취소 실패 문구까지. */
export default function Preview() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("error")) return;
    const frame = requestAnimationFrame(() => setError(ERROR));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <WithdrawalPending until={UNTIL} busy={busy} error={error}
    onCancel={() => { setError(""); setBusy(true); setTimeout(() => setBusy(false), 1500); }}
    onSignOut={() => setError("")} />;
}
