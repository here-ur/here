"use client";

import { flushSync } from "react-dom";
import "./page-move.css";

/** 화면 넘김 종류. enter: 로그인·가입 또는 기억 동의 시트를 마치고 다음 화면(캐릭터 만나기·홈)으로. */
export type PageMove = "enter";

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { updateCallbackDone: Promise<void>; finished: Promise<void> } };

/** 화면 바꾸기를 브라우저의 화면 전환(View Transitions)으로 감싼다. 지원하지 않거나 동작 줄이기면 바로 바꾼다.
 * 반환값은 새 화면이 그려진 뒤에 끝나므로, 그다음에 바꿀 상태(버튼 로딩 끄기 등)는 await 뒤에 둔다. */
export async function movePage(kind: PageMove, update: () => void): Promise<void> {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.pageMove = kind;
  let transition;
  try {
    transition = doc.startViewTransition(() => flushSync(update));
  } catch {
    delete root.dataset.pageMove;
    update();
    return;
  }
  void transition.finished.catch(() => {}).finally(() => { if (root.dataset.pageMove === kind) delete root.dataset.pageMove; });
  await transition.updateCallbackDone.catch(() => {});
}
