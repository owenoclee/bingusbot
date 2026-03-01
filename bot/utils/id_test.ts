import { assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { generateId, idToMs } from "./id.ts";

Deno.test("generateId returns correct format", () => {
  const id = generateId();
  assertMatch(id, /^\d{10}\.\d{6}$/);
});

Deno.test("generateId seconds part matches current time", () => {
  const before = Math.floor(Date.now() / 1000);
  const id = generateId();
  const after = Math.floor(Date.now() / 1000);
  const secs = parseInt(id.split(".")[0], 10);
  assert(secs >= before && secs <= after);
});

Deno.test("generateId is unique across rapid calls", () => {
  const ids = Array.from({ length: 100 }, () => generateId());
  const unique = new Set(ids);
  assertEquals(unique.size, 100);
});

Deno.test("generateId is lexicographically ordered over time", async () => {
  const a = generateId();
  await new Promise((r) => setTimeout(r, 5));
  const b = generateId();
  assert(a < b, `expected ${a} < ${b}`);
});

Deno.test("generateId rapid same-ms calls are lexicographically ordered", () => {
  const ids = Array.from({ length: 50 }, () => generateId());
  for (let i = 1; i < ids.length; i++) {
    assert(ids[i - 1] < ids[i], `out of order: ${ids[i - 1]} >= ${ids[i]}`);
  }
});

Deno.test("idToMs round-trips a known timestamp", () => {
  // 2025-01-15T12:30:00.123Z = 1736944200123 ms
  const ms = Date.UTC(2025, 0, 15, 12, 30, 0, 123);
  const secs = Math.floor(ms / 1000);       // 1736944200
  const sub = (ms % 1000) * 1000;           // 123000
  const id = `${secs}.${String(sub).padStart(6, "0")}`;
  assertEquals(idToMs(id), ms);
});

Deno.test("idToMs is consistent with generateId", () => {
  const before = Date.now();
  const id = generateId();
  const after = Date.now();
  const ms = idToMs(id);
  assert(ms >= before && ms <= after, `idToMs(${id}) = ${ms}, expected [${before}, ${after}]`);
});

Deno.test("idToMs ignores sub-ms counter", () => {
  // Two IDs in the same millisecond should produce the same ms value
  const secs = 1736944200;
  const msWithinSec = 500;
  const id0 = `${secs}.${String(msWithinSec * 1000 + 0).padStart(6, "0")}`;
  const id1 = `${secs}.${String(msWithinSec * 1000 + 1).padStart(6, "0")}`;
  assertEquals(idToMs(id0), idToMs(id1));
  assertNotEquals(id0, id1);
});

Deno.test("idToMs handles zero subsecond", () => {
  const id = "1736944200.000000";
  assertEquals(idToMs(id), 1736944200000);
});

Deno.test("idToMs handles max ms within second (999)", () => {
  const id = "1736944200.999000";
  assertEquals(idToMs(id), 1736944200999);
});
