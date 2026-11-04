"use client";

import type { ColorId } from "@/lib/onboarding";
import type { SkyId } from "@/lib/report";
import { Bloom } from "./HomeScreen";
import "./sky-backdrop.css";

// 정원 화면의 바탕. 홈과 같은 밝은 바탕에 몽글이 빛이 아래에서 번지고, 섬 뒤에서 그날 날씨 색이 은은하게 숨 쉰다.
// 짙은 하늘을 따로 그리지 않아 앱의 다른 화면과 같은 결이다. 동작 줄이기에서는 멈춘다.
const WEATHER_TINT: Record<SkyId | "none", string> = {
  none: "#E7E3FF", sunny: "#FFEFC6", cozy: "#FFE0D4", cloudy: "#E3E7F0", rain: "#D4DFFA", thunder: "#E5DBFB", wind: "#D4F1E8",
};

export default function SkyBackdrop({ weather, color }: { weather: SkyId | null; color: ColorId }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-[#FAFCFE]">
      <Bloom color={color} lively className="h-[80%]" />
      <div className="sky-horizon" style={{ background: `radial-gradient(closest-side, ${WEATHER_TINT[weather ?? "none"]}, transparent)` }} />
    </div>
  );
}
