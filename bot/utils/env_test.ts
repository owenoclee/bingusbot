import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { optionalEnv } from "./env.ts";

Deno.test("optionalEnv returns value when set", () => {
  Deno.env.set("TEST_OPT_VAR", "hello");
  assertEquals(optionalEnv("TEST_OPT_VAR"), "hello");
  Deno.env.delete("TEST_OPT_VAR");
});

Deno.test("optionalEnv returns undefined when not set", () => {
  Deno.env.delete("TEST_OPT_MISSING");
  assertEquals(optionalEnv("TEST_OPT_MISSING"), undefined);
});

Deno.test("optionalEnv returns undefined for empty string", () => {
  Deno.env.set("TEST_OPT_EMPTY", "");
  assertEquals(optionalEnv("TEST_OPT_EMPTY"), undefined);
  Deno.env.delete("TEST_OPT_EMPTY");
});
