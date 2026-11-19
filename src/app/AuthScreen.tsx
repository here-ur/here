"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LOADING_SLOW_AFTER_MS } from "@/lib/loading-scene";
import { Button } from "./ui/Button";
import { PawLoader } from "./ui/PawLoader";

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
export default function AuthScreen({ children, welcome = false, loading = false, onRetry, onSignOut }: {
  children?: ReactNode;
  welcome?: boolean;
  /** 로그인 확인·로그인 돌아오기 중: 환영 화면과 같은 침실 그림(자는 고양이) 그대로, 버튼 자리에 발자국만 깜박인다.
   * 로그인 돌아오기 → 로그인 확인 → 홈으로 넘어가는 동안 배경이 바뀌지 않게 한다(로딩 화면 시안 A를 이 그림으로 대신). */
  loading?: boolean;
  /** 로딩이 8초를 넘으면 한 줄과 함께 보여 줄 다시 시도·로그아웃 */
  onRetry?: () => void;
  onSignOut?: () => void;
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
    {loading && <AuthLoading onRetry={onRetry} onSignOut={onSignOut} />}
    {children}
  </main>;
}

function AuthLoading({ onRetry, onSignOut }: { onRetry?: () => void; onSignOut?: () => void }) {
  const canEscape = Boolean(onRetry || onSignOut);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!canEscape) return;
    const timer = window.setTimeout(() => setSlow(true), LOADING_SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [canEscape]);
  return <div className="here-auth-welcome here-auth-loading">
    <div className="here-auth-welcomeBottom here-auth-retry">
      {slow ? <>
        <p role="status" className="here-auth-unavailable">연결이 느려요</p>
        {onRetry && <Button tone="ink" fullWidth onClick={onRetry}>다시 시도</Button>}
        {onSignOut && <Button variant="tonal" tone="ink" fullWidth onClick={onSignOut}>로그아웃</Button>}
      </> : <>
        <PawLoader size={18} gap={10} className="here-auth-paws" />
        <p role="status" className="sr-only">로그인 상태를 확인하고 있어요</p>
      </>}
    </div>
  </div>;
}
