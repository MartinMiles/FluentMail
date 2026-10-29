// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "../src/Composer";
import {
  blankCompose,
  type Compose,
  type Command,
  type Account,
} from "../src/shared";
import { flushActiveDraft } from "../src/draftFlush";
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/api", () => ({ call }));
const account: Account = {
  id: "100",
  profileId: "p",
  email: "alex@example.test",
  name: "Alex",
  aliases: ["alex@example.test"],
};
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  HTMLElement.prototype.scrollIntoView = () => {};
  document.elementFromPoint = () => document.body;
  call.mockReset();
  call.mockImplementation(async (c: Command) =>
    c.op === "recipientHistory"
      ? []
      : c.op === "signatures"
        ? [{ id: "1", name: "Company", content: "<p>Signature</p>" }]
        : true,
  );
});
afterEach(cleanup);
function open(initial: Compose = blankCompose(account.email)) {
  const closed = vi.fn(),
    sent = vi.fn();
  render(
    <Composer
      account={account}
      initial={initial}
      demo={true}
      onClose={closed}
      onSent={sent}
    />,
  );
  return { closed, sent, user: userEvent.setup() };
}
describe("composer regression review", () => {
  it("persists clearing of an existing draft before closing", async () => {
    const initial = {
      ...blankCompose(account.email),
      format: "html" as const,
      body: "<p>Old saved draft</p>",
    };
    const s = open(initial);
    await s.user.clear(screen.getByRole("textbox", { name: "Message body" }));
    await s.user.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(s.closed).toHaveBeenCalled());
    expect(
      call.mock.calls.some(
        ([c]) =>
          c.op === "saveLocalDraft" &&
          c.compose === null &&
          c.draftId === initial.id,
      ),
    ).toBe(true);
  });
  it("keeps editing open when a final draft save fails", async () => {
    const s = open({ ...blankCompose(account.email), body: "Keep this text" });
    call.mockImplementation(async (c: Command) => {
      if (c.op === "saveLocalDraft") throw Error("Disk unavailable");
      return [];
    });
    await s.user.click(screen.getByRole("button", { name: "Close dialog" }));
    await screen.findByText("Disk unavailable");
    expect(s.closed).not.toHaveBeenCalled();
  });
  it("rejects unavailable restored attachments before starting a send countdown", async () => {
    const s = open({
      ...blankCompose(account.email),
      to: "jamie@example.test",
      attachments: [
        { id: "lost", name: "Lost.txt", size: 10, unavailable: true },
      ],
    });
    expect(screen.getByText("Reattach before sending")).toBeTruthy();
    await s.user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(
      "Remove and reattach the unavailable files before sending.",
    );
    expect(screen.queryByRole("button", { name: "Cancel send" })).toBeNull();
    expect(call.mock.calls.some(([c]) => c.op === "send")).toBe(false);
  });
  it("rejects an extra attachment before it can make the draft unsavable", async () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      id: "f" + i,
      name: "File" + i + ".txt",
      size: 1,
    }));
    const s = open({ ...blankCompose(account.email), attachments: files });
    call.mockImplementation(async (c: Command) =>
      c.op === "pickFiles"
        ? [{ id: "extra", name: "Extra.txt", size: 1 }]
        : c.op === "recipientHistory"
          ? []
          : true,
    );
    await s.user.click(screen.getByRole("button", { name: "Attach files" }));
    await screen.findByText("Use at most 20 file attachments.");
    expect(screen.getAllByRole("button", { name: /Remove File/ })).toHaveLength(
      20,
    );
    expect(screen.queryByText("Extra.txt")).toBeNull();
    expect(
      call.mock.calls.some(
        ([c]) => c.op === "releaseFiles" && c.ids.includes("extra"),
      ),
    ).toBe(true);
  });
  it("blocks exit and disables Close while a file selection is still pending", async () => {
    let finish!: (files: unknown[]) => void;
    call.mockImplementation(async (c: Command) =>
      c.op === "pickFiles"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : c.op === "recipientHistory"
          ? []
          : true,
    );
    const s = open();
    await s.user.click(screen.getByRole("button", { name: "Attach files" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Close dialog",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await expect(flushActiveDraft()).rejects.toThrow(/attachment or paste/);
    expect(s.closed).not.toHaveBeenCalled();
    await act(async () => finish([]));
    await flushActiveDraft();
  });
  it("locks the signature insertion control during the five-second countdown", async () => {
    const s = open({
      ...blankCompose(account.email),
      to: "jamie@example.test",
      body: "Text",
    });
    await s.user.click(screen.getByRole("button", { name: "Signatures" }));
    const signature = await screen.findByLabelText("Insert signature");
    await s.user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("button", { name: "Cancel send" });
    expect((signature as HTMLSelectElement).disabled).toBe(true);
    await s.user.click(screen.getByRole("button", { name: "Cancel send" }));
    expect((signature as HTMLSelectElement).disabled).toBe(false);
  });
  it("applies link text with Enter without implicitly submitting the email", async () => {
    const s = open({
      ...blankCompose(account.email),
      to: "jamie@example.test",
      body: "Text",
    });
    await s.user.click(
      screen.getByRole("button", { name: "Insert link (Ctrl+K)" }),
    );
    await s.user.type(
      screen.getByLabelText("Link address"),
      "https://example.test",
    );
    await s.user.type(
      screen.getByLabelText("Text to display"),
      "Website{Enter}",
    );
    expect(screen.queryByLabelText("Link address")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel send" })).toBeNull();
    expect(call.mock.calls.some(([c]) => c.op === "send")).toBe(false);
    expect(
      screen
        .getByRole("textbox", { name: "Message body" })
        .querySelector("a")
        ?.getAttribute("href"),
    ).toBe("https://example.test");
  });
  it("Escape in the link text field closes that editor, not the composer", async () => {
    const s = open();
    await s.user.click(
      screen.getByRole("button", { name: "Insert link (Ctrl+K)" }),
    );
    await s.user.click(screen.getByLabelText("Text to display"));
    await s.user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Link address")).toBeNull();
    expect(screen.getByRole("dialog", { name: "New message" })).toBeTruthy();
    expect(s.closed).not.toHaveBeenCalled();
  });
});
