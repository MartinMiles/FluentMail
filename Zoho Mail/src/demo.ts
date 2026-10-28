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
import { rememberRecipients } from "./recipientHistory";

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
    // Synthetic cross-folder conversation with an embedded raster image.
    const original = {
      ...this.messages[0],
      id: "900",
      folderId: "2",
      sender: "Alex Morgan",
      from: "alex@example.test",
      to: "jamie@example.test",
      unread: false,
      hasAttachment: false,
      time: this.messages[0].time - 60_000,
    };
    this.messages.push(original);
    const image =
      "data:image/png;base64,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";
    // Fictional, locally generated preview: safe for public product screenshots.
    this.details.set(this.messages[0].id, {
      html: `<p>Hi Alex,</p><p>The updated brief is ready for tomorrow. <strong>All three priorities are agreed</strong>, and the team has everything it needs for the next step.</p><p><img src="${image}" width="480" height="100" alt="Project preview: Review, Align, Launch"></p><p>I've included the notes below. Let's keep the first release focused and leave a little room for the details.</p><p>Thanks,<br><strong>Jamie</strong></p>`,
      attachments: [{ id: "800", name: "Project brief.txt", size: 2048 }],
    });
    this.details.set(original.id, {
      html: `<p>Hi Jamie, here is the original project note.</p><p><img src="${image}" width="64" height="64" alt="Synthetic embedded image"></p>`,
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
      case "recipientHistory":
        return rememberRecipients(
          [],
          this.messages
            .filter(
              (m) =>
                m.profileId === a.profileId &&
                m.accountId === a.id &&
                m.folderId === "2",
            )
            .sort((x, y) => y.time - x.time)
            .flatMap((m) => [m.to, m.cc]),
        );
      case "list": {
        const pageSize = c.limit || PAGE_SIZE;
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
            list.slice(c.start - 1, c.start - 1 + pageSize).map((m) => ({
              ...m,
              threadCount: m.threadId
                ? this.messages.filter(
                    (p) =>
                      p.profileId === a.profileId &&
                      p.accountId === a.id &&
                      p.threadId === m.threadId,
                  ).length
                : 1,
            })),
          ),
          hasMore: list.length > c.start - 1 + pageSize,
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
