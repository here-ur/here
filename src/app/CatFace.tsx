import { useAudioMouth } from "./use-audio-mouth";
import { useId, type RefObject } from "react";
import type { BuddyState, Look, Mouth } from "./Buddy";
import type { CatExpression } from "@/lib/cat-expression";
import type { MouthShape } from "@/lib/mouth-shape";

const ART = "/characters/black-cat-final.png";
export const CAT_UNITS_PER_BUDDY_UNIT = 1435 / 200;
// Follow the silhouette in the approved frontal artwork, leaving the original
// studio background outside the clip so the same art works on every surface.
const SILHOUETTE = "M1328 642 C1307 570 1292 479 1305 426 C1313 367 1341 347 1387 351 C1450 351 1513 411 1545 446 C1553 458 1571 456 1597 452 C1686 432 1771 442 1836 452 C1852 451 1853 431 1872 418 C1916 377 1969 348 2013 350 C2061 348 2083 390 2089 439 C2100 509 2087 593 2069 641 C2084 685 2107 755 2102 821 C2103 916 2047 1000 1962 1041 C1987 1087 1998 1146 2003 1167 C2033 1204 2055 1265 2050 1326 C2118 1335 2164 1383 2171 1432 C2178 1482 2138 1517 2099 1524 C2027 1547 1920 1542 1865 1537 C1829 1551 1757 1551 1715 1541 C1664 1548 1572 1556 1546 1537 C1538 1531 1532 1525 1524 1524 C1488 1530 1416 1529 1395 1516 C1376 1504 1379 1479 1384 1467 C1358 1439 1330 1391 1331 1335 C1329 1271 1353 1217 1393 1183 C1401 1129 1411 1082 1435 1041 C1347 997 1288 912 1292 812 C1292 741 1308 686 1328 642Z";

export default function CatFace({ state, expression, look, mouth, outputLevel, outputShape }: {
  state: BuddyState; expression: CatExpression; look?: Look; mouth?: Mouth;
  outputLevel?: RefObject<number>; outputShape?: RefObject<MouthShape>;
}) {
  const id = `cat-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { mouth: openMouthRef, rest: closedMouthRef } = useAudioMouth(state === "speaking", outputLevel, outputShape);
  const attentive = state === "attentive" || state === "listening";
  const useArtEyes = !look && expression === "neutral" && (state === "idle" || state === "speaking");
  const eye = attentive ? "M-76-8 Q0-22 76-8 C72 100-72 100-76-8Z"
    : "M-76 0H76C72 97-72 97-76 0Z";
  const gaze = look ? `translate(${Math.max(-1, Math.min(1, look[0])) * 24}px, ${Math.max(-1, Math.min(1, look[1])) * 12}px)` : undefined;
  const rest = expression === "warm" || mouth === "smile" ? "M-25-2Q0 21 25-2" : "";
  return <svg x="20" y="32" width="200" height="184" viewBox="1020 315 1435 1320" overflow="visible">
    <defs>
      <image id={`${id}-art`} href={ART} width="3396" height="1852" />
      <clipPath id={`${id}-outline`}><path d={SILHOUETTE} /></clipPath>
      <g id={`${id}-cat`} clipPath={`url(#${id}-outline)`}><use href={`#${id}-art`} /></g>
      <linearGradient id={`${id}-iris`} x2="0" y2="1"><stop stopColor="#DD8429" /><stop offset=".46" stopColor="#FFBA4F" /><stop offset="1" stopColor="#FFD478" /></linearGradient>
      <linearGradient id={`${id}-upper`} gradientUnits="userSpaceOnUse" x1="0" y1="1010" x2="0" y2="1090"><stop stopColor="white" /><stop offset="1" stopColor="black" /></linearGradient>
      <mask id={`${id}-head`} maskUnits="userSpaceOnUse" x="1260" y="320" width="950" height="800"><rect x="1260" y="320" width="950" height="800" fill={`url(#${id}-upper)`} /></mask>
      <mask id={`${id}-body`} maskUnits="userSpaceOnUse" x="1260" y="1000" width="950" height="570">
        <rect x="1260" y="1010" width="950" height="560" fill="white" />
        <rect x="1400" y="1490" width="285" height="80" />
        <rect x="1705" y="1490" width="166" height="80" />
      </mask>
      <clipPath id={`${id}-foot-left`}><rect x="1400" y="1458" width="285" height="112" /></clipPath>
      <clipPath id={`${id}-foot-right`}><rect x="1705" y="1458" width="166" height="112" /></clipPath>
      <clipPath id={`${id}-eye`}><path d={eye} /></clipPath>
      <filter id={`${id}-feather`} x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="10" /></filter>
      <mask id={`${id}-lids`} maskUnits="userSpaceOnUse" x="1410" y="720" width="570" height="175">
        <rect x="1428" y="748" width="194" height="106" rx="24" fill="white" filter={`url(#${id}-feather)`} />
        <rect x="1767" y="748" width="194" height="106" rx="24" fill="white" filter={`url(#${id}-feather)`} />
      </mask>
    </defs>
    <g className="cat-foot-left"><use href={`#${id}-cat`} clipPath={`url(#${id}-foot-left)`} /></g>
    <g className="cat-foot-right"><use href={`#${id}-cat`} clipPath={`url(#${id}-foot-right)`} /></g>
    <use href={`#${id}-cat`} mask={`url(#${id}-body)`} />
    <g className="cat-head-pose">
      <g className="cat-head-idle">
        <g className="cat-head-response">
          <use href={`#${id}-cat`} mask={`url(#${id}-head)`} />
          <g className={useArtEyes ? "cat-lids-blink" : undefined} opacity={useArtEyes ? 0 : 1} mask={`url(#${id}-lids)`}>
            <use href={`#${id}-art`} transform="translate(0 118)" />
          </g>
          <g className="cat-face-turn">
            {!useArtEyes && [1525, 1863].map((x, index) => <g key={x} transform={`translate(${x} 765)`}>
              <g className={`cat-eye-expression cat-eye-${index}`}>
                <g className="cat-eye-blink" clipPath={`url(#${id}-eye)`}>
                  <path d={eye} fill={`url(#${id}-iris)`} />
                  <g className="cat-pupil-focus" style={gaze ? { transform: gaze } : undefined}>
                    <g className="cat-pupil-glance"><ellipse cy="1" rx="33" ry="38" fill="#281A10" /></g>
                  </g>
                  <path d={eye} fill="none" stroke="#1A1510" strokeOpacity=".3" strokeWidth="6" />
                </g>
              </g>
            </g>)}
            <g transform="translate(1692 882)">
              <path ref={closedMouthRef} className="cat-mouth-rest" opacity="1" d={rest || undefined} fill="none" stroke="#111217" strokeWidth="7" strokeLinecap="round" />
              <g ref={openMouthRef} className="cat-mouth-speaking" opacity="0"><path className="cat-mouth-cavity" d="M-26 0 A26 20 0 1 0 26 0 A26 20 0 1 0-26 0" fill="#090A0D" /><path className="cat-mouth-teeth" fill="none" stroke="#D5CBB8" strokeWidth="4" strokeLinecap="round" opacity="0" /><path className="cat-mouth-tongue" fill="none" stroke="#956D64" strokeWidth="4" strokeLinecap="round" opacity=".3" /></g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </svg>;
}
