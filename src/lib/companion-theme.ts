import type { ColorId } from "./onboarding";

// Keep saved color IDs compatible while giving the cat a quieter, matte setting.
export const COMPANION_BACKGROUNDS: ReadonlyArray<{ id: ColorId; label: string; surface: string }> = [
  { id: "lavender", label: "아이보리", surface: "#F5F2EB" },
  { id: "sky", label: "스톤", surface: "#EDEEEB" },
  { id: "mint", label: "세이지", surface: "#E9EDE5" },
  { id: "peach", label: "샌드", surface: "#F0E7DA" },
];

export function companionBackground(id: ColorId) {
  return (COMPANION_BACKGROUNDS.find((color) => color.id === id) ?? COMPANION_BACKGROUNDS[0]).surface;
}
