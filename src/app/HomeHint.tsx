"use client";

/** 홈 첫 방문 안내. 마이크 버튼 바로 위에 붙은 작은 말풍선으로 한 번 보여 준다. 서비스 문장이라 고양이 말투를 쓰지 않는다.
 * 누르거나, 글·음성·메뉴를 열면 닫히고 다시 보이지 않는다(page.tsx). */
export default function HomeHint({ name, onDismiss }: { name: string; onDismiss: () => void }) {
  // 안내를 눌러 닫으면 안내가 가리키던 마이크 버튼으로 포커스를 옮긴다(키보드 사용자의 포커스가 사라지지 않게).
  function dismiss(event: React.MouseEvent<HTMLButtonElement>) {
    const mic = event.currentTarget.closest(".home-bottom")?.querySelector<HTMLElement>(".home-mic");
    onDismiss();
    mic?.focus({ preventScroll: true });
  }
  return <button type="button" className="home-hint" onClick={dismiss}>
    <b>{name}에게 말을 걸어 보세요</b>
    <span>마이크는 목소리로, 말풍선은 글로 이야기해요.</span>
    <span className="sr-only">누르면 안내를 닫아요.</span>
  </button>;
}
