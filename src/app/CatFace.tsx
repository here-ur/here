import { useAudioMouth } from "./use-audio-mouth";
import { useId, type RefObject } from "react";
import type { BuddyState, Look, Mouth } from "./Buddy";
import type { CatExpression } from "@/lib/cat-expression";

/** Original silhouette + a small generated clean-face patch + independent SVG eyes/mouth. */
export default function CatFace({ state, expression, look, mouth, outputLevel }: {
  state: BuddyState; expression: CatExpression; look?: Look; mouth?: Mouth; outputLevel?: RefObject<number>;
}) {
  const id = `cat-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { mouth: openMouthRef, rest: closedMouthRef } = useAudioMouth(state === "speaking", outputLevel);
  const attentive = state === "attentive" || state === "listening";
  const eye = expression === "warm"
    ? "M-103 10 Q0-6 103 10 C95 75-95 75-103 10Z"
    : attentive ? "M-103-8 Q0-21 103-8 C104 93-104 93-103-8Z"
      : "M-103 0 H103 C100 94-100 94-103 0Z";
  const mouthLine = expression === "warm" || mouth === "smile" ? "M-31 0 Q0 24 31-2"
    : expression === "gentle" ? "M-27 6 Q0-4 27 6" : "M-28 0 Q0 7 28-2";
  const gaze = look ? `translate(${Math.max(-1, Math.min(1, look[0])) * 25}px, ${Math.max(-1, Math.min(1, look[1])) * 12}px)` : undefined;
  return <svg x="20" y="32" width="200" height="184" viewBox="280 100 970 890" overflow="visible">
    <defs>
      <linearGradient id={`${id}-iris`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#F18B18" /><stop offset=".45" stopColor="#FFBA3F" /><stop offset="1" stopColor="#FFE175" /></linearGradient>
      
      <linearGradient id={`${id}-upper`} gradientUnits="userSpaceOnUse" x1="0" y1="530" x2="0" y2="620"><stop stopColor="white" /><stop offset="1" stopColor="black" /></linearGradient>
      <mask id={`${id}-body`} maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect y="500" width="1536" height="524" fill="white" /><rect x="420" y="875" width="300" height="149" fill="black" /><rect x="875" y="875" width="300" height="149" fill="black" /></mask>
      <mask id={`${id}-head`} maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect width="1536" height="1024" fill={`url(#${id}-upper)`} /></mask>
      <filter id={`${id}-feather`} x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="12" /></filter>
      <mask id={`${id}-patch`} maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect x="505" y="315" width="570" height="180" rx="30" fill="white" filter={`url(#${id}-feather)`} /></mask>
      <clipPath id={`${id}-foot-left`}><rect x="420" y="850" width="300" height="174" /></clipPath>
      <clipPath id={`${id}-foot-right`}><rect x="875" y="850" width="300" height="174" /></clipPath>
      <clipPath id={`${id}-eye`}><path d={eye} /></clipPath>
    </defs>
    <g className="cat-foot-left"><image href="/characters/black-cat.png" width="1536" height="1024" clipPath={`url(#${id}-foot-left)`} /></g>
    <g className="cat-foot-right"><image href="/characters/black-cat.png" width="1536" height="1024" clipPath={`url(#${id}-foot-right)`} /></g>
    <image className="cat-body-fixed" href="/characters/black-cat.png" width="1536" height="1024" mask={`url(#${id}-body)`} />
    <g className="cat-head-pose">
      <g className="cat-head-idle">
        <g className="cat-head-response">
          <g mask={`url(#${id}-head)`}>
            <image href="/characters/black-cat.png" width="1536" height="1024" />
            <image href="/characters/black-cat-face-base.png" width="1536" height="1024" mask={`url(#${id}-patch)`} />
          </g>
          <g className="cat-face-turn">
            {[654, 925].map((x, index) => <g key={x} transform={`translate(${x} 364)`}>
              <g className={`cat-eye-expression cat-eye-${index}`}>
                <g className="cat-eye-blink">
                  <g clipPath={`url(#${id}-eye)`}>
                    <path d={eye} fill={`url(#${id}-iris)`} />
                    <g className="cat-pupil-focus" style={gaze ? { transform: gaze } : undefined}>
                      <g className="cat-pupil-glance"><ellipse cx="14" cy="8" rx="13" ry="32" fill="#131315" /></g>
                    </g>
                    <path d={eye} fill="none" stroke="#1A1510" strokeOpacity=".22" strokeWidth="5" />
                  </g>
                </g>
              </g>
            </g>)}
            <g transform="translate(790 474)">
              <path ref={closedMouthRef} className="cat-mouth-rest" opacity="1" d={mouthLine} fill="none" stroke="#090A0D" strokeWidth="8" strokeLinecap="round" />
              <g ref={openMouthRef} className="cat-mouth-speaking" opacity="0"><ellipse rx="26" ry="20" fill="#090A0D" /><path d="M-14 9 Q0 3 14 9" fill="none" stroke="#956D64" strokeWidth="5" strokeLinecap="round" /></g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </svg>;
}
