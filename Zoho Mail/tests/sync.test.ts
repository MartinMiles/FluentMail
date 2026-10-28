import { describe, it, expect, vi, afterEach } from "vitest";
import { InboxSync, type SyncSource } from "../desktop/sync";
import {
  DEFAULT_PREFERENCES,
  type Account,
  type Message,
  type InboxUpdate,
  type ListResult,
} from "../src/shared";
const account: Account = {
  id: "100",
  profileId: "p1",
  email: "one@example.test",
  name: "One",
  aliases: ["one@example.test"],
};
const msg = (id: string, time: number, unread = true): Message => ({
  id,
  time,
  unread,
  folderId: "1",
  threadId: "",
  subject: "Fixture " + id,
  sender: "Fixture",
  from: "sender@example.test",
  to: account.email,
  cc: "",
  summary: "",
  flag: "flag_not_set",
  hasAttachment: false,
  labels: [],
});
function fixture() {
  let list = [msg("old", 100)];
  let connected = true;
  let prefs = { ...DEFAULT_PREFERENCES };
  const updates: InboxUpdate[] = [];
  const onError = vi.fn();
  const poll = vi.fn(
    async (_a: Account, _start: number): Promise<ListResult> => ({
      messages: list,
      hasMore: false,
    }),
  );
  const source: SyncSource = {
    connectedAccounts: () => (connected ? [account] : []),
    isConnected: () => connected,
    pollInbox: poll,
  };
  const sync = new InboxSync(
    source,
    () => prefs,
    (u) => updates.push(u),
    onError,
    () => 1000,
  );
  return {
    sync,
    source,
    poll,
    updates,
    onError,
    setList: (l: Message[]) => (list = l),
    setConnected: (c: boolean) => (connected = c),
    setPrefs: (p: Partial<typeof prefs>) => (prefs = { ...prefs, ...p }),
  };
}
afterEach(() => vi.useRealTimers());
describe("automatic mail checking", () => {
  it("latches unexpected adapter failures even if the source has not updated its state", async () => {
    const f = fixture();
    f.poll.mockRejectedValue(new Error("Malformed fixture response"));
    await f.sync.checkNow();
    await f.sync.checkNow();
    expect(f.poll).toHaveBeenCalledTimes(1);
    f.sync.resetProfile("p1");
    await f.sync.checkNow();
    expect(f.poll).toHaveBeenCalledTimes(2);
  });
  it("establishes a quiet baseline then notifies exactly once for new unread mail", async () => {
    const f = fixture();
    await f.sync.checkNow();
    expect(f.updates[0].fresh).toEqual([]);
    f.setList([msg("new", 200), msg("old", 100)]);
    await f.sync.checkNow();
    expect(f.updates[1].fresh.map((m) => m.id)).toEqual(["new"]);
    await f.sync.checkNow();
    expect(f.updates[2].fresh).toEqual([]);
  });
  it("does not notify about older moved mail or already-read messages", async () => {
    const f = fixture();
    await f.sync.checkNow();
    f.setList([msg("read", 300, false), msg("old", 100), msg("moved", 50)]);
    await f.sync.checkNow();
    expect(f.updates[1].fresh).toEqual([]);
  });
  it("scopes notification deduplication by profile and mailbox", async () => {
    const f = fixture();
    const other = { ...account, profileId: "p2", email: "two@example.test" };
    f.source.connectedAccounts = () => [account, other];
    f.poll.mockImplementation(async () => ({
      messages: [msg("shared", 100)],
      hasMore: false,
    }));
    await f.sync.checkNow();
    f.poll.mockImplementation(async (a) => ({
      messages:
        a.profileId === "p2"
          ? [msg("new", 200), msg("shared", 100)]
          : [msg("shared", 100)],
      hasMore: false,
    }));
    await f.sync.checkNow();
    expect(
      f.updates.filter((u) => u.fresh.length).map((u) => u.account.email),
    ).toEqual(["two@example.test"]);
  });
  it("never overlaps sweeps or queues duplicate manual checks", async () => {
    const f = fixture();
    let release: (r: ListResult) => void = () => {};
    f.poll.mockImplementation(() => new Promise((r) => (release = r)));
    const a = f.sync.checkNow(),
      b = f.sync.checkNow();
    expect(a).toBe(b);
    expect(f.poll).toHaveBeenCalledTimes(1);
    release({ messages: [], hasMore: false });
    await a;
  });
  it("drops an in-flight result when the source disconnects", async () => {
    const f = fixture();
    f.poll.mockImplementation(async () => {
      f.setConnected(false);
      return { messages: [msg("x", 100)], hasMore: false };
    });
    await f.sync.checkNow();
    expect(f.updates).toHaveLength(0);
  });
  it("stops remaining mailboxes and drops results when stopped mid-sweep", async () => {
    const f = fixture();
    f.source.connectedAccounts = () => [account, { ...account, id: "200" }];
    f.poll.mockImplementation(async () => {
      f.sync.stop();
      return { messages: [], hasMore: false };
    });
    await f.sync.checkNow();
    expect(f.poll).toHaveBeenCalledTimes(1);
    expect(f.updates).toHaveLength(0);
  });
  it("does not retry an account that paused after an error", async () => {
    const f = fixture();
    f.poll.mockImplementation(async () => {
      f.setConnected(false);
      throw new Error("Fixture 429 pause");
    });
    await f.sync.checkNow();
    await f.sync.checkNow();
    expect(f.poll).toHaveBeenCalledTimes(1);
    expect(f.onError).toHaveBeenCalledTimes(1);
  });
  it("starts a fresh silent baseline after explicit reconnect", async () => {
    const f = fixture();
    await f.sync.checkNow();
    f.sync.resetProfile("p1");
    f.setList([msg("while-disconnected", 200)]);
    await f.sync.checkNow();
    expect(f.updates[1].fresh).toEqual([]);
  });
  it("bounds catch-up work to five pages and reports the limitation", async () => {
    const f = fixture();
    await f.sync.checkNow();
    f.poll.mockImplementation(async (_a, start) => ({
      messages: Array.from({ length: 40 }, (_, i) =>
        msg(String(start + i), 10000 - start - i),
      ),
      hasMore: true,
    }));
    await f.sync.checkNow();
    expect(f.poll).toHaveBeenCalledTimes(6);
    expect(f.updates[1].fresh).toHaveLength(200);
    expect(f.updates[1].catchUpLimited).toBe(true);
  });
  it("respects paused automatic checks while allowing one manual check", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.setPrefs({ automaticChecks: false });
    f.sync.start();
    await vi.advanceTimersByTimeAsync(32000);
    expect(f.poll).not.toHaveBeenCalled();
    await f.sync.checkNow();
    expect(f.poll).toHaveBeenCalledTimes(1);
    f.sync.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.poll).toHaveBeenCalledTimes(1);
  });
  it("uses the requested interval after a completed sweep", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.sync.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14999);
    expect(f.poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.poll).toHaveBeenCalledTimes(2);
    f.sync.stop();
  });
});
