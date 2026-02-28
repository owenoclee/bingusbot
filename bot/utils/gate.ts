// Gate is a signal/wait primitive that tracks open/closed state.
// It opens on the first open and closes when wait() actually blocks.
// onOpen/onClose fire at those transitions, letting callers bracket
// active periods without any external tracking.
export class Gate {
  private pending = false;
  private resolve: (() => void) | null = null;
  private isOpen = false;
  private onOpen?: () => void;
  private onClose?: () => void;

  constructor(opts?: { onOpen?: () => void; onClose?: () => void }) {
    this.onOpen = opts?.onOpen;
    this.onClose = opts?.onClose;
  }

  open(): void {
    if (!this.isOpen) {
      this.isOpen = true;
      this.onOpen?.();
    }
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      this.pending = false;
      r();
    } else {
      this.pending = true;
    }
  }

  wait(): Promise<void> {
    if (this.pending) {
      this.pending = false;
      return Promise.resolve();
    }
    if (this.isOpen) {
      this.isOpen = false;
      this.onClose?.();
    }
    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }
}
