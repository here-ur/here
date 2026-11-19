"use client";

import { createContext } from "react";
import type { Gender, SaveResult } from "@/lib/member-basics";

/** 이 회원에게 성별·생년월일을 물어야 하는지와 저장하는 길. MemberBasicsGate가 확인해서 내려 주고, 묻는 화면은 캐릭터 만나기 무대가 그린다. */
export type MemberBasics = { needed: boolean; save: (gender: Gender, birthDate: string) => Promise<SaveResult> };
export const MemberBasicsContext = createContext<MemberBasics>({ needed: false, save: async () => "ok" });
