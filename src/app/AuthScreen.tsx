import Image from "next/image";
import type { ReactNode } from "react";

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
        {welcome ? <video src="/auth/login-cat-bedroom.mp4" poster="/auth/login-cat-bedroom.png"
          autoPlay loop muted playsInline preload="auto" tabIndex={-1}
          className="here-auth-image absolute inset-0 size-full" />
          : <Image src="/auth/login-cat-bedroom.png" alt="" fill sizes="(max-width: 430px) 117vw, 501px" preload unoptimized
            className="here-auth-image" />}
      </div>
      <div className="here-auth-topShade" />
      <div className="here-auth-bottomShade" />
    </div>
    {children}
  </main>;
}
