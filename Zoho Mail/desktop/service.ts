import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  commandSchema,
  REGIONS,
  type Account,
  type Command,
  type LocalFile,
  type Result,
  validateRecipients,
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
export interface Dialogs {
  pick(): Promise<string[]>;
  save(name: string): Promise<string | null>;
  open(url: string): Promise<boolean>;
}
export class MailService {
  private clients = new Map<string, ZohoMail>();
  private files = new Map<
    string,
    {
      profileId: string;
      accountId: string;
      path: string;
      name: string;
      size: number;
    }
  >();
  private busy = new Set<string>();
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
    };
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
        const client = new ZohoMail(
          new ZohoTransport(secret, this.vault, this.pacer, this.fetcher),
        );
        this.clients.set(secret.id, client);
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
      if (
        c.compose.attachments.reduce((n, a) => n + a.size, 0) >
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
          const stat = await fs.stat(f.path);
          if (stat.size !== f.size || stat.size > 20 * 1024 * 1024)
            throw new Error(
              "An attachment changed. Remove it and attach the current file.",
            );
          attachments.push(
            await client.upload(
              c.accountId,
              f.name,
              new Uint8Array(await fs.readFile(f.path)),
            ),
          );
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
    return client.execute(c);
  }
}
