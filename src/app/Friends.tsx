"use client";

import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { useEffect, useRef, useState } from "react";
import { type Friend, inviteMessage, parseFriends, smsHref } from "@/lib/friends";
import { COLORS } from "@/lib/onboarding";
import { browserSupabase } from "@/lib/supabase";
import { Icon } from "./art";
import { Shell, type Who } from "./Conversation";

// 친구 화면: 초대로 이어진 친구 목록, 친구 초대하기(카톡·연락처·초대장), 친구가 되면 할 수 있는 것(준비 중 제안).
// 연락처는 서버에 올리지 않고, 고른 번호로 기기의 문자 앱만 연다.

type ContactPicker = { select: (props: string[], options?: { multiple?: boolean }) => Promise<{ tel?: string[] }[]> };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// 팀 결정 전 제안이라 모두 '준비 중'으로 둔다. 문구는 팀 확인용 초안이다.
const IDEAS = [
  { title: "서로의 하늘 나누기", body: "그날 하늘만 친구에게 보여요. 대화 내용은 보이지 않아요.", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></> },
  { title: "응원 한마디 보내기", body: "힘든 날, 친구에게 짧은 응원을 보내요.", icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /> },
  { title: "안부 알림 받기", body: "친구가 오랜만에 들르면 살짝 알려 줘요.", icon: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" /><path d="M10 20a2 2 0 0 0 4 0" /></> },
];

const joinedText = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 가입`;
};

export default function Friends({ who, onBack, preview = false }: { who: Who; onBack: () => void; preview?: boolean }) {
  const [friends, setFriends] = useState<Friend[] | null>(preview ? [] : null);
  const [loadError, setLoadError] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tint = COLORS.find((c) => c.id === who.color)?.light ?? "#EEE8FF";
  const deep = COLORS.find((c) => c.id === who.color)?.deep ?? "#6A55E6";

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void (async () => {
      const { data, error } = await browserSupabase()!.rpc("list_friends");
      if (!active) return;
      if (error) { setLoadError(true); setFriends([]); return; }
      setFriends(parseFriends(data));
    })();
    return () => { active = false; };
  }, [preview]);

  async function copyInviteLink(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("초대 링크를 복사했어요.");
      setShowInvite(false);
    } catch {
      setCopyFailed(true);
    }
  }

  function prepareInvite() {
    if (preview) { setNotice("미리보기에서는 초대장을 공유하지 않아요."); return null; }
    setNotice("");
    return location.origin;
  }

  async function inviteByKakao() {
    const next = prepareInvite();
    if (!next) return;
    const text = inviteMessage(next);
    // 휴대폰의 공유창에서 카카오톡을 고른다. 공유창이 없으면 메시지를 복사해 둔다.
    if (navigator.share) {
      try { await navigator.share({ title: "Here! 초대장", text }); } catch { /* 사용자가 공유를 닫았다 */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice("초대 메시지를 복사했어요. 카카오톡에 붙여 넣어 보내 주세요.");
    } catch { setNotice("이 기기에서는 공유할 수 없어요. 초대장 공유하기로 링크를 보내 주세요."); }
  }

  async function inviteByContact() {
    const next = prepareInvite();
    if (!next) return;
    const text = inviteMessage(next);
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const picker = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
    let phone = "";
    // 연락처 고르기를 지원하는 기기에서만 번호를 고른다. 고른 번호는 문자 앱으로만 넘기고 저장하지 않는다.
    if (picker?.select) {
      try { phone = (await picker.select(["tel"], { multiple: false }))[0]?.tel?.[0]?.replace(/[^\d+]/g, "") ?? ""; } catch { return; }
      if (!phone) return;
    }
    location.href = smsHref(text, phone, ios);
  }

  function openInviteCard() {
    const next = prepareInvite();
    if (next) { setInviteUrl(next); setCopyFailed(false); setShowInvite(true); }
  }

  const card = "here-card p-4";
  const inviteRow = "ui-press flex min-h-14 w-full items-center gap-3 rounded-r4 px-3 text-left hover:bg-[#F7F8FB] disabled:opacity-50";

  return (
    <Shell color={who.color} bloom="soft">
      <header className="here-navbar absolute inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex h-14 items-center justify-between px-gutter">
        <Button variant="plain" onClick={onBack} aria-label="처음 화면으로" className="ui-press grid size-12 place-items-center rounded-full bg-white/72 text-[#1F2A55] shadow-[0_2px_10px_rgba(28,38,80,.05)] backdrop-blur-md">
          <Icon name="back" size={22} />
        </Button>
        <h1 ref={headingRef} tabIndex={-1} className="text-t6 font-bold outline-none">친구</h1>
        <span className="size-12" />
      </header>

      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+80px)] bottom-0 overflow-y-auto px-gutter pb-10 motion-safe:[&>*]:animate-screen-in [&>*:nth-child(2)]:[animation-delay:50ms] [&>*:nth-child(3)]:[animation-delay:100ms]">
        <section className={card} aria-labelledby="friends-list">
          <div className="flex items-baseline justify-between">
            <h2 id="friends-list" className="text-t5 font-bold text-[#1F2A55]">친구 목록</h2>
            {friends && friends.length > 0 && <span className="text-t2 tabular-nums text-ios-secondary">{friends.length}명</span>}
          </div>
          {friends === null ? (
            <p role="status" className="mt-3 text-t3 text-ios-secondary">친구를 불러오는 중…</p>
          ) : friends.length ? (
            <ul className="mt-2 flex flex-col">
              {friends.map((friend, index) => (
                <li key={index} className="flex items-center gap-3 border-t border-[#F0F2F6] py-3 first:border-t-0">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full text-t4 font-bold" style={{ background: tint, color: deep }}>
                    {friend.name ? [...friend.name][0] : "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-t4 font-medium text-[#1F2A55]">{friend.name ?? "이름을 정하지 않은 친구"}</span>
                    <span className="text-t2 text-ios-secondary">{friend.relation === "invited_by_me" ? "내가 초대한 친구" : "나를 초대한 친구"} · {joinedText(friend.joinedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-t3 text-pretty text-ios-secondary">{loadError ? "친구 목록을 불러오지 못했어요." : "아직 연결된 친구가 없어요."}</p>
          )}
          <p className="mt-3 text-t2 text-[#8A91A3]">친구에게는 내 닉네임과 가입일만 보여요. 대화·기억·리포트는 보이지 않아요.</p>
        </section>

        <section className={`${card} mt-4`} aria-labelledby="friends-invite">
          <h2 id="friends-invite" className="text-t5 font-bold text-[#1F2A55]">친구 초대하기</h2>
          <p className="mt-2 text-t2 text-ios-secondary">친구에게 Here 가입 링크를 보내요. 링크로 가입해도 친구 목록에 자동 추가되지는 않아요.</p>
          <div className="mt-2 flex flex-col">
            <Button variant="plain" onClick={() => { void inviteByKakao(); }} className={inviteRow}>
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#FEE500] text-[#191600]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 6l-1 3.6c-.1.3.3.6.6.4l4.3-2.9H12c5 0 9-3.1 9-7S17 4 12 4Z" /></svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-t4 font-medium text-[#1F2A55]">카카오톡으로 초대</span>
                <span className="text-t2 text-ios-secondary">공유창에서 카카오톡을 골라 보내요</span>
              </span>
            </Button>
            <Button variant="plain" onClick={() => { void inviteByContact(); }} className={inviteRow}>
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#E6F4EC] text-[#1E7A46]">
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5" /></svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-t4 font-medium text-[#1F2A55]">연락처로 초대</span>
                <span className="text-t2 text-ios-secondary">문자로 초대 메시지를 보내요 · 연락처는 저장하지 않아요</span>
              </span>
            </Button>
            <Button variant="plain" onClick={openInviteCard} className={inviteRow}>
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EEF2FF] text-[#1E4FE0]">
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-t4 font-medium text-[#1F2A55]">초대장 공유하기</span>
                <span className="text-t2 text-ios-secondary">가입 링크를 직접 보여 주거나 복사해요</span>
              </span>
            </Button>
          </div>
          {notice && <p role="status" className="mt-2 text-t2 text-pretty text-[#3D4559]">{notice}</p>}
        </section>

        <section className={`${card} mt-4`} aria-labelledby="friends-ideas">
          <h2 id="friends-ideas" className="text-t5 font-bold text-[#1F2A55]">Here!에서 친구가 되면</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {IDEAS.map((idea) => (
              <li key={idea.title} className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-r3 bg-[#F4F6FB] text-[#3D4559]">
                  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>{idea.icon}</svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-t4 font-medium text-[#1F2A55]">{idea.title}<span className="rounded-full bg-ios-group px-2 py-0.5 text-t1 font-normal text-[#8A91A3]">준비 중</span></span>
                  <span className="text-t2 text-pretty text-ios-secondary">{idea.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {showInvite && inviteUrl && (
        <Dialog label="초대장" onClose={() => { setShowInvite(false); setCopyFailed(false); }}>
          <h2 className="text-t7 font-bold">초대장</h2>
          <p className="mt-2 text-t3 text-ios-secondary">이 링크에서 휴대폰 번호로 가입할 수 있어요.</p>
          <p className="mt-6 break-all rounded-r4 bg-ios-group px-4 py-5 text-center text-t4 font-bold select-all">{inviteUrl}</p>
          {copyFailed && <p role="alert" className="mt-3 text-t3 text-ios-secondary">자동으로 복사할 수 없어요. 위 링크를 직접 선택해 복사해 주세요.</p>}
          <div className="mt-6 flex gap-3">
            <Button onClick={() => { setShowInvite(false); setCopyFailed(false); }} tone="neutral" variant="tonal" className="flex-1">닫기</Button>
            <Button onClick={() => { void copyInviteLink(inviteUrl); }} className="flex-1">링크 복사</Button>
          </div>
        </Dialog>
      )}
    </Shell>
  );
}
