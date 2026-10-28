import nodemailer, { type SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { randomUUID } from "node:crypto";
import {
  REGIONS,
  type Region,
  type SmtpServer,
  type Account,
  type Compose,
  validateRecipients,
} from "../src/shared";
import { inlineImages } from "./inlineImages";
import { sanitizeOutgoingHtml } from "./html";

export type SmtpLogin = {
  region: Region;
  username: string;
  password: string;
  server: SmtpServer;
};
export type MailBytes = { name: string; bytes: Uint8Array };
export type SmtpOutcome = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};
export interface SmtpClient {
  sendMail(
    message: SendMailOptions,
  ): Promise<{ messageId: string; accepted?: unknown[]; rejected?: unknown[] }>;
  verify(): Promise<unknown>;
  close(): void;
}
export type SmtpFactory = (options: SMTPTransport.Options) => SmtpClient;
export interface SmtpSender {
  send(login: SmtpLogin, message: SendMailOptions): Promise<SmtpOutcome>;
  verify(login: SmtpLogin): Promise<void>;
}

export function smtpOptions(login: SmtpLogin): SMTPTransport.Options {
  const domain = new URL(REGIONS[login.region].mail).hostname.replace(
    /^mail\./,
    "",
  );
  const host = (login.server === "pro" ? "smtppro." : "smtp.") + domain;
  return {
    host,
    port: 465,
    secure: true,
    auth: { user: login.username, pass: login.password },
    pool: false,
    logger: false,
    debug: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: host },
  };
}

/** Delivery state comes from explicit SMTP replies, never arbitrary error prose.
 * safeToResubmit only permits a later reviewed draft submission; no retry occurs.
 * Socket errors are conservatively uncertain even if a library labels them CONN.
 */
export class SmtpFailure extends Error {
  constructor(
    message: string,
    public safeToResubmit: boolean,
    public pause: boolean,
  ) {
    super(message);
  }
  static from(error: unknown) {
    if (error instanceof SmtpFailure) return error;
    const e = error as {
      responseCode?: unknown;
      command?: unknown;
      code?: unknown;
    };
    const code = Number(e?.responseCode),
      known = Number.isInteger(code) && code >= 400 && code <= 599;
    const authentication =
      e?.code === "EAUTH" || /^AUTH\b/.test(String(e?.command || ""));
    const label = authentication ? "sign-in" : "operation";
    const reviewedMessageProblem =
      known &&
      [550, 551, 552, 553].includes(code) &&
      /^(?:MAIL FROM|RCPT TO|DATA)\b/.test(String(e?.command || ""));
    const pause = authentication || !reviewedMessageProblem;
    return new SmtpFailure(
      known
        ? `Zoho SMTP rejected the ${label} (${code}). Review SMTP access, credentials or message details before trying again. No retry was made.`
        : "SMTP stopped without a confirmed delivery result. Check Sent in Zoho before creating another copy. No retry was made.",
      known,
      pause,
    );
  }
}

const addresses = (items: unknown[] | undefined) =>
  (items || []).flatMap((item) =>
    typeof item === "string"
      ? [item]
      : item &&
          typeof item === "object" &&
          "address" in item &&
          typeof item.address === "string"
        ? [item.address]
        : [],
  );
export class SmtpMailer implements SmtpSender {
  constructor(
    private create: SmtpFactory = (options) =>
      nodemailer.createTransport(options),
  ) {}
  async verify(login: SmtpLogin) {
    const transport = this.create(smtpOptions(login));
    try {
      await transport.verify();
    } catch (e) {
      throw SmtpFailure.from(e);
    } finally {
      try {
        transport.close();
      } catch {
        /* Closing cannot replay work or mask an accepted operation. */
      }
    }
  }
  async send(login: SmtpLogin, message: SendMailOptions): Promise<SmtpOutcome> {
    const transport = this.create(smtpOptions(login));
    try {
      const info = await transport.sendMail({
        ...message,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const accepted = addresses(info.accepted),
        rejected = addresses(info.rejected);
      if (!accepted.length || !info.messageId)
        throw new SmtpFailure(
          "SMTP did not confirm accepted recipients and a message ID. Check Sent before creating another copy.",
          false,
          true,
        );
      return { messageId: info.messageId, accepted, rejected };
    } catch (e) {
      throw SmtpFailure.from(e);
    } finally {
      try {
        transport.close();
      } catch {
        /* Preserve a confirmed send even if cleanup fails. */
      }
    }
  }
}

export function smtpMessage(
  account: Account,
  compose: Compose,
  files: MailBytes[],
  headers?: string,
): SendMailOptions {
  validateRecipients(compose, account.aliases);
  if (compose.schedule !== "now")
    throw new Error(
      "Messages with inline images can be sent now. Choose Send now or keep the draft for later.",
    );
  const images = inlineImages(compose.body),
    sources = new Map<string, string>();
  const attachments: NonNullable<SendMailOptions["attachments"]> = files.map(
    (file) => ({
      filename: file.name,
      content: Buffer.from(file.bytes),
      contentDisposition: "attachment",
    }),
  );
  let total = files.reduce((n, f) => n + f.bytes.length, 0);
  for (const [src, image] of images) {
    total += image.bytes.length;
    const cid = randomUUID() + "@fluentmail.local";
    sources.set(src, "cid:" + cid);
    attachments.push({
      filename: image.name,
      content: Buffer.from(image.bytes),
      contentType: image.mime,
      cid,
      contentDisposition: "inline",
    });
  }
  if (total > 20 * 1024 * 1024)
    throw new Error(
      "Attachments and inline images must total less than 20 MB.",
    );
  const message: SendMailOptions = {
    from: { name: account.name.replace(/[\r\n]/g, " "), address: compose.from },
    to: compose.to.replaceAll(";", ","),
    cc: compose.cc.replaceAll(";", ",") || undefined,
    bcc: compose.bcc.replaceAll(";", ",") || undefined,
    subject: compose.subject,
    html: sanitizeOutgoingHtml(compose.body, sources),
    attachments,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
  if (compose.replyId) {
    const unfolded = (headers || "").replace(/\r?\n[ \t]+/g, " ");
    const original = unfolded
      .match(/^message-id:\s*([^\r\n]+)$/im)?.[1]
      ?.trim();
    if (!original || !/^<[^<>\s]+>$/.test(original))
      throw new Error(
        "The original Message-ID is unavailable. Keep the reply draft until its threading can be preserved.",
      );
    message.inReplyTo = original;
    const references =
      unfolded
        .match(/^references:\s*([^\r\n]+)$/im)?.[1]
        ?.match(/<[^<>\s]+>/g) || [];
    message.references = [...new Set([...references, original])];
  }
  return message;
}
