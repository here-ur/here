"use client";

import { useId, type CSSProperties } from "react";
import { CAT_ART, CAT_SILHOUETTE } from "./CatFace";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Controls";

// 로그인 전 첫 화면. 약관 체크는 가입 버튼을 여는 화면 단계일 뿐 동의 이력을 저장하지 않는다.
// 이용약관·개인정보 처리방침 본문이 아직 없어 링크를 걸지 않았다. 이미 가입한 회원은 체크 없이 로그인한다.
export default function Welcome({ agreed, onAgreedChange, onSignup, onLogin }: {
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  onSignup: () => void;
  onLogin: () => void;
}) {
  const id = `welcome-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return <main className="app-frame flex flex-col bg-white text-[#2B2A30] [container-type:inline-size]">
    <header className="relative z-10 px-gutter pt-[clamp(56px,13dvh,112px)] text-center">
      <h1 className="text-balance text-[clamp(26px,8vw,32px)] font-extrabold leading-tight tracking-[-0.03em]">Here에 온 걸 환영해요!</h1>
      <p className="mt-2 text-pretty text-t5 text-[#8E8E93]">나랑 가장 가까운 친구와 함께 이야기해 봐요</p>
    </header>
    <div className="relative z-10 mt-[clamp(20px,5dvh,44px)] px-8 [--f7-checkbox-active-color:#1E1D24] [--f7-checkbox-border-radius:6px]">
      <Checkbox id="welcome-terms" className="text-t3 leading-snug text-[#6E6E73]" checked={agreed} onChange={(event) => onAgreedChange(event.target.checked)} label="Here 이용약관에 동의하고 개인정보 처리방침을 확인했어요." />
    </div>

    {/* 노란 원 위로 고양이가 얼굴을 내민다. 시안(852pt 높이)에서는 원이 귀보다 화면 너비의 30%만큼 위에서 시작하고,
     * 낮은 화면에서는 그 간격을 줄여 원이 위의 글자 뒤로 올라오지 않게 한다. */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 aspect-[676/779]"
      style={{ "--lift": "min(30.3cqw, max(12px, calc(max(100dvh, 640px) - 700px)))" } as CSSProperties}>
      <span className="absolute top-[calc(-1*var(--lift))] left-1/2 aspect-square w-[209%] -translate-x-1/2 rounded-full bg-[#FBB400]" />
      <svg className="absolute inset-0 size-full" viewBox="1360 340 676 779">
        <defs>
          <clipPath id={`${id}-cat`}><path d={CAT_SILHOUETTE} /></clipPath>
          <linearGradient id={`${id}-body`} x2="0" y2="1"><stop stopColor="#2E2E35" /><stop offset="1" stopColor="#222228" /></linearGradient>
        </defs>
        {/* 원본 그림은 턱 아래가 좁아져서 어깨를 그려 화면 아래를 채운다. */}
        <ellipse cx="1698" cy="1300" rx="560" ry="320" fill={`url(#${id}-body)`} />
        <image href={CAT_ART} width="3396" height="1852" clipPath={`url(#${id}-cat)`} />
      </svg>
    </div>

    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 px-8 pb-[max(12px,env(safe-area-inset-bottom))]">
      <Button fullWidth tone="sun" disabled={!agreed} onClick={onSignup} className="font-bold">계정 만들기</Button>
      <Button variant="plain" onClick={onLogin} className="min-h-11 text-t4 font-medium text-white/80">이미 계정이 있어요 · 로그인</Button>
    </div>
  </main>;
}
