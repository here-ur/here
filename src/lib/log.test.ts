import { test } from "node:test";
import assert from "node:assert/strict";
import { clearLog, loadLog, saveSession } from "./log.ts";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

const msg = [{ role: "user" as const, content: "안녕" }];

test("같은 대화는 덮어쓰고 최신이 앞에 온다", () => {
  clearLog();
  saveSession({ id: "a", startedAt: Date.now() - 1000, messages: msg });
  saveSession({ id: "b", startedAt: Date.now(), messages: msg });
  saveSession({ id: "a", startedAt: Date.now() - 1000, messages: [...msg, { role: "assistant", content: "응" }] });
  const log = loadLog();
  assert.deepEqual(log.map((s) => s.id), ["a", "b"]);
  assert.equal(log[0].messages.length, 2);
});

test("30일 지난 기록과 빈 대화는 빠진다", () => {
  clearLog();
  const day = 24 * 60 * 60 * 1000;
  saveSession({ id: "old", startedAt: Date.now() - 31 * day, messages: msg });
  saveSession({ id: "empty", startedAt: Date.now(), messages: [] });
  saveSession({ id: "new", startedAt: Date.now() - 29 * day, messages: msg });
  assert.deepEqual(loadLog().map((s) => s.id), ["new"]);
});
