"use client";

import { useState } from "react";
import { COLORS, SHAPES, VOICES, type Profile, accentButton, cleanName } from "@/lib/onboarding";
import * as sfx from "@/lib/sound";
import Buddy from "./Buddy";
import Sheet from "./Sheet";

/** 몽글이 바꾸기: 온보딩에서 고른 모습·빛·목소리·이름을 언제든 다시 고른다. 위에서 바로 미리 본다. */
export default function Customize({ profile, onSave, onClose }: { profile: Profile; onSave: (p: Profile) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(profile);
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));
  const chip = (on: boolean) =>
    `h-11 rounded-full px-4 text-[15px] font-semibold transition ${on ? "bg-[#1F2A55] text-white" : "bg-[#F2F4F8] text-[#1F2A55]"}`;

  return (
    <Sheet title={`${profile.companion} 바꾸기`} onClose={onClose}>
      <div className="flex justify-center py-2">
        <Buddy shape={draft.shape} color={draft.color} size={140} look={[0, 0.25]} key={`${draft.shape}-${draft.color}`} className="animate-pop" />
      </div>

      <section className="mt-2">
        <h3 className="mb-2 text-sm font-semibold text-[#3D4559]">모습</h3>
        <div className="flex gap-2" role="radiogroup" aria-label="모습">
          {SHAPES.map((x, i) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={draft.shape === x.id}
              onClick={() => {
                sfx.pick(i);
                set({ shape: x.id });
              }}
              className={chip(draft.shape === x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-[#3D4559]">빛</h3>
        <div className="flex gap-3" role="radiogroup" aria-label="빛">
          {COLORS.map((c, i) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={draft.color === c.id}
              aria-label={c.label}
              onClick={() => {
                sfx.pick(i);
                set({ color: c.id });
              }}
              className={`size-11 rounded-full p-1 ring-offset-2 transition ${draft.color === c.id ? "ring-2 ring-[#1F2A55]" : ""}`}
            >
              <span className="block size-full rounded-full" style={{ background: `linear-gradient(160deg, ${c.light}, ${c.base} 70%, ${c.blob1})` }} />
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-[#3D4559]">목소리</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="목소리">
          {VOICES.map((v, i) => (
            <button
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
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-[#5A6478]">{VOICES.find((v) => v.id === draft.voice)?.desc} · 다음 대화부터 바뀌어요</p>
      </section>

      <section className="mt-5">
        <label htmlFor="companion-name" className="mb-2 block text-sm font-semibold text-[#3D4559]">
          이름
        </label>
        <input
          id="companion-name"
          value={draft.companion}
          onChange={(e) => set({ companion: e.target.value })}
          maxLength={10}
          className="h-12 w-full rounded-2xl bg-[#F2F4F8] px-4 text-base font-semibold text-[#111318] outline-0 focus:ring-2 focus:ring-[#1F2A55]/30"
        />
      </section>

      <button
        onClick={() => onSave({ ...draft, companion: cleanName(draft.companion) })}
        style={accentButton(draft.color)}
        className="mt-6 h-14 w-full rounded-full text-[15px] font-bold text-white"
      >
        이대로 할게요
      </button>
    </Sheet>
  );
}
