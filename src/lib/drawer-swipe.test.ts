import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SWIPE_IGNORE_SELECTOR, SWIPE_SETTLE_MS, swipeCloses, swipeOffset, swipeStart } from "./drawer-swipe.ts";

test("밀기 시작: 왼쪽으로 10px 이상이면 따라오고, 세로가 더 크면 스크롤로 두며, 오른쪽·작은 움직임은 기다린다", () => {
  assert.equal(swipeStart(-9, 0), "wait");
  assert.equal(swipeStart(-10, 0), "drag");
  assert.equal(swipeStart(-40, 12), "drag");
  assert.equal(swipeStart(30, 0), "wait");
  assert.equal(swipeStart(0, 0), "wait");
  // 세로로 10px 넘게, 가로보다 많이 움직이면 목록 스크롤이다.
  assert.equal(swipeStart(-8, 11), "scroll");
  assert.equal(swipeStart(-30, -40), "scroll");
  // 세로 10px까지는 아직 판단하지 않는다.
  assert.equal(swipeStart(-4, 10), "wait");
});

test("패널은 열린 자리보다 오른쪽으로 나가지 않는다", () => {
  assert.equal(swipeOffset(25), 0);
  assert.equal(swipeOffset(-80), -80);
});

test("닫기: 너비의 30%를 넘게 밀거나 빠르게 튕기면 닫고, 취소되면 닫지 않는다", () => {
  const width = 300;
  // 거리: 90px(30%)는 아직, 91px부터 닫는다. 느리게 밀어도 마찬가지다.
  assert.equal(swipeCloses(-90, 1000, width), false);
  assert.equal(swipeCloses(-91, 1000, width), true);
  // 속도: 0.5px/ms보다 빠르면 짧아도 닫는다.
  assert.equal(swipeCloses(-60, 100, width), true);
  assert.equal(swipeCloses(-50, 100, width), false);
  // 시간이 0이어도 나누기 오류 없이 판단한다.
  assert.equal(swipeCloses(-20, 0, width), true);
  // 제자리·오른쪽, 브라우저 취소는 닫지 않는다.
  assert.equal(swipeCloses(0, 10, width), false);
  assert.equal(swipeCloses(-200, 100, width, true), false);
});

test("입력칸·편집 영역에서 시작한 끌기는 밀어 닫기로 보지 않는다", () => {
  for (const part of ["input", "textarea", "select", "[contenteditable]"]) assert.ok(SWIPE_IGNORE_SELECTOR.includes(part), part);
  assert.match(SWIPE_IGNORE_SELECTOR, /:not\(\[contenteditable="false"\]\)/);
  assert.ok(SWIPE_SETTLE_MS > 300);
});

test("Drawer는 밀기 판단을 이 함수들로 하고, 밀기 뒤 클릭을 막으며, 다시 열면 밀어 닫기 자국을 지운다", () => {
  const drawer = readFileSync(new URL("../app/Drawer.tsx", import.meta.url), "utf8");
  const down = drawer.slice(drawer.indexOf("onPointerDown:"), drawer.indexOf("onPointerMove:"));
  assert.match(down, /closest\(SWIPE_IGNORE_SELECTOR\)\) return/);
  assert.match(drawer, /swipeStart\(dx, dy\)/);
  assert.match(drawer, /swipeOffset\(dx\)/);
  assert.match(drawer, /swipeCloses\(/);
  // 밀고 난 뒤의 클릭 한 번은 메뉴 항목에 전달하지 않는다.
  assert.match(drawer, /onClickCapture:[\s\S]{0,120}?if \(!swiped\.current\) return;[\s\S]{0,120}?preventDefault\(\)/);
  // 밀어 닫은 뒤 패널을 되돌리는 타이머는 ref에 두고, 다시 열면 타이머를 지우고 패널 위치를 바로 되돌린다.
  assert.match(drawer, /settle\.current = window\.setTimeout\(/);
  const reopen = drawer.slice(drawer.indexOf("// 밀어 닫은 직후 다시 열면"));
  assert.match(reopen, /if \(!open\) return;\s*window\.clearTimeout\(settle\.current\);[\s\S]{0,160}?style\.translate = ""/);
});
