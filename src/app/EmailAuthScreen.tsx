"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui/Button";
import { Icon } from "./art";
import "./email-auth.css";

/** 한 화면에 한 단계. 실제 키보드가 차지한 높이에 맞춰 하단 버튼도 올라온다. */
export default function EmailAuthScreen({ title, description, onBack, busy, progress, children }: {
  title: ReactNode; description?: ReactNode; onBack: () => void; busy: boolean;
  progress?: number; children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (viewport.scale !== 1) return;
      frame.current?.style.setProperty("--email-auth-height", `${viewport.height}px`);
      frame.current?.toggleAttribute("data-keyboard", window.innerHeight - viewport.height > 80);
    };
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  return <main ref={frame} className="app-frame email-auth-screen">
    <header className="email-auth-topbar">
      <Button variant="plain" className="email-auth-back" onClick={onBack} disabled={busy} aria-label="뒤로"><Icon name="back" size={24} /></Button>
      {progress && <span className="email-auth-progress" aria-label={`가입 ${progress}/3단계`}>{progress}<span aria-hidden="true"> / 3</span></span>}
    </header>
    <div className="email-auth-heading">
      <h1>{title}</h1>
      {description && <p id="auth-desc">{description}</p>}
    </div>
    {children}
  </main>;
}
