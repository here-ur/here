"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

// 환영 영상의 재생 위치. 로그인 시트에서 기억 동의 시트로 넘어갈 때 화면이 다시 그려져도 영상이 처음부터 다시 시작하지 않게 이어 튼다.
let welcomeVideoTime = 0;

function WelcomeVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (welcomeVideoTime > 0) {
      const resume = () => { video.currentTime = welcomeVideoTime % (video.duration || Infinity); };
      if (video.readyState >= 1) resume();
      else video.addEventListener("loadedmetadata", resume, { once: true });
    }
    return () => { welcomeVideoTime = video.currentTime; };
  }, []);
  return <video ref={ref} src="/auth/login-cat-bedroom.mp4" poster="/auth/login-cat-bedroom.png"
    autoPlay loop muted playsInline preload="auto" tabIndex={-1}
    className="here-auth-image absolute inset-0 size-full" />;
}

/** Auth artwork keeps the approved 393 × 852 crop and gradient layers. */
export default function AuthScreen({ children, welcome = false, loading = false }: {
  children?: ReactNode;
  welcome?: boolean;
  loading?: boolean;
}) {
  return <main className="app-frame here-auth-screen" data-welcome={welcome || undefined}
    aria-busy={loading || undefined} aria-label={loading ? "로그인 상태 확인 중" : undefined}>
    <div className="here-auth-artwork" aria-hidden="true">
      <div className="here-auth-imageCrop">
        {welcome ? <WelcomeVideo />
          : <Image src="/auth/login-cat-bedroom.png" alt="" fill sizes="(max-width: 430px) 117vw, 501px" preload unoptimized
            className="here-auth-image" />}
      </div>
      <div className="here-auth-topShade" />
      <div className="here-auth-bottomShade" />
    </div>
    {children}
  </main>;
}
