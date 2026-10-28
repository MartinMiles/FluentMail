// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { groupConversations, conversationKey } from "../src/conversations";
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
    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]);
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
    const older = screen.getByRole("button", {
      name: /Alex alex@example.test/,
    });
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
