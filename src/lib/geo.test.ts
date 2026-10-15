import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM } from "./geo.ts";

test("서울시청 → 강남역은 약 8.8km", () => {
  const d = distanceM(37.5663, 126.9779, 37.4979, 127.0276);
  assert.ok(d > 8500 && d < 9100, String(d));
});

test("같은 점은 0", () => {
  assert.equal(distanceM(37.5, 127, 37.5, 127), 0);
});
