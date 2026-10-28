import { describe, it, expect, vi } from "vitest";
import { ZohoMail } from "../desktop/zoho";
import { ZohoTransport, Pacer, type Secret } from "../desktop/transport";
import { blankCompose } from "../src/shared";
function setup() {
  const request = vi.fn(
    async (_path: string, _method?: string, _body?: unknown) => [] as any,
  );
  const transport = {
    request,
    secret: { id: "p", email: "alex@example.test", region: "US" },
    disconnect: vi.fn(),
    stop: (m: string) => {
      throw new Error(m);
    },
  } as unknown as ZohoTransport;
  const mail = new ZohoMail(transport);
  mail.accounts = [
    {
      id: "100",
      profileId: "p",
      email: "alex@example.test",
      name: "Alex",
      aliases: ["alex@example.test"],
    },
  ];
  return { mail, request };
}
const ref = { accountId: "100", profileId: "p" };
describe("documented mail operations", () => {
  it("supports a bounded unthreaded metadata page for counts when provider counts are zero", async () => {
    const { mail, request } = setup();
    await mail.execute({
      op: "list",
      ...ref,
      folderId: "20",
      limit: 200,
      start: 1,
      filter: "all",
    });
    const url = new URL("https://fixture.test" + request.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      limit: "200",
      includesent: "true",
      includearchive: "false",
      folderId: "20",
    });
    expect(url.searchParams.has("threadedMails")).toBe(false);
  });
  it("reads full thread membership across Sent and Inbox, without folder restrictions", async () => {
    const { mail, request } = setup();
    await mail.execute({
      op: "list",
      ...ref,
      threadId: "500",
      start: 41,
      filter: "all",
    });
    const q = new URL("https://fixture.test" + request.mock.calls[0][0]);
    expect(Object.fromEntries(q.searchParams)).toMatchObject({
      threadId: "500",
      start: "41",
      includesent: "true",
      includearchive: "true",
      sortBy: "date",
      sortorder: "false",
    });
    expect(q.searchParams.has("folderId")).toBe(false);
    expect(q.searchParams.has("threadedMails")).toBe(false);
  });
  it("downloads CID images even when the message has no ordinary attachments", async () => {
    const { mail, request } = setup();
    const bytes = Buffer.from("89504e470d0a1a0a", "hex");
    request
      .mockResolvedValueOnce({
        content: '<p>Reply<img src="cid:image@test"></p>',
      })
      .mockResolvedValueOnce({
        inline: [
          { cid: "image@test", attachmentName: "image.png", attachmentSize: 8 },
        ],
        attachments: [],
      })
      .mockResolvedValueOnce(bytes);
    const result: any = await mail.execute({
      op: "detail",
      ...ref,
      folderId: "20",
      messageId: "1001",
      attachments: false,
    });
    expect(result.html).toContain("data:image/png;base64,");
    expect(result.attachments).toEqual([]);
    expect(request.mock.calls[1][0]).toContain(
      "/attachmentinfo?includeInline=true",
    );
    expect(request.mock.calls[2]).toEqual([
      "/api/accounts/100/folders/20/messages/1001/inline?contentId=image%40test&fileName=image.png",
      "GET",
      undefined,
      true,
    ]);
  });
  it("accepts Zoho's documented inline URL with a different internal account ID", async () => {
    const { mail, request } = setup();
    const url =
      "/zm/ImageSignature?fileName=image.png&accountId=29254000000005001&storeName=53862395&frm=c";
    request.mockResolvedValueOnce({
      storeName: "53862395",
      attachmentPath: "/compose/image.png",
      attachmentName: "image.png",
      url,
    });
    expect(
      await mail.upload("100", "image.png", new Uint8Array([1]), true),
    ).toMatchObject({ url: "https://mail.zoho.com" + url });
  });
  it.each([
    "https://evil.test/zm/ImageSignature?accountId=100",
    "https://mail.zoho.eu/zm/ImageSignature?accountId=100",
    "https://mail.zoho.com/other?accountId=100",
    "http://mail.zoho.com/zm/ImageSignature?accountId=100",
    "https://user:pass@mail.zoho.com/zm/ImageSignature?accountId=100",
    "javascript:alert(1)",
    "",
  ])("rejects unsafe inline upload URL %s", async (url) => {
    const { mail, request } = setup();
    request.mockResolvedValueOnce({
      storeName: "store",
      attachmentPath: "/compose/image.png",
      attachmentName: "image.png",
      url,
    });
    await expect(
      mail.upload("100", "image.png", new Uint8Array([1]), true),
    ).rejects.toThrow(/inline image URL/);
  });
  it("sends sanitized rich HTML using the documented html format", async () => {
    const { mail, request } = setup();
    const c = {
      ...blankCompose("alex@example.test"),
      format: "html" as const,
      to: "jamie@example.test",
      body: '<p><strong>Hello</strong><img src="https://tracker.test"><script>bad()</script></p>',
    };
    await mail.send("100", c, []);
    expect(request.mock.calls[0][2]).toMatchObject({
      mailFormat: "html",
      content: "<p><strong>Hello</strong></p>",
    });
  });
  it("discovers several authorized mailboxes without treating aliases as separate inboxes", async () => {
    const { mail, request } = setup();
    request.mockResolvedValueOnce([
      {
        type: "ZOHO_ACCOUNT",
        accountId: "100",
        mailboxAddress: "alex@example.test",
        emailAddress: [{ mailId: "hello@example.test", isConfirmed: true }],
      },
      {
        type: "ZOHO_ACCOUNT",
        accountId: "200",
        mailboxAddress: "team@example.test",
        emailAddress: [],
      },
    ]);
    const accounts = await mail.loadAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0].aliases).toEqual([
      "alex@example.test",
      "hello@example.test",
    ]);
    expect(accounts[1].profileId).toBe("p");
  });
  it("uses 1-based paging and excludes archived mail from the Inbox", async () => {
    const { mail, request } = setup();
    await mail.execute({
      op: "list",
      ...ref,
      folderId: "20",
      filter: "unread",
      start: 41,
    });
    const q = new URL("https://fixture.test" + request.mock.calls[0][0]);
    expect(q.pathname).toBe("/api/accounts/100/messages/view");
    expect(Object.fromEntries(q.searchParams)).toMatchObject({
      start: "41",
      limit: "40",
      status: "unread",
      includearchive: "false",
      includesent: "true",
      folderId: "20",
    });
  });
  it("URL-encodes search expressions and includes recent messages explicitly", async () => {
    const { mail, request } = setup();
    await mail.execute({
      op: "list",
      ...ref,
      query: "subject:Q&A + review",
      filter: "all",
      start: 1,
    });
    const q = new URL("https://fixture.test" + request.mock.calls[0][0]);
    expect(q.pathname).toContain("/messages/search");
    expect(q.searchParams.get("searchKey")).toBe("subject:Q&A + review");
    expect(Number(q.searchParams.get("receivedTime"))).toBeGreaterThan(0);
  });
  it("uses message-specific content and attachment metadata paths", async () => {
    const { mail, request } = setup();
    request
      .mockResolvedValueOnce({ content: "<p>fixture</p>" })
      .mockResolvedValueOnce({
        attachments: [
          {
            attachmentId: "999",
            attachmentName: "data.json",
            attachmentSize: "20",
          },
        ],
      });
    expect(
      await mail.execute({
        op: "detail",
        ...ref,
        folderId: "20",
        messageId: "1709876190693100009",
        attachments: true,
      }),
    ).toEqual({
      html: "<p>fixture</p>",
      attachments: [{ id: "999", name: "data.json", size: 20 }],
    });
    expect(request.mock.calls[0][0]).toContain(
      "/folders/20/messages/1709876190693100009/content?includeBlockContent=true",
    );
  });
  it("moves messages to Trash rather than permanently deleting", async () => {
    const { mail, request } = setup();
    await mail.execute({
      op: "action",
      ...ref,
      ids: ["1709876190693100009"],
      action: "move",
      target: "6",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/accounts/100/updatemessage",
      "PUT",
      {
        mode: "moveMessage",
        messageId: ["1709876190693100009"],
        destfolderId: "6",
      },
    );
  });
  it.each([
    ["read", "markAsRead"],
    ["unread", "markAsUnread"],
    ["archive", "archiveMails"],
    ["unarchive", "unArchiveMails"],
    ["spam", "moveToSpam"],
    ["notspam", "markNotSpam"],
  ] as const)("maps %s to documented mode", async (action, mode) => {
    const { mail, request } = setup();
    await mail.execute({ op: "action", ...ref, ids: ["1"], action });
    expect(request.mock.calls[0][2]).toEqual({ mode, messageId: ["1"] });
  });
  it("uses label IDs and documented flag values", async () => {
    const { mail, request } = setup();
    await mail.execute({
      op: "action",
      ...ref,
      ids: ["1"],
      action: "label",
      target: "10",
    });
    expect(request.mock.calls[0][2]).toEqual({
      mode: "applyLabel",
      messageId: ["1"],
      labelId: ["10"],
    });
    await mail.execute({ op: "action", ...ref, ids: ["1"], action: "flag" });
    expect(request.mock.calls[1][2]).toEqual({
      mode: "setFlag",
      messageId: ["1"],
      flagid: "important",
    });
  });
  it("uses raw attachment upload and the returned store descriptors", async () => {
    const { mail, request } = setup();
    request.mockResolvedValueOnce({
      storeName: "s",
      attachmentPath: "/Mail/abc",
      attachmentName: "report.txt",
    });
    const bytes = new Uint8Array([1, 2]);
    expect(await mail.upload("100", "a & b.txt", bytes)).toEqual({
      storeName: "s",
      attachmentPath: "/Mail/abc",
      attachmentName: "report.txt",
    });
    expect(request.mock.calls[0][0]).toContain("fileName=a+%26+b.txt");
    expect(request.mock.calls[0][2]).toBe(bytes);
  });
  it("sends a reply via the original message endpoint with the reviewed recipients", async () => {
    const { mail, request } = setup();
    const c = {
      ...blankCompose("alex@example.test"),
      to: "jamie@example.test",
      body: "Reply fixture",
      replyId: "1001",
      schedule: "2" as const,
    };
    await mail.send("100", c, []);
    expect(request.mock.calls[0]).toEqual([
      "/api/accounts/100/messages/1001",
      "POST",
      expect.objectContaining({
        action: "reply",
        content: "Reply fixture",
        mailFormat: "plaintext",
        toAddress: "jamie@example.test",
        isSchedule: true,
        scheduleType: 2,
      }),
    ]);
  });
  it("saves reply drafts with RFC Message-ID threading headers, not Zoho numeric IDs", async () => {
    const { mail, request } = setup();
    request.mockResolvedValueOnce({
      headerContent:
        "Message-ID: <original@example.test>\r\nReferences: <earlier@example.test>\r\n",
    });
    await mail.send(
      "100",
      {
        ...blankCompose("alex@example.test"),
        to: "jamie@example.test",
        replyId: "1001",
        replyFolderId: "20",
      },
      [],
      true,
    );
    expect(request.mock.calls[1][2]).toMatchObject({
      mode: "draft",
      inReplyTo: "<original@example.test>",
      refHeader: "<earlier@example.test> <original@example.test>",
    });
  });
  it("rejects a From address or account that the token does not authorize", async () => {
    const { mail, request } = setup();
    await expect(
      mail.send(
        "100",
        { ...blankCompose("stranger@example.test"), to: "a@example.test" },
        [],
      ),
    ).rejects.toThrow("authorized");
    await expect(
      mail.execute({ op: "folders", profileId: "p", accountId: "200" }),
    ).rejects.toThrow("not authorized");
    expect(request).not.toHaveBeenCalled();
  });
});
