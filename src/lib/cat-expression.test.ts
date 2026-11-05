import assert from "node:assert/strict";
import test from "node:test";
import { catExpression } from "./cat-expression.ts";

test("difficult messages take precedence over laughter or congratulations", () => {
  for (const text of ["면접 떨어졌어 ㅋㅋ", "합격했는데 너무 불안해", "고마워. 그래도 외로워", "친구랑 싸웠어"]) assert.equal(catExpression(text), "gentle");
  assert.equal(catExpression("합격했어", true), "gentle");
});
test("only explicit positive cues soften the cat; questions and negation stay neutral", () => {
  for (const text of ["최종 합격했어!", "오늘 드디어 해냈어", "고마워"]) assert.equal(catExpression(text), "warm");
  for (const text of ["", "오늘 뭐 먹지?", "ㅋㅋㅋ", "기분 안 좋아", "행복하지 않아"]) assert.equal(catExpression(text), "neutral");
});
