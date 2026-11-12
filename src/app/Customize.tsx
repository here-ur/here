"use client";

import { TextField } from "./ui/TextField";
import { Button } from "./ui/Button";
import { useState } from "react";
import { ACCESSORIES, buildGarden, loadSeeds, unlockedAccessories } from "@/lib/garden";
import { VOICES, type Profile, cleanName } from "@/lib/onboarding";
import { COMPANION_BACKGROUNDS, companionBackground } from "@/lib/companion-theme";
import { loadReport } from "@/lib/report";
import * as sfx from "@/lib/sound";
import { Icon } from "./art";
import Buddy from "./Buddy";
import Sheet from "./Sheet";

/** 몽글이 바꾸기: 온보딩에서 고른 모습·빛·목소리·이름을 언제든 다시 고른다. 위에서 바로 미리 본다. */
export default function Customize({ profile, onSave, onClose, saving = false, error = "" }: { profile: Profile; onSave: (p: Profile) => void; onClose: () => void; saving?: boolean; error?: string }) {
  const [draft, setDraft] = useState(profile);
  // 구름 정원이 자라며 연 꾸미기 아이템. 이 기기의 정원 기록으로만 판단한다.
  const [unlocked] = useState(() => unlockedAccessories(buildGarden(loadReport(), loadSeeds())));
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));
  const chip = (on: boolean) =>
    `ui-press h-11 rounded-full px-4 text-t5 font-medium ${on ? "bg-cat-ink text-white" : "bg-cat-soft text-cat-ink"}`;

  return (
    <Sheet title={`${profile.companion} 바꾸기`} onClose={onClose} footer={
      <div>{error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <Button variant="plain" disabled={saving} onClick={() => onSave({ ...draft, companion: cleanName(draft.companion) })} className="ui-press h-14 w-full rounded-full bg-cat-ink text-t5 font-bold text-white disabled:opacity-50">
        {saving ? "저장 중…" : "이대로 할게요"}
      </Button></div>
    }>
      <div className="mt-3 flex justify-center rounded-r5 py-2" style={{ backgroundColor: companionBackground(draft.color) }}>
        <Buddy shape={draft.shape} color={draft.color} accessory={draft.accessory} size={140} look={[0, 0.25]} key={`${draft.shape}-${draft.color}-${draft.accessory ?? ""}`} className="motion-safe:animate-pop" />
      </div>

      <section className="mt-5">
        <h3 className="mb-2 text-t4 font-bold text-cat-ink">배경 색</h3>
        <div className="flex gap-3" role="radiogroup" aria-label="배경 색">
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

      <section className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-t4 font-bold text-cat-ink">꾸미기</h3>
          <span className="text-t2 tabular-nums text-cat-muted">{unlocked.size} / {ACCESSORIES.length} 열림</span>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="꾸미기">
          <Button variant="plain" role="radio" aria-checked={!draft.accessory} onClick={() => set({ accessory: undefined })} className={chip(!draft.accessory)}>없음</Button>
          {ACCESSORIES.map((a, i) => {
            const open = unlocked.has(a.id);
            return (
              <Button variant="plain"
                key={a.id}
                role="radio"
                aria-checked={draft.accessory === a.id}
                aria-disabled={!open}
                aria-label={open ? a.label : `${a.label}, 잠김. ${a.hint}`}
                onClick={() => { if (!open) return; sfx.pick(i); set({ accessory: a.id }); }}
                className={open ? chip(draft.accessory === a.id) : "h-11 cursor-not-allowed rounded-full border border-dashed border-cat-line px-4 text-t5 font-medium text-cat-muted"}
              >
                {open ? a.label : <span className="flex items-center gap-1"><Icon name="lock" size={14} />{a.label}</span>}
              </Button>
            );
          })}
        </div>
        <p className="mt-2 text-t3 text-pretty text-cat-muted">구름 정원이 자라면 하나씩 열려요. {ACCESSORIES.find((a) => !unlocked.has(a.id))?.hint ?? "모두 열었어요!"}</p>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-t4 font-bold text-cat-ink">목소리</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="목소리">
          {VOICES.map((v, i) => (
            <Button variant="plain"
              key={v.id}
              role="radio"
              aria-checked={draft.voice === v.id}
              aria-label={`${v.label}, ${v.desc}`}
              onClick={() => {
                sfx.pick(i);
                set({ voice: v.id });
              }}
              className={chip(draft.voice === v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-t3 text-pretty text-cat-muted">{VOICES.find((v) => v.id === draft.voice)?.desc} · 다음 대화부터 바뀌어요</p>
      </section>

      <section className="mt-5">
        <TextField
          id="companion-name"
          label="이름"
          value={draft.companion}
          onChange={(e) => set({ companion: e.target.value })}
          maxLength={10}
        />
      </section>
    </Sheet>
  );
}
