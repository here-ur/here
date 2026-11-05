import test from "node:test";
import assert from "node:assert/strict";
import { estimateMouthShape } from "./mouth-shape.ts";
const spectrum = (hz: number) => { const bins = new Float32Array(512).fill(-100); bins[Math.round(hz * 1024 / 48000)] = -12; return bins; };
test("same loudness produces distinct mouth families for different spectral profiles", () => {
  assert.equal(estimateMouthShape(spectrum(600), 48000, 1024, .5), "pucker");
  assert.equal(estimateMouthShape(spectrum(600), 48000, 1024, .9), "round");
  assert.equal(estimateMouthShape(spectrum(1300), 48000, 1024, .5), "open");
  assert.equal(estimateMouthShape(spectrum(2500), 48000, 1024, .5), "wide");
  assert.equal(estimateMouthShape(spectrum(6000), 48000, 1024, .5), "teeth");
});
test("silence closes regardless of spectrum; missing spectral data degrades to open mouth", () => {
  assert.equal(estimateMouthShape(spectrum(2500), 48000, 1024, 0), "rest");
  assert.equal(estimateMouthShape(new Float32Array(512).fill(-Infinity), 48000, 1024, .5), "open");
});
