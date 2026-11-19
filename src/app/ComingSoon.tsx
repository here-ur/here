"use client";

import { useEffect } from "react";
import { PawPrint } from "./ui/PawLoader";
import "./coming-soon.css";

export type SoonFeature = "help" | "friends" | "garden";

const COPY: Record<SoonFeature, string> = {
  help: "도움받기는 준비 중이에요",
  friends: "친구는 준비 중이에요",
  garden: "구름 정원은 준비 중이에요",
};

/** 아직 열지 않은 기능(도움받기·친구·구름 정원)을 눌렀을 때 아래쪽에 잠깐 떴다 사라지는 '준비 중' 안내.
 * 메뉴와 버튼은 그대로 두고 들어가는 길만 막는다. 화면을 가리거나 포커스를 빼앗지 않는다.
 * 도움받기는 마음이 힘든 사람이 누를 수 있어서 109 안내를 함께 두고 조금 더 오래 보여 준다.
 * 안내 자리는 늘 두어서(화면 읽기 프로그램이 새 문장을 읽도록) 기능을 누를 때마다 내용만 바꾼다. */
export default function ComingSoon({ soon, onDone }: { soon: { feature: SoonFeature; n: number } | null; onDone: () => void }) {
  useEffect(() => {
    if (!soon) return;
    const timer = window.setTimeout(onDone, soon.feature === "help" ? 6000 : 2600);
    return () => window.clearTimeout(timer);
  }, [soon, onDone]);
  return (
    <div className="here-soon-region" role="status" aria-live="polite">
      {soon && (
        <div key={soon.n} className="here-soon">
          <span className="here-soon__icon" aria-hidden="true"><PawPrint size={15} /></span>
          <div className="here-soon__text">
            <p className="here-soon__title">{COPY[soon.feature]}</p>
            {soon.feature === "help" && (
              <p className="here-soon__detail">지금 많이 힘들다면 <a href="tel:109">109</a>에서 24시간 이야기할 수 있어요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
