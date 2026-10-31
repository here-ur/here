"use client";
import { useState } from "react";
import HomeScreen from "../../HomeScreen";
import { DEFAULT_COMPANION } from "@/lib/onboarding";

export default function Preview() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  return <HomeScreen
    profile={{ nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" }}
    greet={false} headline={"아줄 한 판 대신,\n이야기 한 판 어때?"}
    onVoice={() => {}} onText={() => setOpen(true)} onLog={() => {}} onMenu={() => {}}
    chat={{ open, draft, sending: false, error: "", state: "idle", onDraft: setDraft, onClose: () => setOpen(false), onSend: () => {}, messages: [
      { role: "user", content: "테스트 화면: 내가 좋아하는 게임과 음료는?" },
      { role: "assistant", content: "가장 좋아하는 보드게임은 **아줄**, 음료는 **따뜻한 보리차**였어.\n\n- 타일 한 장\n- 이야기 한 조각\n\n| 게임 | 음료 |\n| --- | --- |\n| 아줄 | 따뜻한 보리차 |\n\n`테스트 코드`도 읽기 쉽게 보여." },
    ] }}
  />;
}
