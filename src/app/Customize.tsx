"use client";

import { Button } from "./ui/Button";
import { useState, type CSSProperties } from "react";
import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import ListInput from "framework7-react/components/list-input.js";
import { ACCESSORIES, buildGarden, loadSeeds, unlockedAccessories } from "@/lib/garden";
import { VOICES, type Profile, cleanName } from "@/lib/onboarding";
import { COMPANION_BACKGROUNDS, companionBackground } from "@/lib/companion-theme";
import { loadReport } from "@/lib/report";
import * as sfx from "@/lib/sound";
import { Icon } from "./art";
import Buddy from "./Buddy";
import Sheet from "./Sheet";

// 시트 안의 Framework7 강조색(목록 체크·지우기 버튼)을 파랑 대신 몽글이와 같은 검정 계열로 맞춘다.
const INK_THEME = { "--f7-theme-color": "var(--color-cat-ink)", "--f7-theme-color-rgb": "41, 41, 39" } as CSSProperties;

function SectionTitle({ children, trailing, htmlFor }: { children: React.ReactNode; trailing?: React.ReactNode; htmlFor?: string }) {
  const className = "text-t3 font-semibold text-cat-muted";
  return (
    <div className="mb-1.5 flex items-baseline justify-between px-4">
      {htmlFor ? <label htmlFor={htmlFor} className={className}>{children}</label> : <h3 className={className}>{children}</h3>}
      {trailing}
    </div>
  );
}

/** 몽글이 바꾸기: 온보딩에서 고른 빛·꾸미기·목소리·이름을 언제든 다시 고른다. 위에서 바로 미리 본다.
 * Framework7 iOS 모양: 꾸미기는 칩, 목소리는 체크 목록, 이름은 입력 목록, 저장은 꽉 찬 버튼. */
export default function Customize({ profile, onSave, onClose, saving = false, error = "" }: { profile: Profile; onSave: (p: Profile) => void; onClose: () => void; saving?: boolean; error?: string }) {
  const [draft, setDraft] = useState(profile);
  // 구름 정원이 자라며 연 꾸미기 아이템. 이 기기의 정원 기록으로만 판단한다.
  const [unlocked] = useState(() => unlockedAccessories(buildGarden(loadReport(), loadSeeds())));
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));
  // Framework7 칩 모양. Tailwind 기본 스타일(base 레이어)이 Framework7 레이어보다 뒤라서,
  // 일반 <button>에서는 모서리·테두리·배경이 지워진다. 그래서 모양을 유틸리티로 다시 적어 준다.
  const chipBase = "chip ui-press inline-flex h-9 w-auto items-center rounded-full border px-3.5";
  const chip = (on: boolean) => `${chipBase} ${on ? "border-cat-ink bg-cat-ink text-white" : "border-cat-line bg-white/70 text-cat-ink"}`;

  return (
    <Sheet title={`${profile.companion} 바꾸기`} onClose={onClose} footer={
      <div style={INK_THEME}>
        {error && <p role="alert" className="mb-3 text-t3 text-[#C42A23]">{error}</p>}
        <Button fullWidth tone="neutral" loading={saving} onClick={() => onSave({ ...draft, companion: cleanName(draft.companion) })}>
          이대로 할게요
        </Button>
      </div>
    }>
      <div style={INK_THEME} className="here-list-compact">
        <div className="mt-3 flex justify-center rounded-r5 py-2" style={{ backgroundColor: companionBackground(draft.color) }}>
          <Buddy shape={draft.shape} color={draft.color} accessory={draft.accessory} size={140} look={[0, 0.25]} key={`${draft.shape}-${draft.color}-${draft.accessory ?? ""}`} className="motion-safe:animate-pop" />
        </div>

        <section className="mt-6">
          <SectionTitle>배경 색</SectionTitle>
          <div className="flex gap-3 px-4" role="radiogroup" aria-label="배경 색">
            {COMPANION_BACKGROUNDS.map((c, i) => (
              <Button variant="plain"
                key={c.id}
                role="radio"
                aria-checked={draft.color === c.id}
                aria-label={c.label}
                onClick={() => {
                  sfx.pick(i);
                  set({ color: c.id });
                }}
                className={`ui-press size-11 rounded-full p-1 ring-offset-2 ${draft.color === c.id ? "ring-2 ring-cat-ink" : ""}`}
              >
                <span className="block size-full rounded-full border border-cat-line" style={{ background: c.surface }} />
              </Button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <SectionTitle trailing={<span className="text-t2 tabular-nums text-cat-muted">{unlocked.size} / {ACCESSORIES.length} 열림</span>}>꾸미기</SectionTitle>
          <div className="flex flex-wrap gap-2 px-4" role="radiogroup" aria-label="꾸미기">
            <button type="button" role="radio" aria-checked={!draft.accessory} onClick={() => set({ accessory: undefined })} className={chip(!draft.accessory)}>
              <span className="chip-label">없음</span>
            </button>
            {ACCESSORIES.map((a, i) => {
              const open = unlocked.has(a.id);
              return (
                <button
                  type="button"
                  key={a.id}
                  role="radio"
                  aria-checked={draft.accessory === a.id}
                  aria-disabled={!open}
                  aria-label={open ? a.label : `${a.label}, 잠김. ${a.hint}`}
                  onClick={() => { if (!open) return; sfx.pick(i); set({ accessory: a.id }); }}
                  className={open ? chip(draft.accessory === a.id) : `${chipBase} cursor-not-allowed border-dashed border-cat-line text-cat-muted`}
                >
                  {!open && <Icon name="lock" size={14} />}
                  <span className={`chip-label ${open ? "" : "ml-1"}`}>{a.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-4 text-t2 text-pretty text-cat-muted">구름 정원이 자라면 하나씩 열려요. {ACCESSORIES.find((a) => !unlocked.has(a.id))?.hint ?? "모두 열었어요!"}</p>
        </section>

        <section className="mt-6">
          <SectionTitle>목소리</SectionTitle>
          <List strong inset dividersIos className="mx-0 my-0">
            {VOICES.map((v, i) => (
              <ListItem
                key={v.id}
                radio
                radioIcon="end"
                name="companion-voice"
                value={v.id}
                title={v.label}
                footer={v.desc}
                checked={draft.voice === v.id}
                onChange={() => {
                  sfx.pick(i);
                  set({ voice: v.id });
                }}
              />
            ))}
          </List>
          <p className="mt-2 px-4 text-t2 text-cat-muted">다음 대화부터 바뀌어요</p>
        </section>

        <section className="mt-6">
          <SectionTitle htmlFor="companion-name">이름</SectionTitle>
          <List strong inset className="mx-0 my-0">
            <ListInput
              inputId="companion-name"
              type="text"
              placeholder="이름"
              value={draft.companion}
              maxlength={10}
              clearButton
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ companion: e.target.value })}
            />
          </List>
        </section>
      </div>
    </Sheet>
  );
}
