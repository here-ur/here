"use client";

import { Button } from "./ui/Button";
import { Badge } from "./ui/Controls";
import { Dialog } from "./ui/Dialog";

/** 아직 열지 않은 화면을 눌렀을 때 띄우는 '준비 중' 안내. 화면 코드는 그대로 두고 들어가는 길만 막는다. */
export default function ComingSoon({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <Dialog label={title} onClose={onClose} urgent>
      <Badge>준비 중</Badge>
      <h2 id="coming-soon-title" className="mt-3 text-t6 font-bold">{title}</h2>
      <p id="coming-soon-body" className="mt-2 text-t3 text-pretty text-ios-secondary">{body}</p>
      <p className="mt-4 rounded-r3 bg-[#FFF3F2] px-3.5 py-3 text-t2 text-pretty text-[#55525F]">
        지금 많이 힘들다면 <a href="tel:109" className="font-bold text-[#C42A23] underline underline-offset-2">109</a>에서 24시간 사람과 이야기할 수 있어요.
      </p>
      <Button onClick={onClose} data-dialog-initial-focus tone="neutral" fullWidth className="mt-5">확인</Button>
    </Dialog>
  );
}
