import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { formatTimestamp } from "./time.ts";

Deno.test("formatTimestamp produces expected format", () => {
  // 2025-01-15T12:30:00Z — a Wednesday in winter (UTC = GMT, no DST offset)
  const ms = Date.UTC(2025, 0, 15, 12, 30, 0);
  const result = formatTimestamp(ms);
  assertEquals(result, "Wed, 15 Jan, 12:30");
});

Deno.test("formatTimestamp handles BST (summer time)", () => {
  // 2025-07-01T12:00:00Z — during BST, Europe/London is UTC+1, so local time is 13:00
  const ms = Date.UTC(2025, 6, 1, 12, 0, 0);
  const result = formatTimestamp(ms);
  assertEquals(result, "Tue, 1 Jul, 13:00");
});
