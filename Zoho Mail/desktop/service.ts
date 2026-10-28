import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  commandSchema,
  REGIONS,
  type Account,
  type Command,
  type LocalFile,
  type Folder,
  type ListResult,
  type Result,
  type PasteResult,
  validateRecipients,
  INLINE_DELIVERY_UNAVAILABLE,
} from "../src/shared";
import {
  Pacer,
  PausedError,
  ZohoTransport,
  type Secret,
  type Fetcher,
} from "./transport";
import { ZohoMail } from "./zoho";
import { Vault } from "./vault";
import { imageDataUrl, inlineImages, MAX_MEDIA } from "./inlineImages";
import { type ClipboardMedia } from "./clipboard";
export interface Dialogs {
  pick(): Promise<string[]>;
  save(name: string): Promise<string | null>;
  open(url: string): Promise<boolean>;
  clipboard?(): Promise<ClipboardMedia>;
}
export class MailService {
  private clients = new Map<string, ZohoMail>();
  private files = new Map<
    string,
    {
      profileId: string;
      accountId: string;
      path?: string;
      bytes?: Uint8Array;
      name: string;
      size: number;
    }
  >();
  private busy = new Set<string>();
  private folderCache = new Map<string, Folder[]>();
  private historyLoads = new Map<string, Promise<string[]>>();
  constructor(
    private vault: Vault,
    private dialogs: Dialogs,
    private pacer = new Pacer(),
    private fetcher: Fetcher = fetch,
  ) {}
  snapshot() {
    return {
      demo: false,
      profiles: this.vault.data.profiles.map((p) => ({
        id: p.id,
        email: p.email,
        region: p.region,
        connected: this.clients.get(p.id)?.transport.connected || false,
        paused: p.paused,
      })),
      accounts: [...this.clients.values()].flatMap((c) => c.accounts),
      preferences: this.vault.preferences(),
    };
  }
  isBusy() {
    return this.busy.size > 0;
  }
  connectedAccounts() {
    return [...this.clients.values()]
      .filter((c) => c.transport.connected && !c.transport.secret.paused)
      .flatMap((c) => c.accounts);
  }
  isConnected(profileId: string) {
    const c = this.clients.get(profileId);
    return !!c?.transport.connected && !c.transport.secret.paused;
  }
  async pollInbox(account: Account, start = 1): Promise<ListResult> {
    const client = this.clients.get(account.profileId);
    if (!client || !this.isConnected(account.profileId))
      throw new Error("Account disconnected.");
    const key = account.profileId + ":" + account.id;
    let folders = this.folderCache.get(key);
    if (!folders) {
      folders = (await client.execute({
        op: "folders",
        profileId: account.profileId,
        accountId: account.id,
      })) as Folder[];
      this.folderCache.set(key, folders);
    }
    const inbox = folders.find((f) => f.path.toLowerCase() === "/inbox");
    if (!inbox) return { messages: [], hasMore: false };
    return client.execute({
      op: "list",
      profileId: account.profileId,
      accountId: account.id,
      folderId: inbox.id,
      start,
      filter: "all",
    }) as Promise<ListResult>;
  }
  stopAll() {
    for (const c of this.clients.values()) c.transport.disconnect();
  }
  pauseAfterSyncError(profileId: string) {
    const transport = this.clients.get(profileId)?.transport;
    if (transport?.connected) {
      try {
        transport.stop(
          "Automatic mail checks stopped after an unexpected result. Review the account before reconnecting. No retry was made.",
        );
      } catch {
        /* stop deliberately throws after persisting the pause. */
      }
    }
    return (
      transport?.secret.paused ||
      "Mail checks stopped. Reconnect after reviewing the account."
    );
  }
  async invoke(input: unknown): Promise<Result> {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Invalid request. Check the fields and try again.",
      };
    try {
      return { ok: true, value: await this.execute(parsed.data) };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "The operation could not be completed.",
        paused: e instanceof PausedError,
      };
    }
  }
  private async execute(c: Command): Promise<unknown> {
    if (c.op === "snapshot") return this.snapshot();
    if (c.op === "preferences") {
      this.vault.data.preferences = c.preferences;
      this.vault.persist();
      return this.snapshot();
    }
    if (c.op === "demo")
      throw new Error("Use the separate Demo launch to explore sample mail.");
    if (c.op === "openLink") {
      const url = new URL(c.url);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Only ordinary web links can be opened.");
      return this.dialogs.open(url.href);
    }
    if (c.op === "connect" || c.op === "resume") {
      const key = c.op === "connect" ? c.email.toLowerCase() : c.profileId;
      if (this.busy.has(key))
        throw new Error("A connection attempt is already running.");
      this.busy.add(key);
      try {
        let secret: Secret | undefined;
        if (c.op === "connect") {
          if (
            this.vault.data.profiles.some(
              (p) => p.email.toLowerCase() === c.email.toLowerCase(),
            )
          )
            throw new Error(
              "This account is already saved. Use Connect or forget its local connection before adding it again.",
            );
          secret = {
            id: randomUUID(),
            email: c.email,
            region: c.region,
            clientId: c.clientId,
            clientSecret: c.clientSecret,
            refreshToken: "",
            accessToken: "",
            expiresAt: 0,
            paused: null,
          };
        } else
          secret = this.vault.data.profiles.find((p) => p.id === c.profileId);
        if (!secret) throw new Error("Account not found.");
        this.clients.get(secret.id)?.transport.disconnect();
        const client = new ZohoMail(
          new ZohoTransport(secret, this.vault, this.pacer, this.fetcher),
        );
        this.clients.set(secret.id, client);
        for (const key of this.folderCache.keys())
          if (key.startsWith(secret.id + ":")) this.folderCache.delete(key);
        for (const key of this.historyLoads.keys())
          if (key.startsWith(secret.id + ":")) this.historyLoads.delete(key);
        await client.transport.authorize(
          c.op === "connect" ? c.code : undefined,
        );
        await client.loadAccounts();
        return this.snapshot();
      } finally {
        this.busy.delete(key);
      }
    }
    if (c.op === "disconnect" || c.op === "forget") {
      this.clients.get(c.profileId)?.transport.disconnect();
      this.clients.delete(c.profileId);
      for (const key of this.folderCache.keys())
        if (key.startsWith(c.profileId + ":")) this.folderCache.delete(key);
      for (const key of this.historyLoads.keys())
        if (key.startsWith(c.profileId + ":")) this.historyLoads.delete(key);
      if (c.op === "forget") this.vault.forget(c.profileId);
      for (const [key, f] of this.files)
        if (f.profileId === c.profileId) this.files.delete(key);
      return this.snapshot();
    }
    if (!("accountId" in c)) throw new Error("Unsupported operation.");
    const client = this.clients.get(c.profileId);
    const draftKey = c.profileId + ":" + c.accountId;
    if (c.op === "getDraft" || c.op === "listLocalDrafts") {
      const drafts = Object.entries(this.vault.data.drafts)
        .filter(([key]) => key === draftKey || key.startsWith(draftKey + ":"))
        .map(([, draft]) => draft);
      return c.op === "getDraft" ? drafts.at(-1) || null : drafts;
    }
    if (c.op === "saveLocalDraft") {
      // A disconnected but known account may still save a local draft.
      if (!this.vault.data.profiles.some((p) => p.id === c.profileId))
        throw new Error("Unknown account.");
      if (c.compose)
        this.vault.data.drafts[draftKey + ":" + c.compose.id] = c.compose;
      else {
        if (!c.draftId) throw new Error("Choose the specific draft to remove.");
        delete this.vault.data.drafts[draftKey + ":" + c.draftId];
        if (this.vault.data.drafts[draftKey]?.id === c.draftId)
          delete this.vault.data.drafts[draftKey];
      }
      this.vault.persist();
      return true;
    }
    if (!client) throw new Error("Connect this account first.");
    client.account(c.accountId);
    if (c.op === "recipientHistory") {
      let load = this.historyLoads.get(draftKey);
      if (!load) {
        // One bounded Sent page per session; no provider requests per keystroke.
        // Keep rejected promises too: optional suggestions must never retry a failed account.
        load = (async () => {
          const folders =
            this.folderCache.get(draftKey) ||
            ((await client.execute({
              op: "folders",
              profileId: c.profileId,
              accountId: c.accountId,
            })) as Folder[]);
          this.folderCache.set(draftKey, folders);
          const sent = folders.find(
            (f) =>
              f.type.toLowerCase() === "sent" ||
              f.path.toLowerCase() === "/sent",
          );
          if (sent) {
            const page = (await client.execute({
              op: "list",
              profileId: c.profileId,
              accountId: c.accountId,
              folderId: sent.id,
              start: 1,
              filter: "all",
            })) as ListResult;
            if (
              this.clients.get(c.profileId) !== client ||
              !this.isConnected(c.profileId)
            )
              return [];
            this.vault.remember(
              draftKey,
              page.messages.flatMap((m) => [m.to, m.cc]),
            );
            this.vault.persist();
          }
          return this.vault.recipients(draftKey);
        })();
        this.historyLoads.set(draftKey, load);
      }
      await load;
      return this.vault.recipients(draftKey);
    }
    if (c.op === "pasteClipboard" || c.op === "importPaste") {
      const result: PasteResult = { attachments: [], images: [] };
      if (c.op === "pasteClipboard") {
        if (!this.dialogs.clipboard) return result;
        const media = await this.dialogs.clipboard();
        let total = media.images.reduce(
          (n, image) => n + image.bytes.length,
          0,
        );
        if (total > MAX_MEDIA)
          throw new Error("Pasted media must total less than 20 MB.");
        for (const filePath of media.paths) {
          const stat = await fs.stat(filePath);
          total += stat.size;
          if (!stat.isFile() || total > MAX_MEDIA)
            throw new Error("Paste local files totaling less than 20 MB.");
          const id = randomUUID(),
            name = path.basename(filePath);
          this.files.set(id, {
            profileId: c.profileId,
            accountId: c.accountId,
            path: filePath,
            name,
            size: stat.size,
          });
          result.attachments.push({ id, name, size: stat.size });
        }
        for (const image of media.images)
          result.images.push({
            src: imageDataUrl(image.bytes, image.mime),
            name: image.name,
          });
      } else {
        let total = 0;
        for (const asset of c.assets) {
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64))
            throw new Error("Clipboard file data is incomplete.");
          const bytes = new Uint8Array(Buffer.from(asset.base64, "base64"));
          total += bytes.length;
          if (total > MAX_MEDIA)
            throw new Error("Pasted media must total less than 20 MB.");
          const name = path.basename(asset.name.replaceAll("\\", "/"));
          if (asset.inline)
            result.images.push({ src: imageDataUrl(bytes, asset.mime), name });
          else {
            const id = randomUUID();
            this.files.set(id, {
              profileId: c.profileId,
              accountId: c.accountId,
              bytes,
              name,
              size: bytes.length,
            });
            result.attachments.push({ id, name, size: bytes.length });
          }
        }
      }
      return result;
    }
    if (c.op === "pickFiles") {
      const paths = await this.dialogs.pick();
      const result: LocalFile[] = [];
      for (const filePath of paths) {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
          throw new Error("Choose files smaller than 20 MB.");
        const id = randomUUID();
        const name = path.basename(filePath);
        this.files.set(id, {
          profileId: c.profileId,
          accountId: c.accountId,
          path: filePath,
          name,
          size: stat.size,
        });
        result.push({ id, name, size: stat.size });
      }
      return result;
    }
    if (c.op === "saveAttachment") {
      const clean =
        path
          .basename(c.name.replaceAll("\\", "/"))
          .replace(/[<>:"|?*\x00-\x1f]/g, "_") || "attachment";
      const destination = await this.dialogs.save(clean);
      if (!destination) return null;
      const bytes = (await client.execute(c)) as Uint8Array;
      await fs.writeFile(destination, bytes);
      return "Attachment saved.";
    }
    if (c.op === "send" || c.op === "saveCloudDraft") {
      const key = c.profileId + ":" + c.compose.id;
      if (this.busy.has(key))
        throw new Error("This message is already being submitted.");
      if (c.op === "send" && this.vault.data.submitted[key])
        throw new Error(
          "This draft was already submitted or its send outcome is uncertain. Check Sent in Zoho before creating another copy.",
        );
      validateRecipients(c.compose, client.account(c.accountId).aliases);
      const embedded =
        c.compose.format === "html" ? inlineImages(c.compose.body) : new Map();
      // Live MIME checks proved preview URLs become broken body links and normal
      // attachments. Retain drafts; never silently send that as an inline image.
      if (embedded.size) throw new Error(INLINE_DELIVERY_UNAVAILABLE);
      if (
        c.compose.attachments.reduce((n, a) => n + a.size, 0) +
          [...embedded.values()].reduce((n, a) => n + a.bytes.length, 0) >
        20 * 1024 * 1024
      )
        throw new Error("Attachments must total less than 20 MB.");
      this.busy.add(key);
      try {
        const attachments = [];
        for (const a of c.compose.attachments) {
          const f = this.files.get(a.id);
          if (!f || f.profileId !== c.profileId || f.accountId !== c.accountId)
            throw new Error("Please reattach files after restarting the app.");
          const bytes = f.bytes || new Uint8Array(await fs.readFile(f.path!));
          if (bytes.length !== f.size || bytes.length > 20 * 1024 * 1024)
            throw new Error(
              "An attachment changed. Remove it and attach the current file.",
            );
          attachments.push(await client.upload(c.accountId, f.name, bytes));
        }
        if (c.op === "send") {
          this.vault.data.submitted[key] = "pending";
          this.vault.persist();
        }
        const response = await client.send(
          c.accountId,
          c.compose,
          attachments,
          c.op === "saveCloudDraft",
        );
        if (c.op === "send") {
          this.vault.data.submitted[key] = "sent";
          this.vault.remember(draftKey, [
            c.compose.to,
            c.compose.cc,
            c.compose.bcc,
          ]);
          delete this.vault.data.drafts[draftKey + ":" + c.compose.id];
          if (this.vault.data.drafts[draftKey]?.id === c.compose.id)
            delete this.vault.data.drafts[draftKey];
          this.vault.persist();
        }
        return response;
      } finally {
        this.busy.delete(key);
      }
    }
    const result = await client.execute(c);
    if (c.op === "folders")
      this.folderCache.set(c.profileId + ":" + c.accountId, result as Folder[]);
    return result;
  }
}
