"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ACCESSORIES, buildGarden, loadSeeds, unlockedAccessories, type AccessoryId } from "@/lib/garden";
import { type Profile, cleanName } from "@/lib/onboarding";
import { companionBackground } from "@/lib/companion-theme";
import { loadReport } from "@/lib/report";
import * as sfx from "@/lib/sound";
import type { CatExpression } from "@/lib/cat-expression";
import { ACTIVITY_CHANGED } from "@/lib/activity-outbox";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./art";
import AccessoryArt from "./AccessoryArt";
import Buddy, { type BuddyState } from "./Buddy";
import "./character-page.css";

// Framework7 강조색(목록 체크·지우기 버튼·기본 버튼)을 파랑 대신 고양이와 같은 검정으로 맞춘다.
const INK_THEME = { "--f7-theme-color": "var(--color-cat-ink)", "--f7-theme-color-rgb": "41, 41, 39" } as CSSProperties;

// 꾸미기 부위. 아이콘은 그 부위의 대표 아이템 그림을 쓴다.
const PARTS: { id: string; label: string; icon: AccessoryId; items: AccessoryId[] }[] = [
  { id: "head", label: "머리", icon: "hat", items: ["hat", "flowers", "crown"] },
  { id: "neck", label: "목", icon: "scarf", items: ["scarf"] },
  { id: "deco", label: "장식", icon: "sprout", items: ["sprout", "rainbow"] },
];

/** 캐릭터 페이지: 꾸미기와 고양이 이름을 언제든 다시 고른다(정원 장면 + 하단 서랍).
 * 메뉴에서 열면 오른쪽에서 밀려 들어오는 전체 페이지다. 바꾼 것은 뒤로 나갈 때 한 번에 저장하고,
 * 저장에 실패하면 페이지에 남아 오류를 보여 준다. 꾸미기·이름을 바꾸면 고양이가 눈웃음으로 반응한다(대화 내용과는 상관없다).
 * 2026-11-25 사용자 결정: 대화하기 버튼(뒤로 가면 바로 대화할 수 있다), 목소리 탭(음성은 서버가 정한 목소리 하나만 쓴다),
 * 배경 색 탭, 구름 정원 레벨 표기(정원 보류)는 뺐다. profile의 color·voice 값은 그대로 둔다. */
export default function Customize({ profile, onSave, onClose, onGarden, saving = false, error = "" }: {
  profile: Profile;
  onSave: (p: Profile) => Promise<boolean> | boolean;
  onClose: () => void;
  onGarden?: () => void;
  saving?: boolean;
  error?: string;
}) {
  const [draft, setDraft] = useState(profile);
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));
  // 구름 정원이 자라며 연 꾸미기 아이템. 이 기기의 정원 기록으로만 판단한다.
  const [garden, setGarden] = useState(() => buildGarden(loadReport(), loadSeeds()));
  useEffect(() => {
    const update = () => setGarden(buildGarden(loadReport(), loadSeeds()));
    window.addEventListener(ACTIVITY_CHANGED, update);
    return () => window.removeEventListener(ACTIVITY_CHANGED, update);
  }, []);
  const unlocked = useMemo(() => unlockedAccessories(garden), [garden]);
  const [part, setPart] = useState(PARTS[0].id);
  const [naming, setNaming] = useState<string | null>(null);
  const [phase, setPhase] = useState<"enter" | "in" | "leave">("enter");
  const pageRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // 반응: 잠깐 표정·자세를 바꿨다가 기본으로 돌아온다. n이 바뀌면 고양이가 한 번 톡 튄다.
  const [reaction, setReaction] = useState<{ state: BuddyState; expression: CatExpression; n: number }>({ state: "idle", expression: "neutral", n: 0 });
  const reactionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const react = (state: BuddyState, expression: CatExpression, ms: number) => {
    clearTimeout(reactionTimer.current);
    setReaction((r) => ({ state, expression, n: r.n + 1 }));
    reactionTimer.current = setTimeout(() => setReaction((r) => ({ ...r, state: "idle", expression: "neutral" })), ms);
  };
  useEffect(() => () => clearTimeout(reactionTimer.current), []);

  // 들어올 때: 다음 프레임에 오른쪽에서 밀려 들어오고, 뒤로 버튼에 포커스를 둔다.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPhase("in")); });
    backRef.current?.focus({ preventScroll: true });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);

  /** 바꾼 게 있으면 저장하고, 성공하면 오른쪽으로 빠지며 다음 화면으로 간다. */
  const leaving = useRef(false);
  const leave = async (then: () => void) => {
    if (leaving.current || saving) return;
    const next = { ...draft, companion: cleanName(draft.companion) };
    if (JSON.stringify(next) !== JSON.stringify(profile)) {
      const ok = await onSave(next);
      if (!ok) return;
    }
    leaving.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { then(); return; }
    setPhase("leave");
    setTimeout(then, 340);
  };
  const back = () => void leave(onClose);

  // Escape는 뒤로, Tab은 페이지 안에서만 돈다(홈은 뒤에 그대로 있다).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || naming !== null) return;
      if (event.key === "Escape") { event.preventDefault(); back(); return; }
      if (event.key !== "Tab") return;
      const items = Array.from(pageRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? []).filter((el) => el.offsetParent !== null);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !pageRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !pageRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const toggleAccessory = (id: AccessoryId, index: number) => {
    if (draft.accessory === id) { set({ accessory: undefined }); react("idle", "neutral", 0); return; }
    sfx.pick(index);
    set({ accessory: id });
    react("idle", "warm", 1400);
  };
  const activePart = PARTS.find((p) => p.id === part)!;
  const catState: BuddyState = reaction.state;

  return (
    <section
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-label="캐릭터 꾸미기"
      className="character-page"
      data-phase={phase}
      style={{ ...INK_THEME, backgroundColor: companionBackground(draft.color) }}
    >
      <header className="character-header">
        <Button ref={backRef} variant="tonal" tone="neutral" size="medium" onClick={back} aria-label="뒤로" aria-busy={saving} className="size-11 min-h-11 shrink-0 !p-0">
          <Icon name="back" size={20} />
        </Button>
        <h1 className="character-heading">캐릭터 꾸미기</h1>
      </header>

      <div className="character-scene">
        <div aria-hidden="true" className="character-island" />
        <div className="character-cat">
          <Buddy key={reaction.n} size={210} accessory={draft.accessory} className="motion-safe:animate-pop"
            state={catState} expression={reaction.expression} />
        </div>
        <button type="button" className="character-name" onClick={() => setNaming(draft.companion)} aria-label={`이름 ${draft.companion}, 바꾸기`}>
          {draft.companion}<Icon name="pencil" size={14} />
        </button>
        <div className="character-bar">
          {/* 구름 정원은 보류: 페이지를 떠나지 않고 '준비 중' 안내만 띄운다(onGarden). */}
          {onGarden && <button type="button" className="character-go" onClick={onGarden} disabled={saving}>정원 가꾸러 가기</button>}
        </div>
      </div>

      <div className="character-drawer here-list-compact">
        {error && <p role="alert" className="mb-3 rounded-r3 bg-[#FDECEA] px-3 py-2 text-t3 text-[#C42A23]">{error}</p>}

        <>
          <div className="character-parts" role="group" aria-label="꾸미기 부위">
            {PARTS.map((p) => (
              <button key={p.id} type="button" aria-pressed={part === p.id} aria-label={p.label} onClick={() => setPart(p.id)}>
                <AccessoryArt id={p.icon} size={32} />
              </button>
            ))}
          </div>
          <h2 className="character-title">{activePart.label}</h2>
          <div className="character-grid">
            {activePart.items.map((id) => {
              const item = ACCESSORIES.find((a) => a.id === id)!;
              const open = unlocked.has(id);
              const worn = draft.accessory === id;
              return (
                <button key={id} type="button" className="character-item" aria-pressed={worn} aria-disabled={!open}
                  aria-label={open ? `${item.label}${worn ? ", 착용 중. 누르면 벗어요" : ""}` : `${item.label}, 준비 중`}
                  onClick={() => { if (open) toggleAccessory(id, ACCESSORIES.indexOf(item)); }}>
                  <span aria-hidden="true" className="character-item-name">{item.label}</span>
                  <AccessoryArt id={id} size={56} />
                  <span aria-hidden="true" className="character-badge" data-kind={worn ? "worn" : open ? "open" : "locked"}>
                    {worn ? "착용 중" : open ? "입기" : <><Icon name="lock" size={11} />준비 중</>}
                  </span>
                </button>
              );
            })}
          </div>
          {ACCESSORIES.some((a) => !unlocked.has(a.id)) && <p className="character-hint">다른 꾸미기는 준비 중이에요.</p>}
        </>

      </div>

      {naming !== null && (
        <Dialog label="이름 바꾸기" onClose={() => setNaming(null)}>
          <form onSubmit={(event) => {
            event.preventDefault();
            set({ companion: cleanName(naming, draft.companion) });
            setNaming(null);
            react("idle", "warm", 1400);
          }}>
            <h2 className="text-t6 font-bold text-cat-ink">이름 바꾸기</h2>
            <TextField label="이름" hideLabel className="mt-4" value={naming} maxLength={10} autoComplete="off" data-dialog-initial-focus
              onChange={(event) => setNaming(event.target.value)} />
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="tonal" tone="neutral" size="medium" onClick={() => setNaming(null)}>취소</Button>
              <Button type="submit" size="medium">바꾸기</Button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
