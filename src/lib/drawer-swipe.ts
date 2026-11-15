// 메뉴(Drawer)를 왼쪽으로 밀어 닫기: 언제 밀기로 보고 언제 닫을지만 정하는 순수 함수. 패널을 움직이는 일은 Drawer.tsx가 한다.

/** 옆으로 이만큼(px) 넘게 밀어야 패널이 손가락을 따라오기 시작한다. 세로로 이만큼 넘게 먼저 움직이면 목록 스크롤로 둔다. */
export const SWIPE_START_PX = 10;
/** 패널 너비의 이 비율보다 많이 밀고 놓으면 닫는다. */
export const SWIPE_CLOSE_RATIO = 0.3;
/** 이보다 빠르게(px/ms, 왼쪽이 음수) 튕기면 조금만 밀어도 닫는다. */
export const SWIPE_FLICK_SPEED = -0.5;
/** 밀어 닫은 뒤 패널이 끝까지 미끄러져 나가는 시간(ms). 패널의 transition-duration(300ms)보다 조금 길다. */
export const SWIPE_SETTLE_MS = 320;
/** 여기서 시작한 끌기는 밀어 닫기로 보지 않는다(설정의 비밀번호 입력칸 등에서 글자를 고르느라 옆으로 끄는 경우). */
export const SWIPE_IGNORE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export type SwipeStart = "wait" | "scroll" | "drag";

/** 누른 자리에서 움직인 거리(dx·dy, px)로 정한다. 세로로 더 많이 움직였으면 "scroll"(밀기 취소),
 * 왼쪽으로 SWIPE_START_PX 이상 밀었으면 "drag"(패널이 따라옴), 아직 애매하면 "wait". 오른쪽으로 밀면 아무 일도 하지 않는다. */
export function swipeStart(dx: number, dy: number): SwipeStart {
  if (Math.abs(dy) > SWIPE_START_PX && Math.abs(dy) > Math.abs(dx)) return "scroll";
  return dx > -SWIPE_START_PX ? "wait" : "drag";
}

/** 패널이 따라갈 거리. 열린 자리보다 오른쪽으로는 나가지 않는다. */
export function swipeOffset(dx: number) {
  return Math.min(0, dx);
}

/** 손을 뗐을 때 닫을지. 너비의 30%보다 많이 밀었거나 왼쪽으로 빠르게 튕겼으면 닫는다.
 * 브라우저가 끌기를 취소했으면(pointercancel) 닫지 않고 제자리로 돌린다. elapsedMs는 누른 뒤 지난 시간이다. */
export function swipeCloses(offset: number, elapsedMs: number, width: number, cancelled = false) {
  if (cancelled || offset >= 0) return false;
  return offset < -width * SWIPE_CLOSE_RATIO || offset / Math.max(1, elapsedMs) < SWIPE_FLICK_SPEED;
}
