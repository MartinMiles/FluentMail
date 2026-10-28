// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import {
  groupConversations,
  conversationKey,
  newestMessages,
  readConversationOrder,
  CONVERSATION_ORDER_KEY,
} from "../src/conversations";
import type { Message, Account, Command, Detail } from "../src/shared";
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/api", () => ({ call }));
import { ConversationReader } from "../src/ConversationReader";
const original: Message = {
  id: "1",
  folderId: "2",
  threadId: "500",
  subject: "Design",
  sender: "Alex",
  from: "alex@example.test",
  to: "jamie@example.test",
  cc: "",
  summary: "",
  time: 1,
  unread: false,
  flag: "",
  hasAttachment: false,
  labels: [],
};
const reply: Message = {
  ...original,
  id: "2",
  folderId: "1",
  sender: "Jamie",
  from: "jamie@example.test",
  to: "alex@example.test",
  time: 2,
};
const account: Account = {
  id: "100",
  profileId: "p",
  email: "alex@example.test",
  name: "Alex",
  aliases: ["alex@example.test"],
};
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=";
afterEach(() => {
  cleanup();
  call.mockReset();
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("conversation identity", () => {
  it("groups actual thread IDs, deduplicates pages, and keeps newest representative metadata", () => {
    const [row] = groupConversations([original, reply, reply]);
    expect(row.id).toBe("thread:500");
    expect(row.remoteId).toBe("2");
    expect(row.threadCount).toBe(2);
    expect(row.folderId).toBe("1");
    expect(conversationKey(original)).toBe(conversationKey(reply));
  });
  it("never groups identical subjects across threads, mailboxes, or authorizations", () => {
    expect(
      groupConversations([
        original,
        { ...original, id: "2", threadId: "501" },
        { ...original, sourceKey: "p:100" },
        { ...original, sourceKey: "other:100" },
      ]),
    ).toHaveLength(4);
    expect(
      groupConversations([
        { ...original, threadId: "0" },
        { ...original, id: "2", threadId: "" },
      ]),
    ).toHaveLength(2);
  });
  it("keeps a stable row ID when a new reply arrives", () => {
    expect(groupConversations([original])[0].id).toBe(
      groupConversations([reply])[0].id,
    );
  });
});
function setup(members = [reply, original], hasMore = false) {
  call.mockImplementation(async (c: Command) =>
    c.op === "list"
      ? { messages: members, hasMore }
      : c.op === "detail"
        ? { html: `<p>${c.messageId}</p><img src="${image}">`, attachments: [] }
        : null,
  );
  const callbacks = {
    onActive: vi.fn(),
    onCount: vi.fn(),
    onReply: vi.fn(),
    onFailure: vi.fn(),
    onToast: vi.fn(),
  };
  const props = {
    account,
    row: { ...reply, id: "thread:500", remoteId: "2", threadCount: 2 },
    dark: false,
    busy: false,
    drafts: false,
    ...callbacks,
  };
  return { props, ...callbacks };
}
describe("conversation reader", () => {
  it("shows the latest card in oldest-first mode before a slow image body finishes loading", async () => {
    localStorage.setItem(CONVERSATION_ORDER_KEY, "oldest");
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const state = setup();
    let finish!: (detail: Detail) => void;
    call.mockImplementation(async (c: Command) =>
      c.op === "list"
        ? { messages: [reply, original], hasMore: false }
        : new Promise<Detail>((resolve) => {
            finish = resolve;
          }),
    );
    render(<ConversationReader {...state.props} />);
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(screen.getByText("Opening message…")).toBeTruthy();
    finish({ html: "<p>Loaded</p>", attachments: [] });
    await screen.findByTitle("Email content");
  });
  it("defaults to newest first and distinguishes latest from an older unread message", async () => {
    const state = setup([
      { ...reply, unread: false },
      { ...original, unread: true },
    ]);
    render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    const cards = screen.getAllByRole("article");
    expect(cards[0].getAttribute("aria-label")).toBe(
      "Latest message from Jamie",
    );
    expect(within(cards[0]).getByText("Latest")).toBeTruthy();
    expect(within(cards[0]).getByText("Message 2 of 2")).toBeTruthy();
    expect(within(cards[1]).getByText("Unread")).toBeTruthy();
    expect(within(cards[1]).getByText("Earlier")).toBeTruthy();
    expect(within(cards[1]).queryByText("Latest")).toBeNull();
    expect(screen.getByText("Latest message at the top")).toBeTruthy();
  });
  it("reverses display order without changing sequence, selection, bodies or requests and remembers it", async () => {
    const state = setup();
    const view = render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    const count = call.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Conversation order"), {
      target: { value: "oldest" },
    });
    const cards = screen.getAllByRole("article");
    expect(cards[0].getAttribute("aria-label")).toBe(
      "Earlier message from Alex",
    );
    expect(within(cards[0]).getByText("Message 1 of 2")).toBeTruthy();
    expect(within(cards[1]).getByText("Latest")).toBeTruthy();
    expect(call).toHaveBeenCalledTimes(count);
    expect(state.onActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "2" }),
      expect.objectContaining({ html: expect.stringContaining(image) }),
    );
    expect(localStorage.getItem(CONVERSATION_ORDER_KEY)).toBe("oldest");
    view.unmount();
    render(<ConversationReader {...state.props} />);
    expect(
      (screen.getByLabelText("Conversation order") as HTMLSelectElement).value,
    ).toBe("oldest");
    await screen.findByTitle("Email content");
  });
  it("opens the latest cross-folder reply even when the clicked row is an older Sent message", async () => {
    const state = setup();
    render(<ConversationReader {...state.props} row={original} />);
    await screen.findByTitle("Email content");
    expect(call.mock.calls.find(([c]) => c.op === "detail")?.[0]).toMatchObject(
      { messageId: "2", folderId: "1" },
    );
    expect(
      screen
        .getByRole("article", { name: "Latest message from Jamie" })
        .querySelector('[aria-expanded="true"]'),
    ).toBeTruthy();
  });
  it("returns from an older reply target to latest using cached content and preserves the chosen order", async () => {
    localStorage.setItem(CONVERSATION_ORDER_KEY, "oldest");
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const state = setup();
    render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    fireEvent.click(
      within(
        screen.getByRole("article", { name: "Earlier message from Alex" }),
      ).getByRole("button", { expanded: false }),
    );
    await waitFor(() =>
      expect(state.onActive).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "1" }),
        expect.objectContaining({ html: expect.stringContaining(image) }),
      ),
    );
    expect(
      screen.getByText("Viewing an earlier message. Reply uses that message."),
    ).toBeTruthy();
    expect(screen.getByText("Reply to this earlier message")).toBeTruthy();
    const count = call.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Go to latest" }));
    expect(state.onActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "2" }),
      expect.objectContaining({ html: expect.stringContaining(image) }),
    );
    expect(call).toHaveBeenCalledTimes(count);
    expect(screen.getByText("Latest message at the bottom")).toBeTruthy();
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });
  it("does not invent sequence numbers or original-message labels for a partial page", async () => {
    const state = setup([reply, original], true);
    render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    expect(screen.queryByText("Message 1 of 2")).toBeNull();
    expect(
      screen.getByText("Earlier message", {
        selector: ".conversation-sequence",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Load older messages" }),
    ).toBeTruthy();
  });
  it("keeps the older message being read when a new latest reply arrives", async () => {
    const state = setup();
    const view = render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    fireEvent.click(
      within(
        screen.getByRole("article", { name: "Earlier message from Alex" }),
      ).getByRole("button", { expanded: false }),
    );
    await waitFor(() =>
      expect(state.onActive).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "1" }),
        expect.anything(),
      ),
    );
    const newest = { ...reply, id: "3", time: 3, sender: "Taylor" };
    call.mockImplementation(async (c: Command) =>
      c.op === "list"
        ? { messages: [newest, reply, original], hasMore: false }
        : {
            html: `<p>${"messageId" in c ? c.messageId : ""}</p>`,
            attachments: [],
          },
    );
    view.rerender(
      <ConversationReader
        {...state.props}
        row={{ ...newest, id: "thread:500", remoteId: "3" }}
        revision={1}
      />,
    );
    await screen.findByText("Message 3 of 3");
    expect(screen.getAllByRole("article")[0].getAttribute("aria-label")).toBe(
      "Latest message from Taylor",
    );
    expect(state.onActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "1" }),
      expect.anything(),
    );
    expect(
      screen.getByText("Viewing an earlier message. Reply uses that message."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to latest" }));
    await waitFor(() =>
      expect(state.onActive).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "3" }),
        expect.objectContaining({ html: "<p>3</p>" }),
      ),
    );
  });
  it("shows missing dates honestly and preserves provider ordering without guessing from IDs", async () => {
    const missing = { ...reply, id: "9999999999999999999", time: 0 };
    expect(newestMessages([missing, original])[0]).toBe(missing);
    const state = setup([missing, original]);
    render(<ConversationReader {...state.props} row={missing} />);
    await screen.findByTitle("Email content");
    expect(screen.getByText("Time unavailable")).toBeTruthy();
    expect(screen.queryByText("Message 1 of 2")).toBeNull();
  });
  it("gracefully defaults when local UI preference storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("Unavailable");
    });
    expect(readConversationOrder()).toBe("newest");
  });
  it("loads cross-folder history, renders latest inline image, expands original and replies from that exact member", async () => {
    const state = setup();
    render(<ConversationReader {...state.props} />);
    const frame = await screen.findByTitle("Email content");
    expect(frame.getAttribute("srcdoc")).toContain(image);
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(call.mock.calls[0][0]).toMatchObject({
      op: "list",
      threadId: "500",
      profileId: "p",
      accountId: "100",
    });
    expect(call.mock.calls[0][0].folderId).toBeUndefined();
    expect(screen.getByText("2 messages in this conversation")).toBeTruthy();
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await screen.findByTitle("Email content from Alex");
    expect(call.mock.calls.filter(([c]) => c.op === "detail")).toHaveLength(2);
    fireEvent.click(
      within(
        screen.getByRole("article", { name: "Earlier message from Alex" }),
      ).getByRole("button", { name: "Reply" }),
    );
    expect(state.onReply).toHaveBeenLastCalledWith(
      "reply",
      expect.objectContaining({ id: "1", folderId: "2" }),
      expect.objectContaining({ html: expect.stringContaining(image) }),
    );
    expect(state.onFailure).not.toHaveBeenCalled();
  });
  it("does not request individual bodies for collapsed history and reuses expanded bodies", async () => {
    const state = setup();
    render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    expect(call.mock.calls.filter(([c]) => c.op === "detail")).toHaveLength(1);
    const older = within(
      screen.getByRole("article", { name: "Earlier message from Alex" }),
    ).getByRole("button", { expanded: false });
    fireEvent.click(older);
    await screen.findByTitle("Email content");
    await waitFor(() =>
      expect(call.mock.calls.filter(([c]) => c.op === "detail")).toHaveLength(
        2,
      ),
    );
    fireEvent.click(older);
    fireEvent.click(older);
    expect(call.mock.calls.filter(([c]) => c.op === "detail")).toHaveLength(2);
  });
  it("shows bounded pagination for long conversations", async () => {
    const state = setup([reply], true);
    render(<ConversationReader {...state.props} />);
    await screen.findByTitle("Email content");
    fireEvent.click(
      screen.getByRole("button", { name: "Load older messages" }),
    );
    await waitFor(() =>
      expect(
        call.mock.calls.some(([c]) => c.op === "list" && c.start === 41),
      ).toBe(true),
    );
  });
  it("stops after a rejected thread read, reports it and does not fetch a body", async () => {
    const state = setup();
    call.mockRejectedValue(Error("Zoho paused this connection"));
    render(<ConversationReader {...state.props} />);
    await screen.findByText("Zoho paused this connection");
    expect(call).toHaveBeenCalledTimes(1);
    expect(state.onFailure).toHaveBeenCalledTimes(1);
  });
  it("discards late bodies when switching to a different mailbox", async () => {
    const state = setup();
    let resolve!: (d: Detail) => void;
    call.mockImplementation(async (c: Command) =>
      c.op === "list"
        ? { messages: [reply], hasMore: false }
        : new Promise<Detail>((r) => {
            resolve = r;
          }),
    );
    const view = render(<ConversationReader {...state.props} />);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    view.unmount();
    resolve({ html: "<p>old private body</p>", attachments: [] });
    expect(
      state.onActive.mock.calls.some(([, d]) =>
        d?.html?.includes("old private"),
      ),
    ).toBe(false);
  });
});
