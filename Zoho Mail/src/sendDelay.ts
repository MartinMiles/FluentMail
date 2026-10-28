/** A cancellable local grace period. No mail/upload request belongs in this class. */
export class SendDelay {
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private tick: ((seconds: number | null) => void) | undefined;
  get pending() {
    return this.timeout !== undefined;
  }
  start(send: () => void, onTick: (seconds: number | null) => void) {
    this.cancel();
    const generation = ++this.generation;
    const deadline = Date.now() + 5000;
    this.tick = onTick;
    onTick(5);
    this.interval = setInterval(() => {
      if (generation === this.generation)
        onTick(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
    }, 200);
    this.timeout = setTimeout(() => {
      if (generation !== this.generation) return;
      this.clear();
      onTick(null);
      send();
    }, 5000);
  }
  private clear() {
    if (this.timeout) clearTimeout(this.timeout);
    if (this.interval) clearInterval(this.interval);
    this.timeout = undefined;
    this.interval = undefined;
  }
  cancel() {
    const wasPending = this.pending;
    this.generation++;
    this.clear();
    if (wasPending) this.tick?.(null);
    this.tick = undefined;
    return wasPending;
  }
}
