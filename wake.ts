// Package wake implements self-wake scheduling. It lets the agent set a
// future alarm, then fires it at the right time while deferring during
// active conversations so the agent doesn't interrupt the user.

// WakeSchedule is a persisted record of when and why the agent should
// wake itself up.
export interface WakeSchedule {
  wakeAt: string; // ISO 8601
  reason: string;
}

// WakeDeps provides I/O and callbacks the wake scheduler needs.
// The scheduler itself is pure logic; all side effects go through these.
export interface WakeDeps {
  readSchedule(): Promise<WakeSchedule | null>;
  clearSchedule(): Promise<void>;
  onWake(reason: string): Promise<void>;
  quietPeriodMs: number;
}

// WakeScheduler manages timed self-wake events. It defers firing while
// a conversation is active (quiet period or mid-reply) so the agent
// doesn't interrupt the user.
export interface WakeScheduler {
  check(): void;
  onActivity(): void;
  setReplying(v: boolean): void;
  dispose(): void;
}

// createWakeScheduler returns a WakeScheduler that polls for a persisted
// schedule and fires at the right time, respecting conversation quiet periods.
export function createWakeScheduler(deps: WakeDeps): WakeScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastActivityMs = 0;
  let replying = false;

  function check(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    deps.readSchedule().then((schedule) => {
      if (!schedule) return;

      const wakeAt = new Date(schedule.wakeAt).getTime();
      const delay = Math.max(0, wakeAt - Date.now());

      const quietUntil = lastActivityMs + deps.quietPeriodMs;
      const effectiveDelay = Math.max(delay, quietUntil - Date.now());

      if (effectiveDelay <= 0) {
        console.log(`[wake] firing now: ${schedule.reason}`);
        fire(schedule.reason);
        return;
      }

      console.log(
        `[wake] scheduled in ${Math.round(effectiveDelay / 60000)}m: ${schedule.reason}`,
      );
      timer = setTimeout(() => {
        timer = null;
        const sinceLastActivity = Date.now() - lastActivityMs;
        if (replying || sinceLastActivity < deps.quietPeriodMs) {
          console.log(`[wake] conversation active, deferring`);
          check();
          return;
        }
        fire(schedule.reason);
      }, effectiveDelay);
    });
  }

  async function fire(reason: string): Promise<void> {
    console.log(`[wake] waking: ${reason}`);
    await deps.clearSchedule();
    replying = true;
    try {
      await deps.onWake(reason);
    } catch (err) {
      console.error("wake error:", err);
    } finally {
      replying = false;
      lastActivityMs = Date.now();
    }
    // Agent may have scheduled a new wake during its response
    check();
  }

  function onActivity(): void {
    lastActivityMs = Date.now();
  }

  function setReplying(v: boolean): void {
    replying = v;
  }

  function dispose(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { check, onActivity, setReplying, dispose };
}
