import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { Gate } from "./gate.ts";

Deno.test("open then wait resolves immediately", async () => {
  const gate = new Gate();
  gate.open();
  await gate.wait();
});

Deno.test("wait then open resolves the waiter", async () => {
  const gate = new Gate();
  let resolved = false;
  const p = gate.wait().then(() => { resolved = true; });
  assertEquals(resolved, false);
  gate.open();
  await p;
  assertEquals(resolved, true);
});

Deno.test("multiple opens coalesce into one pending", async () => {
  const gate = new Gate();
  gate.open();
  gate.open();
  gate.open();
  await gate.wait(); // consumes pending
  // Second wait should block
  let blocked = true;
  const p = gate.wait().then(() => { blocked = false; });
  assertEquals(blocked, true);
  gate.open();
  await p;
  assertEquals(blocked, false);
});

Deno.test("onOpen fires on first open only", () => {
  let opens = 0;
  const gate = new Gate({ onOpen: () => opens++ });
  gate.open();
  gate.open();
  gate.open();
  assertEquals(opens, 1);
});

Deno.test("onClose fires when wait blocks", async () => {
  let closes = 0;
  const gate = new Gate({ onClose: () => closes++ });
  gate.open();
  await gate.wait(); // consumes pending, gate still open
  assertEquals(closes, 0);
  const p = gate.wait(); // nothing pending → onClose fires, blocks
  assertEquals(closes, 1);
  gate.open();
  await p;
});

Deno.test("onClose does not fire when wait resolves from pending", async () => {
  let closes = 0;
  const gate = new Gate({ onClose: () => closes++ });
  gate.open();
  gate.open(); // sets pending again
  await gate.wait(); // resolves from pending, gate stays open
  assertEquals(closes, 0);
});

Deno.test("open/close cycle fires both callbacks in order", async () => {
  const events: string[] = [];
  const gate = new Gate({
    onOpen: () => events.push("open"),
    onClose: () => events.push("close"),
  });

  gate.open();
  await gate.wait(); // consumes pending
  const p = gate.wait(); // blocks → onClose
  assertEquals(events, ["open", "close"]);
  gate.open();
  await p;
});

Deno.test("self-open keeps gate open across iterations", async () => {
  const events: string[] = [];
  const gate = new Gate({
    onOpen: () => events.push("open"),
    onClose: () => events.push("close"),
  });

  gate.open();             // onOpen fires, pending set
  await gate.wait();       // consumes pending, gate still open
  gate.open();             // already open — no onOpen, sets pending
  await gate.wait();       // consumes pending, gate still open
  // Nothing pending — wait blocks, onClose fires
  const p = gate.wait();
  assertEquals(events, ["open", "close"]);
  gate.open();
  await p;
});
