import { sanitizeOutgoingHtml } from "./html";
import {
  type Account,
  type Command,
  type Compose,
  type Folder,
  PAGE_SIZE,
  REGIONS,
  validateRecipients,
} from "../src/shared";
import { ZohoTransport, remoteId, normalizeMessage } from "./transport";
import { imageSources, resolveReceivedImages } from "./receivedImages";

export class ZohoMail {
  accounts: Account[] = [];
  constructor(public transport: ZohoTransport) {}
  private list(value: unknown, kind: string): any[] {
    if (!Array.isArray(value))
      return this.transport.stop(
        `Unexpected ${kind} response. Connection stopped without a retry.`,
      );
    return value;
  }
  async loadAccounts() {
    const data = await this.transport.request("/api/accounts");
    if (!Array.isArray(data))
      return this.transport.stop(
        "Unexpected account response. Connection stopped without a retry.",
      );
    if (data.some((a) => !a || typeof a !== "object"))
      return this.transport.stop(
        "Unexpected account entry. Connection stopped without a retry.",
      );
    this.accounts = data
      .filter((a) => a.type === "ZOHO_ACCOUNT")
      .map((a) => ({
        id: String(a.accountId),
        profileId: this.transport.secret.id,
        email: String(a.mailboxAddress || a.primaryEmailAddress),
        name: String(a.displayName || a.accountDisplayName || a.mailboxAddress),
        aliases: [
          ...new Set<string>(
            [
              a.mailboxAddress || a.primaryEmailAddress,
              ...(a.emailAddress || [])
                .filter((e: any) => e.isConfirmed === true)
                .map((e: any) => e.mailId),
            ].filter(Boolean),
          ),
        ],
      }));
    if (
      !this.accounts.some((a) =>
        a.aliases.some(
          (e) => e.toLowerCase() === this.transport.secret.email.toLowerCase(),
        ),
      )
    ) {
      return this.transport.stop(
        "The authorized mailbox does not match the email you entered. No mail was loaded.",
      );
    }
    return this.accounts;
  }
  account(id: string) {
    const a = this.accounts.find((a) => a.id === id);
    if (!a)
      throw new Error("This mailbox is not authorized by this connection.");
    return a;
  }
  async execute(c: Command): Promise<unknown> {
    if (!("accountId" in c)) throw new Error("Unsupported mail operation.");
    const account = this.account(c.accountId);
    const base = "/api/accounts/" + remoteId(account.id);
    const request = this.transport.request.bind(this.transport);
    const messagePath = (folder: string, message: string) =>
      base + "/folders/" + remoteId(folder) + "/messages/" + remoteId(message);
    switch (c.op) {
      case "folders":
        return this.list(await request(base + "/folders"), "folder list").map(
          (f: any) => ({
            id: String(f.folderId),
            name: String(f.folderName),
            path: String(f.path || "/" + f.folderName),
            type: String(f.folderType),
          }),
        );
      case "labels":
        return this.list(await request(base + "/labels"), "label list").map(
          (l: any) => ({
            id: String(l.labelId),
            name: String(l.displayName),
            color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#6182ba",
          }),
        );
      case "signatures":
        return this.list(
          await request("/api/accounts/signature"),
          "signature list",
        ).map((s: any) => ({
          id: String(s.id),
          name: String(s.name),
          content: String(s.content || ""),
        }));
      case "list": {
        const limit = c.limit || PAGE_SIZE;
        const q = new URLSearchParams({
          start: String(c.start),
          limit: String(limit),
          includeto: "true",
        });
        if (c.query) {
          q.set("searchKey", c.query);
          q.set("receivedTime", String(Date.now()));
        } else {
          if (c.folderId) q.set("folderId", remoteId(c.folderId));
          if (c.labelId) q.set("labelid", remoteId(c.labelId));
          if (c.threadId) {
            q.set("threadId", remoteId(c.threadId));
            q.set("sortBy", "date");
            q.set("sortorder", "false");
          }
          // This is a FILTER for conversation mail, not a grouped-list mode.
          // Omit it for normal lists/history so standalone mail remains visible.
          q.set("includearchive", String(!c.folderId));
          // folderId scopes the request; excluding Sent would hide the Sent folder's own mail.
          q.set("includesent", "true");
          if (c.filter === "unread") q.set("status", "unread");
          if (c.filter === "flagged") q.set("flaggedMails", "true");
        }
        const data = await request(
          base + "/messages/" + (c.query ? "search" : "view") + "?" + q,
        );
        if (!Array.isArray(data))
          return this.transport.stop(
            "Unexpected message list response. Connection stopped without a retry.",
          );
        return {
          messages: data.map(normalizeMessage),
          hasMore: data.length === limit,
        };
      }
      case "detail": {
        const data = await request(
          messagePath(c.folderId, c.messageId) +
            "/content?includeBlockContent=true",
        );
        if (typeof data?.content !== "string")
          return this.transport.stop(
            "Unexpected message body response. Connection stopped without a retry.",
          );
        let attachments = [];
        let inline = [];
        const hasImages = imageSources(data.content).length > 0;
        if (c.attachments || hasImages) {
          const info = await request(
            messagePath(c.folderId, c.messageId) +
              "/attachmentinfo?includeInline=true",
          );
          inline = Array.isArray(info?.inline) ? info.inline : [];
          attachments = (info?.attachments || []).map((a: any) => ({
            id: String(a.attachmentId),
            name: String(a.attachmentName),
            size: Number(a.attachmentSize),
          }));
        }
        const resolved = hasImages
          ? await resolveReceivedImages(
              data.content,
              inline,
              this.transport.secret.region,
              (cid, name) =>
                request(
                  messagePath(c.folderId, c.messageId) +
                    "/inline?" +
                    new URLSearchParams({ contentId: cid, fileName: name }),
                  "GET",
                  undefined,
                  true,
                ),
            )
          : { html: data.content };
        return { ...resolved, attachments };
      }
      case "headers":
        return String(
          (
            await request(
              messagePath(c.folderId, c.messageId) + "/header?raw=true",
            )
          )?.headerContent || "",
        );
      case "action": {
        const modes = {
          read: "markAsRead",
          unread: "markAsUnread",
          flag: "setFlag",
          unflag: "setFlag",
          archive: "archiveMails",
          unarchive: "unArchiveMails",
          spam: "moveToSpam",
          notspam: "markNotSpam",
          move: "moveMessage",
          label: "applyLabel",
          unlabel: "removeLabel",
        };
        const body: Record<string, unknown> = {
          mode: modes[c.action],
          messageId: c.ids.map(remoteId),
        };
        if (c.action === "flag" || c.action === "unflag")
          body.flagid = c.action === "flag" ? "important" : "flag_not_set";
        if (c.action === "move") body.destfolderId = remoteId(c.target || "");
        if (c.action === "label" || c.action === "unlabel")
          body.labelId = [remoteId(c.target || "")];
        return request(base + "/updatemessage", "PUT", body);
      }
      case "createFolder":
        return request(base + "/folders", "POST", {
          folderName: c.name,
          ...(c.parentId ? { parentFolderId: remoteId(c.parentId) } : {}),
        });
      case "renameFolder":
        return request(base + "/folders/" + remoteId(c.folderId), "PUT", {
          mode: "rename",
          folderName: c.name,
        });
      case "createLabel":
        return request(base + "/labels", "POST", {
          displayName: c.name,
          color: c.color,
        });
      case "saveAttachment":
        return request(
          messagePath(c.folderId, c.messageId) +
            "/attachments/" +
            remoteId(c.attachmentId),
          "GET",
          undefined,
          true,
        );
      default:
        throw new Error("Unsupported mail operation.");
    }
  }
  async upload(
    accountId: string,
    name: string,
    bytes: Uint8Array,
    isInline = false,
  ) {
    this.account(accountId);
    const data = await this.transport.request(
      "/api/accounts/" +
        remoteId(accountId) +
        "/messages/attachments?" +
        new URLSearchParams({ fileName: name, isInline: String(isInline) }),
      "POST",
      bytes,
    );
    const a = Array.isArray(data) ? data[0] : data;
    if (!a?.storeName || !a?.attachmentPath || !a?.attachmentName)
      throw new Error("Zoho did not confirm the attachment upload.");
    const attachment = {
      storeName: String(a.storeName),
      attachmentPath: String(a.attachmentPath),
      attachmentName: String(a.attachmentName),
    };
    if (isInline) {
      const raw = String(a.url || "");
      const base = REGIONS[this.transport.secret.region].mail;
      let url: URL;
      try {
        url = new URL(raw, base);
      } catch {
        throw new Error("Zoho did not return an inline image URL.");
      }
      if (
        !raw ||
        url.origin !== base ||
        url.pathname !== "/zm/ImageSignature" ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error("Zoho returned an unexpected inline image URL.");
      // Zoho's documented image URL can carry an internal account ID different
      // from the upload API ID. Trust the scoped upload's same-region URL.
      return { ...attachment, url: url.href };
    }
    return attachment;
  }
  async send(
    accountId: string,
    c: Compose,
    attachments: unknown[],
    draft = false,
    inlineSources: ReadonlyMap<string, string> = new Map(),
  ) {
    const a = this.account(accountId);
    validateRecipients(c, a.aliases);
    const body: Record<string, unknown> = {
      fromAddress: c.from,
      toAddress: c.to.replaceAll(";", ","),
      ccAddress: c.cc.replaceAll(";", ","),
      bccAddress: c.bcc.replaceAll(";", ","),
      subject: c.subject,
      content:
        c.format === "html"
          ? sanitizeOutgoingHtml(c.body, inlineSources)
          : c.body,
      mailFormat: c.format || "plaintext",
      encoding: "UTF-8",
      askReceipt: "no",
      ...(attachments.length ? { attachments } : {}),
    };
    let path = "/api/accounts/" + remoteId(accountId) + "/messages";
    if (draft) {
      body.mode = "draft";
      if (c.replyId && c.replyFolderId) {
        const headers = (await this.execute({
          op: "headers",
          accountId,
          profileId: a.profileId,
          folderId: c.replyFolderId,
          messageId: c.replyId,
        })) as string;
        const unfolded = headers.replace(/\r?\n[ \t]+/g, " ");
        const messageId = unfolded.match(/^message-id:\s*(.+)$/im)?.[1]?.trim();
        if (!messageId)
          throw new Error(
            "Cannot preserve reply threading: original Message-ID is unavailable.",
          );
        body.inReplyTo = messageId;
        body.refHeader = [
          unfolded.match(/^references:\s*(.+)$/im)?.[1]?.trim(),
          messageId,
        ]
          .filter(Boolean)
          .join(" ");
      }
    } else {
      if (c.replyId) {
        path += "/" + remoteId(c.replyId);
        body.action = "reply";
      }
      if (c.schedule !== "now") {
        body.isSchedule = true;
        body.scheduleType = Number(c.schedule);
      }
    }
    return this.transport.request(path, "POST", body);
  }
}
