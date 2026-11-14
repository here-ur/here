"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { ACCESSORIES, buildGarden, loadSeeds, unlockedAccessories, type AccessoryId } from "@/lib/garden";
import { VOICES, type Profile, cleanName } from "@/lib/onboarding";
import { COMPANION_BACKGROUNDS, companionBackground } from "@/lib/companion-theme";
import { loadReport } from "@/lib/report";
import * as sfx from "@/lib/sound";
import type { CatExpression } from "@/lib/cat-expression";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./art";
import AccessoryArt from "./AccessoryArt";
import Buddy, { type BuddyState } from "./Buddy";
import { useVoicePreview } from "./use-voice-preview";
import "./character-page.css";

// Framework7 강조색(목록 체크·지우기 버튼·기본 버튼)을 파랑 대신 고양이와 같은 검정으로 맞춘다.
const INK_THEME = { "--f7-theme-color": "var(--color-cat-ink)", "--f7-theme-color-rgb": "41, 41, 39" } as CSSProperties;

type Tab = "accessory" | "background" | "voice";
const TABS: { id: Tab; label: string; icon: "sparkles" | "paintbrush" | "soundOn" }[] = [
  { id: "accessory", label: "꾸미기", icon: "sparkles" },
  { id: "background", label: "배경", icon: "paintbrush" },
  { id: "voice", label: "목소리", icon: "soundOn" },
];
// 꾸미기 부위. 아이콘은 그 부위의 대표 아이템 그림을 쓴다.
const PARTS: { id: string; label: string; icon: AccessoryId; items: AccessoryId[] }[] = [
  { id: "head", label: "머리", icon: "hat", items: ["hat", "flowers", "crown"] },
  { id: "neck", label: "목", icon: "scarf", items: ["scarf"] },
  { id: "deco", label: "장식", icon: "sprout", items: ["sprout", "rainbow"] },
];

/** 캐릭터 페이지: 온보딩에서 고른 꾸미기·배경·목소리·이름을 언제든 다시 고른다(B안: 정원 장면 + 하단 서랍).
 * 메뉴에서 열면 오른쪽에서 밀려 들어오는 전체 페이지다. 바꾼 것은 나갈 때(뒤로·대화하기·정원 가기) 한 번에 저장하고,
 * 저장에 실패하면 페이지에 남아 오류를 보여 준다. 무언가 바꿀 때마다 호야가 반응한다: 배경은 고개를 들고, 꾸미기는 눈웃음,
 * 목소리는 미리듣기에 맞춰 말하고, 이름을 바꾸면 눈웃음. 모두 고른 항목으로만 움직이고 대화 내용과는 상관없다. */
export default function Customize({ profile, onSave, onClose, onChat, onGarden, saving = false, error = "" }: {
  profile: Profile;
  onSave: (p: Profile) => Promise<boolean> | boolean;
  onClose: () => void;
  onChat?: () => void;
  onGarden?: () => void;
  saving?: boolean;
  error?: string;
}) {
  const [draft, setDraft] = useState(profile);
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));
  // 구름 정원이 자라며 연 꾸미기 아이템. 이 기기의 정원 기록으로만 판단한다.
  const [garden] = useState(() => buildGarden(loadReport(), loadSeeds()));
  const unlocked = useMemo(() => unlockedAccessories(garden), [garden]);
  const [tab, setTab] = useState<Tab>("accessory");
  const [part, setPart] = useState(PARTS[0].id);
  const [naming, setNaming] = useState<string | null>(null);
  const [phase, setPhase] = useState<"enter" | "in" | "leave">("enter");
  const voice = useVoicePreview();
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
    voice.stop();
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

  const pickVoice = (id: Profile["voice"]) => {
    set({ voice: id });
    react("idle", "neutral", 0);
    void voice.play(id);
  };
  const toggleAccessory = (id: AccessoryId, index: number) => {
    if (draft.accessory === id) { set({ accessory: undefined }); react("idle", "neutral", 0); return; }
    sfx.pick(index);
    set({ accessory: id });
    react("idle", "warm", 1400);
  };
  const lockLabel = (id: AccessoryId) => {
    const unlock = ACCESSORIES.find((a) => a.id === id)!.unlock;
    return unlock.level ? `Lv.${unlock.level}` : `도감 ${unlock.collected}`;
  };
  const activePart = PARTS.find((p) => p.id === part)!;
  const catState: BuddyState = voice.playing ? "speaking" : reaction.state;

  return (
    <section
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-label="캐릭터"
      className="character-page"
      data-phase={phase}
      style={{ ...INK_THEME, backgroundColor: companionBackground(draft.color) }}
    >
      <header className="character-header">
        <Button ref={backRef} variant="tonal" tone="neutral" size="medium" onClick={back} aria-label="뒤로" aria-busy={saving} className="size-11 min-h-11 shrink-0 !p-0">
          <Icon name="back" size={20} />
        </Button>
        <div role="tablist" aria-label="바꿀 것" className="character-tabs character-glass">
          <span aria-hidden="true" className="character-bubble">{TABS.find((t) => t.id === tab)!.label}</span>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`character-tab-${t.id}`} aria-controls="character-panel" aria-selected={tab === t.id} aria-label={t.label} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={20} />
            </button>
          ))}
        </div>
        <Button size="medium" onClick={() => void leave(onChat ?? onClose)} disabled={saving} className="character-talk w-auto shrink-0">대화하기</Button>
      </header>

      <div className="character-scene">
        <div aria-hidden="true" className="character-island" />
        <div className="character-cat">
          <Buddy key={reaction.n} size={210} accessory={draft.accessory} className="motion-safe:animate-pop"
            state={catState} expression={voice.playing ? "neutral" : reaction.expression} outputLevel={voice.level} outputShape={voice.shape} />
        </div>
        <button type="button" className="character-name" onClick={() => { voice.stop(); setNaming(draft.companion); }} aria-label={`이름 ${draft.companion}, 바꾸기`}>
          {draft.companion}<Icon name="pencil" size={14} />
        </button>
        <div className="character-bar">
          <span className="character-chip"><AccessoryArt id="sprout" size={24} />구름 정원 Lv.{garden.level.level}</span>
          {onGarden && <button type="button" className="character-go" onClick={() => void leave(onGarden)} disabled={saving}>정원 가꾸러 가기</button>}
        </div>
      </div>

      <div id="character-panel" role="tabpanel" aria-labelledby={`character-tab-${tab}`} className="character-drawer here-list-compact">
        {error && <p role="alert" className="mb-3 rounded-r3 bg-[#FDECEA] px-3 py-2 text-t3 text-[#C42A23]">{error}</p>}

        {tab === "accessory" && <>
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
                  aria-label={open ? `${item.label}${worn ? ", 착용 중. 누르면 벗어요" : ""}` : `${item.label}, 잠김. ${item.hint}`}
                  onClick={() => { if (open) toggleAccessory(id, ACCESSORIES.indexOf(item)); }}>
                  <span aria-hidden="true" className="character-item-name">{item.label}</span>
                  <AccessoryArt id={id} size={56} />
                  <span aria-hidden="true" className="character-badge" data-kind={worn ? "worn" : open ? "open" : "locked"}>
                    {worn ? "착용 중" : open ? "입기" : <><Icon name="lock" size={11} />{lockLabel(id)}</>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="character-hint">구름 정원이 자라면 하나씩 열려요. {ACCESSORIES.find((a) => !unlocked.has(a.id))?.hint ?? "모두 열었어요!"}</p>
        </>}

        {tab === "background" && <>
          <h2 className="character-title">배경</h2>
          <div className="character-swatches" role="radiogroup" aria-label="배경 색">
            {COMPANION_BACKGROUNDS.map((c, i) => (
              <button key={c.id} type="button" role="radio" aria-checked={draft.color === c.id} onClick={() => { sfx.pick(i); set({ color: c.id }); react("attentive", "neutral", 900); }}>
                <span style={{ background: c.surface }} />{c.label}
              </button>
            ))}
          </div>
        </>}

        {tab === "voice" && <>
          <h2 className="character-title">목소리</h2>
          <List strong inset dividersIos className="mx-0 my-0">
            {VOICES.map((v) => (
              <ListItem
                key={v.id}
                radio
                radioIcon="end"
                name="companion-voice"
                value={v.id}
                title={v.label}
                footer={v.desc}
                checked={draft.voice === v.id}
                // 고르면 그 목소리로 한 문장을 들려준다. 이미 고른 목소리를 다시 누르면 다시 들려준다.
                onChange={() => pickVoice(v.id)}
                onClick={() => { if (draft.voice === v.id) void voice.play(v.id); }}
              />
            ))}
          </List>
          <p className="character-hint">고르면 한 문장 들려줘요 · 다음 대화부터 바뀌어요</p>
        </>}
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
