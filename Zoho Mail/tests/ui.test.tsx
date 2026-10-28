// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoMail } from "../src/demo";
import {
  type Command,
  type Snapshot,
  DEFAULT_PREFERENCES,
} from "../src/shared";
import { APP_INFO } from "../src/version";
const { mockCall, mockSubscribe } = vi.hoisted(() => ({
  mockCall: vi.fn(),
  mockSubscribe: vi.fn(),
}));
vi.mock("../src/api", () => ({ call: mockCall, subscribe: mockSubscribe }));
import App from "../src/App";
let backend: DemoMail;
beforeEach(() => {
  localStorage.clear();
  backend = new DemoMail();
  mockSubscribe.mockImplementation((listener) => backend.onEvent(listener));
  // JSDOM has no layout. Supply geometry used by ProseMirror's caret/scroll handling.
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
  mockCall.mockReset();
  mockCall.mockImplementation(async (c: Command) => {
    const r = await backend.invoke(c);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function sendAfterGrace() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Cancel send" })).toBeTruthy();
  expect(mockCall.mock.calls.filter(([c]) => c.op === "send")).toHaveLength(0);
  await waitFor(
    () =>
      expect(mockCall.mock.calls.filter(([c]) => c.op === "send")).toHaveLength(
        1,
      ),
    { timeout: 7000 },
  );
}
async function inbox() {
  render(<App />);
  await screen.findByRole("button", {
    name: "Open A little breathing room for your inbox",
  });
  return userEvent.setup();
}
describe("offline inbox workflows", () => {
  it("keeps a pasted image draft locally and clearly blocks unsupported live delivery", async () => {
    const normal = mockCall.getMockImplementation()!;
    mockCall.mockImplementation(async (c: Command) => {
      const value = await normal(c);
      return c.op === "snapshot" ? { ...value, demo: false } : value;
    });
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      screen.getByRole("button", { name: "Compose from alex@example.test" }),
    );
    await user.type(
      screen.getByLabelText("To recipients"),
      "jamie@example.test",
    );
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [new File([bytes], "fixture.png", { type: "image/png" })],
        getData: () => "",
      },
    });
    fireEvent(screen.getByLabelText("Message body"), event);
    await waitFor(() =>
      expect(
        screen.getByLabelText("Message body").querySelector("img[src]"),
      ).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Message body").getAttribute("contenteditable"),
      ).toBe("true"),
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Inline image delivery is not working",
    );
    expect(mockCall.mock.calls.some(([c]) => c.op === "send")).toBe(false);
    expect(screen.queryByRole("button", { name: "Cancel send" })).toBeNull();
    expect(
      [...backend.drafts.values()].some((d) =>
        d.body.includes("data:image/png;base64,"),
      ),
    ).toBe(true);
  });
  it("shows a persisted mailbox rejection, cancels stale loading and leaves the other profile usable", async () => {
    const user = await inbox();
    let resolveFolders: (value: unknown) => void = () => {};
    const normal = mockCall.getMockImplementation()!;
    mockCall.mockImplementation(async (c: Command) =>
      c.op === "folders" && c.profileId === "other-demo"
        ? new Promise((resolve) => {
            resolveFolders = resolve;
          })
        : normal(c),
    );
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "other-demo:100",
    );
    await screen.findByText("Loading mail…");
    const snapshot = (await normal({ op: "snapshot" })) as Snapshot;
    snapshot.demo = false;
    snapshot.profiles = snapshot.profiles.map((p) =>
      p.id === "other-demo"
        ? {
            ...p,
            connected: false,
            paused:
              "Zoho rejected the operation (400). Review the operation and permissions; no retry was made.",
          }
        : p,
    );
    await act(async () => backend.emit({ type: "connection", snapshot }));
    await waitFor(() => expect(screen.queryByText("Loading mail…")).toBeNull());
    expect(screen.getByRole("alert").textContent).toContain(
      "alex@studio.example.test: Zoho rejected",
    );
    expect(
      (screen.getByRole("button", { name: /Compose/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("Mailbox disconnected")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "demo:100",
    );
    await screen.findByRole("button", {
      name: "Open A little breathing room for your inbox",
    });
    expect(
      (screen.getByRole("button", { name: /Compose/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => resolveFolders([]));
    expect(
      screen.getByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    ).toBeTruthy();
  });
  it("shows a single-line message list without previews or metadata rows", async () => {
    await inbox();
    const row = screen
      .getByRole("button", {
        name: "Open A little breathing room for your inbox",
      })
      .closest(".message-row")!;
    expect(row.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(row.querySelector(".row-top strong")?.textContent).toBeTruthy();
    expect(row.querySelector(".row-subject")?.textContent).toBe(
      "A little breathing room for your inbox",
    );
    expect(row.querySelector("p, time, .row-labels, .row-star")).toBeNull();
  });
  it("Delete moves the selected message to Trash but does not intercept typing in search", async () => {
    const user = await inbox();
    await user.click(
      screen.getByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    );
    await screen.findByTitle("Email content");
    const search = screen.getByRole("textbox", { name: "Search mail" });
    await user.click(search);
    await user.keyboard("{Delete}");
    expect(
      mockCall.mock.calls.some(
        ([c]) => c.op === "action" && c.action === "move",
      ),
    ).toBe(false);
    await user.click(
      screen.getByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    );
    await user.keyboard("{Delete}");
    await waitFor(() =>
      expect(
        mockCall.mock.calls.some(
          ([c]) => c.op === "action" && c.action === "move" && c.target === "6",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Open A little breathing room for your inbox",
        }),
      ).toBeNull(),
    );
  });
  it("Delete works from a checked row in unified view using the originating mailbox", async () => {
    const user = await inbox();
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "unified",
    );
    const checkbox = await screen.findByRole("checkbox", {
      name: "Select Studio review — a different business",
    });
    await user.click(checkbox);
    await user.keyboard("{Delete}");
    await waitFor(() =>
      expect(
        mockCall.mock.calls.some(
          ([c]) =>
            c.op === "action" &&
            c.action === "move" &&
            c.profileId === "other-demo" &&
            c.accountId === "100" &&
            c.target === "6",
        ),
      ).toBe(true),
    );
  });
  it("loads mailbox-scoped recipient suggestions and offers Send now to the left of Cancel", async () => {
    const user = await inbox();
    const normal = mockCall.getMockImplementation()!;
    mockCall.mockImplementation(async (c: Command) =>
      c.op === "recipientHistory" ? ["jamie@example.test"] : normal(c),
    );
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      screen.getByRole("button", { name: "Compose from alex@example.test" }),
    );
    await user.type(screen.getByLabelText("To recipients"), "ja");
    await user.click(
      await screen.findByRole("option", { name: "jamie@example.test" }),
    );
    await user.type(screen.getByLabelText("Message body"), "Send now test");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const now = screen.getByRole("button", { name: "Send now" });
    expect(now.nextElementSibling).toBe(
      screen.getByRole("button", { name: "Cancel send" }),
    );
    expect(mockCall.mock.calls.some(([c]) => c.op === "send")).toBe(false);
    await user.click(now);
    await waitFor(() =>
      expect(mockCall.mock.calls.filter(([c]) => c.op === "send")).toHaveLength(
        1,
      ),
    );
    expect(
      mockCall.mock.calls.find(([c]) => c.op === "send")![0].compose.to,
    ).toBe("jamie@example.test, ");
  });
  it("Cancel send returns to editing and never submits the cancelled message", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      screen.getByRole("button", { name: "Compose from alex@example.test" }),
    );
    await user.type(
      screen.getByLabelText("To recipients"),
      "jamie@example.test",
    );
    await user.type(
      screen.getByLabelText("Message body"),
      "Keep editing this message",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Cancel send" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel send" }));
    expect(screen.queryByRole("button", { name: "Cancel send" })).toBeNull();
    expect(
      screen.getByLabelText("Message body").getAttribute("contenteditable"),
    ).toBe("true");
    expect(screen.getByLabelText("Message body").textContent).toBe(
      "Keep editing this message",
    );
    expect(mockCall.mock.calls.some(([c]) => c.op === "send")).toBe(false);
  });
  it("pastes an image into the body and a clipboard file into attachments", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      screen.getByRole("button", { name: "Compose from alex@example.test" }),
    );
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const paste = (file: File) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [file], types: ["Files"], getData: () => "" },
      });
      fireEvent(screen.getByLabelText("Message body"), event);
    };
    paste(new File([bytes], "image.png", { type: "image/png" }));
    await waitFor(() =>
      expect(
        screen
          .getByLabelText("Message body")
          .querySelector("img[src]")
          ?.getAttribute("src"),
      ).toMatch(/^data:image\/png;base64,/),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Message body").getAttribute("contenteditable"),
      ).toBe("true"),
    );
    paste(
      new File(["fixture pdf bytes"], "report.pdf", {
        type: "application/pdf",
      }),
    );
    await screen.findByText("report.pdf");
    expect(
      mockCall.mock.calls.filter(([c]) => c.op === "importPaste"),
    ).toHaveLength(2);
    expect(mockCall.mock.calls.some(([c]) => c.op === "send")).toBe(false);
    await user.type(
      screen.getByLabelText("To recipients"),
      "jamie@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(screen.getByRole("button", { name: "Send now" }));
    await waitFor(() =>
      expect(mockCall.mock.calls.filter(([c]) => c.op === "send")).toHaveLength(
        1,
      ),
    );
    const sent = mockCall.mock.calls.find(([c]) => c.op === "send")![0].compose;
    expect(sent.format).toBe("html");
    expect(sent.body).toMatch(/<img[^>]+src="data:image\/png;base64,/);
    expect(sent.attachments[0].name).toBe("report.pdf");
  });
  it("shows the creator and package version in About", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: "About Fluent Mail" }));
    const about = screen.getByRole("dialog", { name: "About Fluent Mail" });
    expect(about.textContent).toContain(APP_INFO.version);
    expect(about.textContent).toContain("Martin Miles");
    expect(about.textContent).toContain("martin@safetyfluent.com");
  });
  it("updates the unified inbox without closing the current message or draft", async () => {
    const user = await inbox();
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "unified",
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    );
    await screen.findByTitle("Email content");
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    await screen.findByRole("dialog", { name: "Reply" });
    const before = screen.getByLabelText("Message body").textContent;
    await act(async () => {
      await backend.invoke({ op: "demoArrival" });
    });
    expect(screen.getByRole("dialog", { name: "Reply" })).toBeTruthy();
    expect(screen.getByLabelText("Message body").textContent).toBe(before);
    expect(
      screen.getByRole("button", {
        name: "Open New arrival — automatic inbox update",
      }),
    ).toBeTruthy();
    expect(screen.getByTitle("Email content")).toBeTruthy();
  });
  it("flushes an unsaved rich draft before acknowledging an explicit exit", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      screen.getByRole("button", { name: "Compose from alex@example.test" }),
    );
    await user.type(
      screen.getByLabelText("Message body"),
      "Exit should save this",
    );
    await act(async () =>
      backend.emit({ type: "prepare-exit", requestId: "fixture-exit" }),
    );
    await waitFor(() =>
      expect(
        mockCall.mock.calls.some(
          ([c]) =>
            c.op === "quitReady" && c.requestId === "fixture-exit" && !c.error,
        ),
      ).toBe(true),
    );
    expect(
      [...backend.drafts.values()].some((d) =>
        d.body.includes("Exit should save this"),
      ),
    ).toBe(true);
  });
  it("closes Settings and selects the newly connected mailbox on success", async () => {
    let live: Snapshot = {
      demo: false,
      profiles: [],
      accounts: [],
      preferences: DEFAULT_PREFERENCES,
    };
    const normal = mockCall.getMockImplementation()!;
    mockCall.mockImplementation(async (c: Command) => {
      if (c.op === "snapshot") return live;
      if (c.op === "connect") {
        live = {
          ...live,
          profiles: [
            {
              id: "demo",
              email: c.email,
              region: "US",
              connected: true,
              paused: null,
            },
          ],
          accounts: [backend.accounts[0]],
        };
        return live;
      }
      return normal(c);
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Connect your Zoho account" }),
    );
    await user.type(
      screen.getByLabelText("Mailbox email"),
      "alex@example.test",
    );
    await user.type(screen.getByLabelText("Client ID"), "fixture-client");
    await user.type(screen.getByLabelText("Client secret"), "fixture-secret");
    await user.type(
      screen.getByLabelText("Fresh authorization code"),
      "fixture-code",
    );
    await user.click(
      screen.getByRole("button", { name: "Connect new account" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Settings & accounts" }),
      ).toBeNull(),
    );
    expect(await screen.findByText(/Connected alex@example.test/)).toBeTruthy();
    expect(
      mockCall.mock.calls.filter(([c]) => c.op === "connect"),
    ).toHaveLength(1);
  });
  it("keeps failed connection feedback visible without automatically retrying", async () => {
    mockCall.mockImplementation(async (c: Command) => {
      if (c.op === "snapshot")
        return { demo: false, profiles: [], accounts: [] };
      if (c.op === "connect") throw new Error("The fixture code was rejected.");
      throw new Error("Unexpected fixture command");
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Connect your Zoho account" }),
    );
    await user.type(
      screen.getByLabelText("Mailbox email"),
      "alex@example.test",
    );
    await user.type(screen.getByLabelText("Client ID"), "fixture-client");
    await user.type(screen.getByLabelText("Client secret"), "fixture-secret");
    await user.type(
      screen.getByLabelText("Fresh authorization code"),
      "fixture-code",
    );
    await user.click(
      screen.getByRole("button", { name: "Connect new account" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "fixture code was rejected",
    );
    expect(
      screen.getByRole("dialog", { name: "Settings & accounts" }),
    ).toBeTruthy();
    expect(
      mockCall.mock.calls.filter(([c]) => c.op === "connect"),
    ).toHaveLength(1);
  });
  it("loads a safe reading pane and replies to the correct sender", async () => {
    const user = await inbox();
    await user.click(
      screen.getByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTitle("Email content").getAttribute("sandbox")).toBe(
        "",
      ),
    );
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Reply" });
    expect(
      within(dialog).getByLabelText("To recipients").parentElement?.textContent,
    ).toContain("jamie@example.test");
    expect(
      (within(dialog).getByLabelText("Subject") as HTMLInputElement).value,
    ).toBe("Re: A little breathing room for your inbox");
  });
  it("keeps account contents isolated when switching mailboxes", async () => {
    const user = await inbox();
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "demo:200",
    );
    await screen.findByRole("button", {
      name: "Open Welcome to the team inbox",
    });
    expect(
      screen.queryByRole("button", { name: "Open Thursday works for me" }),
    ).toBeNull();
    expect(screen.queryByTitle("Email content")).toBeNull();
  });
  it("one Send click waits five seconds, sends once, and appears in Sent", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Compose from alex@example.test",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    await user.type(
      within(dialog).getByLabelText("To recipients"),
      "jamie@example.test",
    );
    await user.type(
      within(dialog).getByLabelText("Subject"),
      "Offline workflow test",
    );
    await user.type(
      within(dialog).getByLabelText("Message body"),
      "A complete fixture message.",
    );
    await sendAfterGrace();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockCall.mock.calls.filter(([c]) => c.op === "send")).toHaveLength(
      1,
    );
    await user.click(screen.getByRole("button", { name: "Sent" }));
    await screen.findByRole("button", { name: "Open Offline workflow test" });
  });
  it("preserves the composer and message after send failure", async () => {
    const user = await inbox();
    const normal = mockCall.getMockImplementation()!;
    mockCall.mockImplementation(async (c: Command) => {
      if (c.op === "send") throw new Error("Simulated connection stopped.");
      return normal(c);
    });
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Compose from alex@example.test",
      }),
    );
    await user.type(
      screen.getByLabelText("To recipients"),
      "jamie@example.test",
    );
    await user.type(
      screen.getByLabelText("Message body"),
      "Do not lose this draft",
    );
    await sendAfterGrace();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Message body").textContent).toBe(
      "Do not lose this draft",
    );
    await waitFor(() =>
      expect(
        [...backend.drafts.values()].find((d) => d.from === "alex@example.test")
          ?.body,
      ).toContain("Do not lose this draft"),
    );
  });
  it("moves selected messages to Trash and can restore them", async () => {
    const user = await inbox();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Thursday works for me" }),
    );
    await user.click(screen.getByRole("button", { name: "Move to Trash" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Open Thursday works for me" }),
      ).toBeNull(),
    );
    await user.click(screen.getByRole("button", { name: "Trash" }));
    await user.click(
      await screen.findByRole("button", { name: "Open Thursday works for me" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Move messages to folder"),
      "1",
    );
    await user.click(screen.getByRole("button", { name: /^Inbox/ }));
    await screen.findByRole("button", { name: "Open Thursday works for me" });
  });
  it("searches only on submission and shows a useful empty state", async () => {
    const user = await inbox();
    const before = mockCall.mock.calls.filter(([c]) => c.op === "list").length;
    await user.type(
      screen.getByLabelText("Search mail"),
      "subject:no-such-message",
    );
    expect(mockCall.mock.calls.filter(([c]) => c.op === "list")).toHaveLength(
      before,
    );
    await user.keyboard("{Enter}");
    await screen.findByText("No matches");
  });
  it("creates a folder and a label through real UI forms", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("Name"), "Research");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Research" });
    await user.click(screen.getByRole("button", { name: "New label" }));
    await user.type(screen.getByLabelText("Name"), "Follow up");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Follow up" });
  });
  it("never contacts any real provider in demo mode", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await inbox();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("keeps keyboard input focused in a modal while it rerenders", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Compose from alex@example.test",
      }),
    );
    const subject = screen.getByLabelText("Subject");
    await user.type(subject, "Typing stays here");
    expect(document.activeElement).toBe(subject);
    expect((subject as HTMLInputElement).value).toBe("Typing stays here");
  });
  it("combines independent authorizations and replies through the original mailbox", async () => {
    const user = await inbox();
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "unified",
    );
    await screen.findByRole("button", {
      name: "Open Studio review — a different business",
    });
    expect(
      screen.getByRole("button", { name: "Open Welcome to the team inbox" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Thursday works for me" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Open Studio review — a different business",
      }),
    );
    await screen.findByTitle("Email content");
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    expect((screen.getByLabelText("From") as HTMLSelectElement).value).toBe(
      "alex@studio.example.test",
    );
    await sendAfterGrace();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const sent = mockCall.mock.calls.find(([c]) => c.op === "send")![0];
    expect(sent).toMatchObject({
      profileId: "other-demo",
      accountId: "100",
      compose: {
        from: "alex@studio.example.test",
        to: "partner@studio.example.test",
        replyId: "3000",
      },
    });
  });
  it("routes actions to the source profile even when two profiles have the same account ID", async () => {
    const user = await inbox();
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "unified",
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Open Studio review — a different business",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Move to Trash" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Open Studio review — a different business",
        }),
      ).toBeNull(),
    );
    expect(backend.messages.find((m) => m.id === "3000")?.folderId).toBe("6");
    expect(backend.messages.find((m) => m.id === "1000")?.folderId).toBe("1");
  });
  it("lets new messages explicitly choose a different sending account", async () => {
    const user = await inbox();
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Compose from alex@studio.example.test",
      }),
    );
    expect((screen.getByLabelText("From") as HTMLSelectElement).value).toBe(
      "alex@studio.example.test",
    );
    await user.type(screen.getByLabelText("Message body"), "Studio-only draft");
    await waitFor(() =>
      expect(
        [...backend.drafts.values()].find(
          (d) => d.from === "alex@studio.example.test",
        )?.body,
      ).toContain("Studio-only draft"),
    );
    expect(
      [...backend.drafts.values()].find((d) => d.from === "alex@example.test"),
    ).toBeUndefined();
  });
  it("honors Reply-To instead of accidentally replying to an automated sender", async () => {
    const user = await inbox();
    const normal = mockCall.getMockImplementation()!;
    mockCall.mockImplementation(async (c: Command) =>
      c.op === "headers" ? "Reply-To: Help <help@example.test>\r\n" : normal(c),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    );
    await screen.findByTitle("Email content");
    await user.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    await screen.findByRole("dialog", { name: "Reply" });
    expect(
      screen.getByLabelText("To recipients").parentElement?.textContent,
    ).toContain("help@example.test");
  });
  it("ignores a stale message-body response after switching mailboxes", async () => {
    const user = await inbox();
    const normal = mockCall.getMockImplementation()!;
    let resolveBody: (value: unknown) => void = () => {};
    mockCall.mockImplementation(async (c: Command) =>
      c.op === "detail"
        ? new Promise((r) => {
            resolveBody = r;
          })
        : normal(c),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Open A little breathing room for your inbox",
      }),
    );
    await user.selectOptions(
      screen.getByLabelText("Switch mailbox"),
      "other-demo:100",
    );
    await screen.findByRole("button", {
      name: "Open Studio review — a different business",
    });
    resolveBody({
      html: "<p>Old account confidential fixture</p>",
      attachments: [],
    });
    await waitFor(() =>
      expect(screen.queryByTitle("Email content")).toBeNull(),
    );
  });
});
