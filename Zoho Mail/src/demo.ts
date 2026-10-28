import {
  type Account,
  type Command,
  type Compose,
  type Detail,
  type Folder,
  type Label,
  type Message,
  type Result,
  PAGE_SIZE,
  commandSchema,
  validateRecipients,
  DEFAULT_PREFERENCES,
  type Preferences,
  type AppEvent,
  type ListResult,
} from "./shared";
import { validEditorImage } from "./htmlPolicy";

export class DemoMail {
  preferences: Preferences = { ...DEFAULT_PREFERENCES };
  private listeners = new Set<(event: AppEvent) => void>();
  onEvent(listener: (event: AppEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: AppEvent) {
    for (const listener of this.listeners) listener(event);
  }
  connectedAccounts() {
    return this.accounts;
  }
  isConnected(_profileId: string) {
    return true;
  }
  isBusy() {
    return false;
  }
  async pollInbox(account: Account, start = 1): Promise<ListResult> {
    return this.execute({
      op: "list",
      profileId: account.profileId,
      accountId: account.id,
      folderId: "1",
      filter: "all",
      start,
    }) as Promise<ListResult>;
  }
  readonly accounts: Account[] = [
    {
      id: "100",
      profileId: "demo",
      email: "alex@example.test",
      name: "Alex Morgan",
      aliases: ["alex@example.test", "hello@example.test"],
    },
    {
      id: "200",
      profileId: "demo",
      email: "team@example.test",
      name: "Team inbox",
      aliases: ["team@example.test"],
    },
    {
      id: "100",
      profileId: "other-demo",
      email: "alex@studio.example.test",
      name: "Alex · Studio",
      aliases: ["alex@studio.example.test"],
    },
  ];
  folders: Folder[] = [
    { id: "1", name: "Inbox", path: "/Inbox", type: "Inbox" },
    { id: "2", name: "Sent", path: "/Sent", type: "Sent" },
    { id: "3", name: "Drafts", path: "/Drafts", type: "Drafts" },
    { id: "4", name: "Archive", path: "/Archive", type: "Archive" },
    { id: "5", name: "Spam", path: "/Spam", type: "Spam" },
    { id: "6", name: "Trash", path: "/Trash", type: "Trash" },
    { id: "7", name: "Projects", path: "/Projects", type: "Custom" },
  ];
  labels: Label[] = [
    { id: "10", name: "Projects", color: "#5579b9" },
    { id: "11", name: "People", color: "#7e65ac" },
    { id: "12", name: "Receipts", color: "#b48746" },
  ];
  messages: (Message & { accountId: string; profileId: string })[] = [];
  details = new Map<string, Detail>();
  drafts = new Map<string, Compose>();
  failNext = false;
  constructor() {
    const samples = [
      [
        "Jamie Chen",
        "jamie@example.test",
        "A little breathing room for your inbox",
        "The updated project brief is ready. A few notes before we meet tomorrow.",
        true,
        true,
        "important",
        "10",
      ],
      [
        "Morgan Ellis",
        "morgan@example.test",
        "Thursday works for me",
        "Let’s meet at 10:30. I’ll bring the sketches and a few ideas.",
        true,
        false,
        "flag_not_set",
        "11",
      ],
      [
        "Studio North",
        "studio@example.test",
        "Your October workspace notes",
        "A quieter workspace, a clearer mind. Here’s what’s new this month.",
        false,
        false,
        "flag_not_set",
        "",
      ],
      [
        "Priya Shah",
        "priya@example.test",
        "Re: Launch checklist",
        "Everything is looking good on our side. One final question about the timeline.",
        false,
        true,
        "important",
        "10",
      ],
      [
        "The Paper Store",
        "orders@example.test",
        "Receipt for order #1048",
        "Thanks for your order. Your receipt is attached.",
        false,
        true,
        "flag_not_set",
        "12",
      ],
      [
        "Sam Rivera",
        "sam@example.test",
        "A few ideas for next week",
        "I’ve collected the links we talked about. Let me know which direction feels right.",
        false,
        false,
        "flag_not_set",
        "11",
      ],
      [
        "Design Weekly",
        "news@example.test",
        "Small details, better days",
        "This week: thoughtful interfaces and tools that get out of the way.",
        false,
        false,
        "flag_not_set",
        "",
      ],
      [
        "Jamie Chen",
        "jamie@example.test",
        "Project handoff • next steps",
        "The handoff notes are all in one place. Thanks for the thoughtful feedback.",
        false,
        false,
        "flag_not_set",
        "10",
      ],
    ];
    samples.forEach((s, i) => {
      const id = String(1000 + i);
      const m: Message & { accountId: string; profileId: string } = {
        id,
        accountId: "100",
        profileId: "demo",
        folderId: "1",
        threadId: i === 0 ? "500" : "",
        subject: String(s[2]),
        sender: String(s[0]),
        from: String(s[1]),
        to: "alex@example.test",
        cc: "",
        summary: String(s[3]),
        time: Date.now() - i * 3_600_000,
        unread: !!s[4],
        hasAttachment: !!s[5],
        flag: String(s[6]),
        labels: s[7] ? [String(s[7])] : [],
      };
      this.messages.push(m);
      this.details.set(id, {
        html:
          i === 0
            ? "<p>Hi Alex,</p><p>I’ve pulled together the updated project brief. The direction is feeling clear, and we have a little room to make the details even better.</p><h3>Before we meet tomorrow</h3><ul><li>Review the three priorities in the attached brief.</li><li>Bring any open questions about the launch.</li><li>Think about what a simpler first release could look like.</li></ul><p>No rush on a reply today. Let’s talk it through in the morning.</p><p>Thanks,<br><strong>Jamie</strong></p>"
            : `<p>Hi Alex,</p><p>${s[3]}</p><p>Thanks,<br>${s[0]}</p>`,
        attachments: s[5]
          ? [
              {
                id: "800",
                name: i === 4 ? "Receipt.txt" : "Project brief.txt",
                size: 2048,
              },
            ]
          : [],
      });
    });
    const team = {
      ...this.messages[0],
      id: "2000",
      accountId: "200",
      subject: "Welcome to the team inbox",
      to: "team@example.test",
      hasAttachment: false,
    };
    this.messages.push(team);
    this.details.set(team.id, {
      html: "<p>This is a separate, synthetic mailbox. Switching accounts keeps messages isolated.</p>",
      attachments: [],
    });
    const studio = {
      ...this.messages[0],
      id: "3000",
      accountId: "100",
      profileId: "other-demo",
      subject: "Studio review — a different business",
      to: "alex@studio.example.test",
      from: "partner@studio.example.test",
      sender: "Studio partner",
      hasAttachment: false,
    };
    this.messages.push(studio);
    this.details.set(studio.id, {
      html: "<p>This message belongs to a different Zoho authorization. Replying uses the Studio mailbox automatically.</p>",
      attachments: [],
    });
  }
  async invoke(input: Command): Promise<Result> {
    try {
      return {
        ok: true,
        value: await this.execute(commandSchema.parse(input)),
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Demo operation failed.",
      };
    }
  }
  async execute(c: Command): Promise<unknown> {
    if (c.op === "pasteClipboard") return { attachments: [], images: [] };
    if (c.op === "importPaste") {
      const attachments = [],
        images = [];
      for (const a of c.assets) {
        const src = `data:${a.mime};base64,${a.base64}`;
        if (a.inline) {
          if (!validEditorImage(src))
            throw new Error("Paste a PNG, JPEG, GIF or WebP image.");
          images.push({ src, name: a.name });
        } else
          attachments.push({
            id: crypto.randomUUID(),
            name: a.name,
            size: atob(a.base64).length,
          });
      }
      return { attachments, images };
    }
    if (c.op === "preferences") {
      this.preferences = c.preferences;
      return this.execute({ op: "snapshot" });
    }
    if (c.op === "testNotification") {
      this.emit({
        type: "notice",
        message: "Demo notification: new mail notification preview.",
      });
      return true;
    }
    if (c.op === "quitReady") return true;
    if (c.op === "demoArrival") {
      const account = this.accounts[2];
      const id = crypto.randomUUID();
      const m = {
        ...this.messages[0],
        id,
        profileId: account.profileId,
        accountId: account.id,
        to: account.email,
        sender: "Studio partner",
        from: "partner@studio.example.test",
        subject: "New arrival — automatic inbox update",
        summary: "This message arrived while you were working.",
        time: Date.now(),
        unread: true,
        hasAttachment: false,
      };
      this.messages.push(m);
      this.details.set(id, {
        html: "<p>A new offline message arrived. Your selected message and draft stay in place.</p>",
        attachments: [],
      });
      const result = await this.pollInbox(account);
      this.emit({
        type: "inbox",
        update: {
          account,
          ...result,
          checkedAt: Date.now(),
          fresh: [m],
          catchUpLimited: false,
        },
      });
      return true;
    }
    if (c.op === "checkNow") {
      for (const account of this.accounts) {
        const result = await this.pollInbox(account);
        this.emit({
          type: "inbox",
          update: {
            account,
            ...result,
            checkedAt: Date.now(),
            fresh: [],
            catchUpLimited: false,
          },
        });
      }
      return true;
    }
    if (this.failNext) {
      this.failNext = false;
      throw new Error(
        "Simulated connection failure. Nothing was sent. Your draft is preserved.",
      );
    }
    if (c.op === "snapshot" || c.op === "demo")
      return {
        demo: true,
        preferences: this.preferences,
        profiles: [
          {
            id: "demo",
            email: "alex@example.test",
            region: "US",
            connected: true,
            paused: null,
          },
          {
            id: "other-demo",
            email: "alex@studio.example.test",
            region: "EU",
            connected: true,
            paused: null,
          },
        ],
        accounts: this.accounts,
      };
    if (["connect", "resume", "disconnect", "forget"].includes(c.op))
      throw new Error(
        "This preview is offline. Use the Windows app to manage real connections.",
      );
    if (c.op === "openLink") return false;
    if (!("accountId" in c)) throw new Error("Unknown demo action.");
    const a = this.accounts.find(
      (a) => a.id === c.accountId && a.profileId === c.profileId,
    );
    if (!a) throw new Error("Unknown demo account.");
    const draftKey = a.profileId + ":" + a.id;
    const find = (id: string) => {
      const m = this.messages.find(
        (m) =>
          m.id === id && m.accountId === a.id && m.profileId === a.profileId,
      );
      if (!m) throw new Error("Message not found in this mailbox.");
      return m;
    };
    switch (c.op) {
      case "folders":
        return this.folders;
      case "labels":
        return this.labels;
      case "signatures":
        return [
          {
            id: "1",
            name: "Simple signature",
            content: "<p>Best,<br>Alex Morgan</p>",
          },
        ];
      case "list": {
        let list = this.messages.filter(
          (m) => m.accountId === a.id && m.profileId === a.profileId,
        );
        if (c.query) {
          const needle = c.query
            .replace(/^(subject|entire):/, "")
            .toLowerCase();
          list = list.filter((m) =>
            (m.subject + " " + m.sender + " " + m.summary)
              .toLowerCase()
              .includes(needle),
          );
        } else {
          if (c.folderId) list = list.filter((m) => m.folderId === c.folderId);
          if (c.labelId)
            list = list.filter((m) => m.labels.includes(c.labelId!));
          if (c.threadId) list = list.filter((m) => m.threadId === c.threadId);
        }
        if (c.filter === "unread") list = list.filter((m) => m.unread);
        if (c.filter === "flagged")
          list = list.filter((m) => m.flag !== "flag_not_set");
        list.sort((a, b) => b.time - a.time);
        return {
          messages: structuredClone(
            list.slice(c.start - 1, c.start - 1 + PAGE_SIZE),
          ),
          hasMore: list.length > c.start - 1 + PAGE_SIZE,
        };
      }
      case "detail":
        find(c.messageId);
        return structuredClone(
          this.details.get(c.messageId) || {
            html: "<p>No body.</p>",
            attachments: [],
          },
        );
      case "headers":
        find(c.messageId);
        return "From: jamie@example.test\r\nTo: alex@example.test\r\nMessage-ID: <fixture@example.test>\r\nSubject: Offline fixture";
      case "action":
        for (const id of c.ids) {
          const m = find(id);
          switch (c.action) {
            case "read":
              m.unread = false;
              break;
            case "unread":
              m.unread = true;
              break;
            case "flag":
              m.flag = "important";
              break;
            case "unflag":
              m.flag = "flag_not_set";
              break;
            case "archive":
              m.folderId = "4";
              break;
            case "unarchive":
              m.folderId = "1";
              break;
            case "spam":
              m.folderId = "5";
              break;
            case "notspam":
              m.folderId = "1";
              break;
            case "move":
              if (!this.folders.some((f) => f.id === c.target))
                throw new Error("Unknown destination.");
              m.folderId = c.target!;
              break;
            case "label":
              m.labels = [...new Set([...m.labels, c.target!])];
              break;
            case "unlabel":
              m.labels = m.labels.filter((l) => l !== c.target);
              break;
          }
        }
        return true;
      case "createFolder":
        this.folders.push({
          id: crypto.randomUUID(),
          name: c.name,
          path: "/" + c.name,
          type: "Custom",
        });
        return true;
      case "renameFolder": {
        const f = this.folders.find((f) => f.id === c.folderId);
        if (f) f.name = c.name;
        return true;
      }
      case "createLabel":
        this.labels.push({
          id: crypto.randomUUID(),
          name: c.name,
          color: c.color,
        });
        return true;
      case "pickFiles":
        return [
          { id: "sample-attachment", name: "Sample attachment.txt", size: 42 },
        ];
      case "saveAttachment":
        find(c.messageId);
        return "Demo attachment preview only; no file was downloaded.";
      case "send":
      case "saveCloudDraft": {
        validateRecipients(c.compose, a.aliases);
        const id = crypto.randomUUID();
        const m: Message & { accountId: string; profileId: string } = {
          id,
          accountId: a.id,
          profileId: a.profileId,
          folderId: c.op === "send" ? "2" : "3",
          threadId: c.compose.replyId || "",
          subject: c.compose.subject,
          sender: a.name,
          from: c.compose.from,
          to: c.compose.to,
          cc: c.compose.cc,
          summary: c.compose.body.slice(0, 120),
          time: Date.now(),
          unread: false,
          flag: "flag_not_set",
          hasAttachment: !!c.compose.attachments.length,
          labels: [],
        };
        this.messages.push(m);
        this.details.set(id, {
          html:
            c.compose.format === "html"
              ? c.compose.body
              : "<p>" +
                c.compose.body
                  .replaceAll("&", "&amp;")
                  .replaceAll("<", "&lt;")
                  .replaceAll(">", "&gt;")
                  .replaceAll("\n", "<br>") +
                "</p>",
          attachments: [],
        });
        return { messageId: id };
      }
      case "getDraft":
      case "listLocalDrafts": {
        const drafts = [...this.drafts.entries()]
          .filter(([key]) => key.startsWith(draftKey + ":"))
          .map(([, draft]) => structuredClone(draft));
        return c.op === "getDraft" ? drafts.at(-1) || null : drafts;
      }
      case "saveLocalDraft":
        if (c.compose)
          this.drafts.set(
            draftKey + ":" + c.compose.id,
            structuredClone(c.compose),
          );
        else if (c.draftId) this.drafts.delete(draftKey + ":" + c.draftId);
        return true;
    }
  }
}
