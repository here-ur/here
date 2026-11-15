"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (onChange: () => void) => {
  const query = matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

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

/** Auth artwork keeps the approved 393 × 852 crop and gradient layers.
 * 환영 영상은 계속 반복되므로, 동작 줄이기 설정에서는 영상 대신 같은 장면의 정지 그림(영상 포스터)을 보여 준다. 설정을 바꾸면 바로 따라간다. */
export default function AuthScreen({ children, welcome = false, loading = false }: {
  children?: ReactNode;
  welcome?: boolean;
  loading?: boolean;
}) {
  const reduced = useSyncExternalStore(subscribeReduce, () => matchMedia(REDUCE).matches, () => false);
  return <main className="app-frame here-auth-screen" data-welcome={welcome || undefined}
    aria-busy={loading || undefined} aria-label={loading ? "로그인 상태 확인 중" : undefined}>
    <div className="here-auth-artwork" aria-hidden="true">
      <div className="here-auth-imageCrop">
        {welcome && !reduced ? <WelcomeVideo />
          : <Image src="/auth/login-cat-bedroom.png" alt="" fill sizes="(max-width: 430px) 117vw, 501px" preload unoptimized
            className="here-auth-image" />}
      </div>
      <div className="here-auth-topShade" />
      <div className="here-auth-bottomShade" />
    </div>
    {children}
  </main>;
}
