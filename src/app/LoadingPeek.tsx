/** 홈 위에서 가볍게 기다릴 때(로딩 화면 시안 H · 빼꼼, 팀 확인 전). 화면을 바꾸지 않고, 아래 버튼 줄 위 가운데 작은 알약 뒤에서
 * 고양이가 앞발을 걸치고 고개만 내민다. 알약 안에서는 발자국이 깜박인다. 7.2초에 한 번 숨었다가 앞발로 짚고 다시 올라온다.
 * 지금 앱에는 홈 위에서 기다리는 곳이 없어 /dev/loading에서만 쓴다. 쓸 때는 이 동안 홈 고양이의 쉬는 반응(갸웃·발 핥기·잠)을 멈춘다. */
import { PawLoader } from "./ui/PawLoader";
import "./loading-peek.css";

export default function LoadingPeek({ label }: { label: string }) {
  return (
    <>
      <div className="loading-peek" aria-hidden="true">
        <div className="loading-peek__win">
          <div className="loading-peek__head">
            {/* eslint-disable-next-line @next/next/no-img-element -- 홈 고양이 그림을 같은 배율로 잘라 쓴다 */}
            <img className="loading-peek__base" src="/home/main-cat.png" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="loading-peek__round" src="/characters/motion/round.webp" alt="" />
          </div>
        </div>
        <div className="loading-peek__pill"><PawLoader size={12} gap={12} /></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="loading-peek__paw" data-side="l"><img src="/home/main-cat.png" alt="" /></span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="loading-peek__paw" data-side="r"><img src="/home/main-cat.png" alt="" /></span>
      </div>
      <p role="status" className="sr-only">{label}</p>
    </>
  );
}
