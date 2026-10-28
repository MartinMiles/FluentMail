import {
  type Account,
  type InboxUpdate,
  type ListResult,
  type Preferences,
  PAGE_SIZE,
} from "../src/shared";

export interface SyncSource {
  connectedAccounts(): Account[];
  isConnected(profileId: string): boolean;
  pollInbox(account: Account, start: number): Promise<ListResult>;
}
type Baseline = { seen: Set<string>; watermark: number };
const accountKey = (a: Account) => a.profileId + ":" + a.id;
/** One bounded sweep at a time. Scheduling lives outside Chromium's background throttling. */
export class InboxSync {
  private baselines = new Map<string, Baseline>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inFlight: Promise<void> | undefined;
  private epoch = 0;
  private failedProfiles = new Set<string>();
  constructor(
    private source: SyncSource,
    private preferences: () => Preferences,
    private onInbox: (update: InboxUpdate) => void,
    private onError: (account: Account, error: unknown) => void,
    private now = () => Date.now(),
  ) {}
  start() {
    if (this.running) return;
    this.running = true;
    this.schedule(1000);
  }
  stop() {
    this.epoch++;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  wake() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running && !this.inFlight) this.schedule(500);
  }
  resetProfile(id: string) {
    this.epoch++;
    this.failedProfiles.delete(id);
    for (const key of this.baselines.keys())
      if (key.startsWith(id + ":")) this.baselines.delete(key);
  }
  private schedule(ms: number) {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.checkNow(false);
    }, ms);
  }
  checkNow(force = true): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.inFlight = this.sweep(force, this.epoch).finally(() => {
      this.inFlight = undefined;
      if (this.running)
        this.schedule(this.preferences().intervalSeconds * 1000);
    });
    return this.inFlight;
  }
  private async sweep(force: boolean, epoch: number) {
    if (!this.preferences().automaticChecks && !force) return;
    for (const account of this.source.connectedAccounts()) {
      if (epoch !== this.epoch) return;
      if (!this.preferences().automaticChecks && !force) break;
      if (
        this.failedProfiles.has(account.profileId) ||
        !this.source.isConnected(account.profileId)
      )
        continue;
      try {
        const key = accountKey(account);
        const previous = this.baselines.get(key);
        const first = await this.source.pollInbox(account, 1);
        if (epoch !== this.epoch) return;
        if (!this.source.isConnected(account.profileId)) continue;
        const all = [...first.messages];
        let page = first;
        let pageCount = 1;
        // Quiet first load. On later loads, catch up to 200 messages while respecting the global pacer.
        while (
          previous &&
          page.hasMore &&
          pageCount < 5 &&
          page.messages.every(
            (m) => !previous.seen.has(m.id) && m.time >= previous.watermark,
          )
        ) {
          if (!this.source.isConnected(account.profileId)) break;
          page = await this.source.pollInbox(
            account,
            1 + pageCount * PAGE_SIZE,
          );
          all.push(...page.messages);
          pageCount++;
          if (epoch !== this.epoch) return;
        }
        if (!this.source.isConnected(account.profileId)) continue;
        const fresh = previous
          ? all.filter(
              (m) =>
                m.unread &&
                !previous.seen.has(m.id) &&
                m.time >= previous.watermark,
            )
          : [];
        const seen = previous?.seen || new Set<string>();
        for (const m of all) seen.add(m.id);
        while (seen.size > 2000) seen.delete(seen.values().next().value!);
        const watermark = Math.max(
          previous?.watermark || 0,
          ...all.map((m) => m.time).filter(Number.isFinite),
        );
        this.baselines.set(key, { seen, watermark });
        this.onInbox({
          account,
          messages: first.messages,
          hasMore: first.hasMore,
          checkedAt: this.now(),
          fresh,
          catchUpLimited: pageCount === 5 && page.hasMore,
        });
      } catch (error) {
        this.failedProfiles.add(account.profileId);
        this.onError(account, error);
      }
    }
  }
}
