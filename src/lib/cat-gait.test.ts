import test from "node:test";
import assert from "node:assert/strict";
import { createCatGait } from "./cat-gait.ts";

test("support foot stays in world space while the body advances, and travel stays bounded", () => {
  const gait = createCatGait();
  let previous = { ...gait.update(0, true) }, planted = 0;
  for (let i = 0; i < 4000; i++) {
    const p = { ...gait.update(16, true) };
    assert.ok(Math.abs(p.x) <= 10.001);
    if (p.leftY < -.2 && previous.leftY < -.2 && Math.abs(p.x - previous.x) > .001) {
      assert.ok(Math.abs((p.x + p.rightX) - (previous.x + previous.rightX)) < 1e-6); planted++;
    }
    if (p.rightY < -.2 && previous.rightY < -.2 && Math.abs(p.x - previous.x) > .001) {
      assert.ok(Math.abs((p.x + p.leftX) - (previous.x + previous.leftX)) < 1e-6); planted++;
    }
    previous = p;
  }
  assert.ok(planted > 100);
});
test("interruption finishes the current step and plants both feet without sliding back to centre", () => {
  const gait = createCatGait();
  for (let i = 0; i < 240; i++) gait.update(16, true);
  let p;
  for (let i = 0; i < 150; i++) p = { ...gait.update(16, false) };
  assert.equal(p!.direction, 0); assert.equal(p!.leftX, 0); assert.equal(p!.rightX, 0);
  assert.equal(p!.leftY, 0); assert.equal(p!.rightY, 0); assert.equal(p!.x, 5);
  const held = { ...gait.update(16, false) };
  assert.deepEqual(held, p);
});
