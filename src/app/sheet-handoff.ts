"use client";

import { createContext } from "react";

/** 로그인 뒤 시트 단계(기억 동의 → 성별·생년월일)를 이어 줄 때, 다음 단계가 앞 시트에서 바로 이어지는지 알려 준다.
 * true면 다음 단계는 시트를 새로 올리지 않고 그 자리에서 내용만 옆으로 바꾸며, 다음 화면으로 넘어가는 전환(movePage)도 그 단계가 맡는다. */
export const SheetHandoff = createContext(false);
