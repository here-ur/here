"use client";
import { useState } from "react";
import { MicrophonePermissionNotice } from "../../MicrophonePermissionGate";
export default function Preview() {
  const [message, setMessage] = useState("");
  return <MicrophonePermissionNotice busy={false} error={message} onAllow={() => setMessage("미리보기: 실제 마이크 권한을 요청하지 않아요.")} onSkip={() => setMessage("미리보기: 홈으로 이동하는 버튼이에요.")} />;
}
