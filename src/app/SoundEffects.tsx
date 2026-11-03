"use client";

import { useEffect } from "react";
import { type SfxKind, playSfx } from "@/lib/sfx";

// 앱 전체의 버튼·링크 누름에 짧은 소리를 붙인다. data-sfx="none"이면 건너뛰고, data-sfx="success"면 완료 소리를 낸다.
// 화면 전환에는 소리를 붙이지 않는다(미끄러지듯 바뀌는 동작과 어울리는 소리를 못 찾았다).
export default function SoundEffects() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("button, a[href], [role='button'], [role='tab'], [role='switch'], [role='radio'], [role='menuitem']");
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
      const kind = target.closest<HTMLElement>("[data-sfx]")?.dataset.sfx ?? "tap";
      if (kind === "none") return;
      playSfx(kind as SfxKind);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
