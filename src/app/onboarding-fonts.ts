import { Gothic_A1, Outfit } from "next/font/google";

// 캐릭터 만나기(1번 톤 무대)의 글꼴: 숫자·영문은 Outfit, 한글은 Gothic A1. 굵기는 400 · 500 · 600만 쓴다.
// 빌드할 때 받아서 우리 서버에서 내려 주므로(자체 호스팅) 사용자 브라우저가 Google에 따로 요청하지 않는다.
// 한글 글꼴은 조각이 많아 미리 받지 않는다(preload: false). 무대가 쓰는 글자만 그때그때 받는다.
export const outfit = Outfit({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-outfit", display: "swap" });
export const gothicA1 = Gothic_A1({ weight: ["400", "500", "600"], preload: false, variable: "--font-gothic-a1", display: "swap" });

/** CSS font-family 값("'A', 'B Fallback'")에서 첫 글꼴 이름만 꺼낸다(무대가 글자를 미리 받을 때 쓴다). */
export function firstFamily(fontFamily: string): string {
  return fontFamily.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}
