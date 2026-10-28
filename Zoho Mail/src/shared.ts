import { z } from "zod";

export const INLINE_DELIVERY_UNAVAILABLE =
  "To send pasted images, set up Inline images (SMTP) for this mailbox in Settings. Your draft is saved on this PC; nothing was sent.";
export type SmtpServer = "standard" | "pro";
export type SmtpStatus = {
  configured: boolean;
  server: SmtpServer;
  paused: string | null;
  verifiedAt?: number;
};

export const REGIONS = {
  US: {
    name: "United States",
    mail: "https://mail.zoho.com",
    auth: "https://accounts.zoho.com",
  },
  EU: {
    name: "Europe",
    mail: "https://mail.zoho.eu",
    auth: "https://accounts.zoho.eu",
  },
  IN: {
    name: "India",
    mail: "https://mail.zoho.in",
    auth: "https://accounts.zoho.in",
  },
  AU: {
    name: "Australia",
    mail: "https://mail.zoho.com.au",
    auth: "https://accounts.zoho.com.au",
  },
  JP: {
    name: "Japan",
    mail: "https://mail.zoho.jp",
    auth: "https://accounts.zoho.jp",
  },
  CA: {
    name: "Canada",
    mail: "https://mail.zohocloud.ca",
    auth: "https://accounts.zohocloud.ca",
  },
  CN: {
    name: "China",
    mail: "https://mail.zoho.com.cn",
    auth: "https://accounts.zoho.com.cn",
  },
  AE: {
    name: "United Arab Emirates",
    mail: "https://mail.zoho.ae",
    auth: "https://accounts.zoho.ae",
  },
  SA: {
    name: "Saudi Arabia",
    mail: "https://mail.zoho.sa",
    auth: "https://accounts.zoho.sa",
  },
} as const;
export type Region = keyof typeof REGIONS;
export const SCOPES =
  "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.folders.CREATE,ZohoMail.folders.UPDATE,ZohoMail.tags.READ,ZohoMail.tags.CREATE,ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.messages.UPDATE";
export type Account = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  aliases: string[];
};
export type Profile = {
  id: string;
  email: string;
  region: Region;
  connected: boolean;
  paused: string | null;
};
export type Folder = { id: string; name: string; path: string; type: string };
export type Label = { id: string; name: string; color: string };
export type Message = {
  id: string;
  folderId: string;
  threadId: string;
  threadCount?: number;
  threadCountEstimated?: boolean;
  hasInline?: boolean;
  subject: string;
  sender: string;
  from: string;
  to: string;
  cc: string;
  summary: string;
  time: number;
  unread: boolean;
  flag: string;
  hasAttachment: boolean;
  labels: string[];
  sourceKey?: string;
  remoteId?: string;
};
export type Attachment = { id: string; name: string; size: number };
export type Detail = {
  html: string;
  attachments: Attachment[];
  imageWarning?: string;
  headers?: string;
};
export type Signature = { id: string; name: string; content: string };
export type LocalFile = { id: string; name: string; size: number };
export type PasteResult = {
  attachments: LocalFile[];
  images: { src: string; name: string }[];
};
export type Snapshot = {
  demo: boolean;
  profiles: Profile[];
  accounts: Account[];
  preferences?: Preferences;
  smtp?: Record<string, SmtpStatus>;
};
export const preferencesSchema = z.object({
  automaticChecks: z.boolean().default(true),
  intervalSeconds: z
    .union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)])
    .default(15),
  notifications: z.boolean().default(true),
  notificationPreviews: z.boolean().default(true),
  notificationSound: z.boolean().default(false),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});
export type InboxUpdate = {
  account: Account;
  messages: Message[];
  hasMore: boolean;
  checkedAt: number;
  fresh: Message[];
  catchUpLimited: boolean;
};
export type AppEvent =
  | { type: "inbox"; update: InboxUpdate }
  | { type: "connection"; snapshot: Snapshot; error?: string }
  | { type: "open-message"; account: Account; message: Message }
  | { type: "about" }
  | { type: "prepare-exit"; requestId: string }
  | { type: "notice"; message: string };
export type ListResult = { messages: Message[]; hasMore: boolean };
export type Result<T = unknown> =
  { ok: true; value: T } | { ok: false; error: string; paused?: boolean };
const text = z.string().max(1000);
const id = z.string().min(1).max(100);
const ref = { accountId: id, profileId: id };
export const composeSchema = z.object({
  id: id,
  from: text,
  to: text,
  cc: text,
  bcc: text,
  subject: z.string().max(998),
  body: z.string().max(30_000_000),
  format: z.enum(["plaintext", "html"]).optional(),
  attachments: z
    .array(z.object({ id, name: text, size: z.number().nonnegative() }))
    .max(20),
  replyId: z.string().max(100).optional(),
  replyFolderId: z.string().max(100).optional(),
  schedule: z.enum(["now", "1", "2", "3"]).default("now"),
});
export type Compose = z.infer<typeof composeSchema>;
export const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("snapshot") }),
  z.object({ op: z.literal("demo") }),
  z.object({ op: z.literal("preferences"), preferences: preferencesSchema }),
  z.object({ op: z.literal("checkNow") }),
  z.object({ op: z.literal("testNotification") }),
  z.object({
    op: z.literal("quitReady"),
    requestId: id,
    error: z.string().max(500).optional(),
  }),
  z.object({ op: z.literal("demoArrival") }),
  z.object({
    op: z.literal("connect"),
    email: z.email(),
    region: z.enum(Object.keys(REGIONS) as [Region, ...Region[]]),
    clientId: z.string().min(8).max(500),
    clientSecret: z.string().min(8).max(500),
    code: z.string().min(8).max(1000),
  }),
  z.object({
    op: z.literal("resume"),
    profileId: id,
    reviewed: z.literal(true),
  }),
  z.object({ op: z.literal("disconnect"), profileId: id }),
  z.object({ op: z.literal("forget"), profileId: id }),
  z.object({ op: z.literal("folders"), ...ref }),
  z.object({ op: z.literal("labels"), ...ref }),
  z.object({ op: z.literal("signatures"), ...ref }),
  z.object({ op: z.literal("recipientHistory"), ...ref }),
  z.object({
    op: z.literal("configureSmtp"),
    ...ref,
    password: z.string().min(1).max(500),
    server: z.enum(["standard", "pro"]).default("standard"),
  }),
  z.object({ op: z.literal("removeSmtp"), ...ref }),
  z.object({ op: z.literal("testSmtp"), ...ref }),
  z.object({
    op: z.literal("list"),
    ...ref,
    folderId: z.string().max(100).optional(),
    labelId: z.string().max(100).optional(),
    threadId: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    query: z.string().max(1000).optional(),
    filter: z.enum(["all", "unread", "flagged", "archive"]).default("all"),
    start: z.number().int().min(1).max(1_000_000).default(1),
  }),
  z.object({
    op: z.literal("detail"),
    ...ref,
    folderId: id,
    messageId: id,
    attachments: z.boolean().default(false),
  }),
  z.object({ op: z.literal("headers"), ...ref, folderId: id, messageId: id }),
  z.object({
    op: z.literal("action"),
    ...ref,
    ids: z.array(id).min(1).max(100),
    action: z.enum([
      "read",
      "unread",
      "flag",
      "unflag",
      "archive",
      "unarchive",
      "spam",
      "notspam",
      "move",
      "label",
      "unlabel",
    ]),
    target: z.string().max(100).optional(),
  }),
  z.object({
    op: z.literal("createFolder"),
    ...ref,
    name: z
      .string()
      .regex(/^[\p{L} ]{1,80}$/u, "Use letters and spaces for folder names."),
    parentId: z.string().max(100).optional(),
  }),
  z.object({
    op: z.literal("renameFolder"),
    ...ref,
    folderId: id,
    name: z.string().regex(/^[\p{L} ]{1,80}$/u),
  }),
  z.object({
    op: z.literal("createLabel"),
    ...ref,
    name: z.string().min(1).max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  z.object({ op: z.literal("pickFiles"), ...ref }),
  z.object({ op: z.literal("pasteClipboard"), ...ref }),
  z.object({
    op: z.literal("importPaste"),
    ...ref,
    assets: z
      .array(
        z.object({
          name: z.string().min(1).max(255),
          mime: z.string().max(100),
          base64: z.string().max(28_000_000),
          inline: z.boolean(),
        }),
      )
      .min(1)
      .max(20),
  }),
  z.object({
    op: z.literal("saveAttachment"),
    ...ref,
    folderId: id,
    messageId: id,
    attachmentId: id,
    name: text,
  }),
  z.object({
    op: z.literal("send"),
    ...ref,
    compose: composeSchema,
    confirmed: z.literal(true),
  }),
  z.object({ op: z.literal("saveCloudDraft"), ...ref, compose: composeSchema }),
  z.object({ op: z.literal("getDraft"), ...ref }),
  z.object({ op: z.literal("listLocalDrafts"), ...ref }),
  z.object({
    op: z.literal("saveLocalDraft"),
    ...ref,
    compose: composeSchema.nullable(),
    draftId: z.string().max(100).optional(),
  }),
  z.object({ op: z.literal("openLink"), url: z.string().url().max(4000) }),
]);
export type Command = z.infer<typeof commandSchema>;
export interface Bridge {
  invoke(command: Command): Promise<Result>;
  onEvent?(listener: (event: AppEvent) => void): () => void;
}
declare global {
  interface Window {
    mail?: Bridge;
  }
}
export const PAGE_SIZE = 40;
export function blankCompose(from: string): Compose {
  return {
    id: crypto.randomUUID(),
    from,
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    attachments: [],
    schedule: "now",
  };
}
export function addresses(value: string): string[] {
  const decoded = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  return [
    ...new Set(
      (
        decoded.match(
          /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi,
        ) || []
      ).map((s) => s.toLowerCase()),
    ),
  ];
}
export function validateRecipients(c: Compose, aliases: string[]): void {
  if (!aliases.map((a) => a.toLowerCase()).includes(c.from.toLowerCase()))
    throw new Error("Choose an authorized From address.");
  if (!c.to.trim()) throw new Error("Add at least one To recipient.");
  for (const field of [c.to, c.cc, c.bcc]) {
    if (/[\r\n]/.test(field))
      throw new Error("Recipient fields cannot contain line breaks.");
    for (const entry of field.split(/[;,]/).filter((s) => s.trim()))
      if (!z.email().safeParse(entry.trim()).success)
        throw new Error("Use full email addresses separated by commas.");
  }
  if (/[\r\n]/.test(c.subject))
    throw new Error("The subject cannot contain line breaks.");
}
