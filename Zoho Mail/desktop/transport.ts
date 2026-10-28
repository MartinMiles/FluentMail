import JSONbigFactory from "json-bigint";
import { REGIONS, type Region } from "../src/shared";

const JSONbig = JSONbigFactory({
  storeAsString: true,
  protoAction: "error",
  constructorAction: "error",
});
/** Fixed labels only: never expose account IDs, queries, message text or raw provider errors. */
function operationLabel(path: string, method: string) {
  const route = path.split("?")[0];
  if (route === "/api/accounts") return "account discovery";
  if (/\/folders$/.test(route) && method === "GET") return "folder loading";
  if (/\/labels$/.test(route) && method === "GET") return "label loading";
  if (/\/messages\/(view|search)$/.test(route)) return "mail listing";
  if (/\/messages\/attachments$/.test(route)) return "attachment upload";
  if (/\/messages(?:\/[^/]+)?$/.test(route) && method === "POST")
    return "message submission";
  return "mail operation";
}
export type Secret = {
  id: string;
  email: string;
  region: Region;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  paused: string | null;
};
export interface SecretStore {
  save(secret: Secret): void;
}
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export class PausedError extends Error {}
export class Pacer {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(
    private interval = 2600,
    private now = () => Date.now(),
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.tail.then(async () => {
      const delay = this.interval - (this.now() - this.last);
      if (delay > 0) await this.sleep(delay);
      this.last = this.now();
      return fn();
    });
    this.tail = p.catch(() => {});
    return p;
  }
}
export class ZohoTransport {
  connected = false;
  private refreshing: Promise<void> | undefined;
  constructor(
    public secret: Secret,
    private store: SecretStore,
    private pacer: Pacer,
    private fetcher: Fetcher = fetch,
  ) {}
  stop(message: string): never {
    this.connected = false;
    this.secret.paused = message;
    this.store.save(this.secret);
    throw new PausedError(message);
  }
  private async fetchOnce(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return this.stop(
        "Connection stopped: the request outcome is unknown. Review Zoho before reconnecting; a send may already have completed.",
      );
    }
  }
  private async token(params: URLSearchParams): Promise<void> {
    const res = await this.fetchOnce(
      REGIONS[this.secret.region].auth + "/oauth/v2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
    );
    let data: any;
    try {
      data = JSONbig.parse(await res.text());
    } catch {
      return this.stop(
        "Zoho returned an unexpected authentication response. No retry was made.",
      );
    }
    if (
      !res.ok ||
      data.error ||
      typeof data.access_token !== "string" ||
      !Number.isFinite(Number(data.expires_in)) ||
      Number(data.expires_in) <= 0
    )
      return this.stop(
        "Zoho did not accept this authorization. Review the account and OAuth setup before trying again.",
      );
    this.secret.accessToken = data.access_token;
    this.secret.refreshToken = data.refresh_token || this.secret.refreshToken;
    if (!this.secret.refreshToken)
      return this.stop(
        "Zoho did not return a refresh token. Review the OAuth grant; no retry was made.",
      );
    this.secret.expiresAt = Date.now() + Number(data.expires_in) * 1000;
    this.store.save(this.secret);
  }
  async authorize(code?: string): Promise<void> {
    // Called only by an explicit connect/resume action, never during construction or startup.
    this.secret.paused = null;
    const p = new URLSearchParams({
      client_id: this.secret.clientId,
      client_secret: this.secret.clientSecret,
    });
    if (code) {
      p.set("grant_type", "authorization_code");
      p.set("code", code);
    } else {
      p.set("grant_type", "refresh_token");
      p.set("refresh_token", this.secret.refreshToken);
    }
    await this.pacer.run(() => this.token(p));
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
  private async ensureAccess() {
    if (Date.now() < this.secret.expiresAt - 30_000) return;
    if (!this.refreshing)
      this.refreshing = this.pacer
        .run(async () => {
          if (!this.connected || this.secret.paused)
            throw new PausedError(
              this.secret.paused || "Account disconnected.",
            );
          if (Date.now() < this.secret.expiresAt - 30_000) return;
          await this.token(
            new URLSearchParams({
              grant_type: "refresh_token",
              client_id: this.secret.clientId,
              client_secret: this.secret.clientSecret,
              refresh_token: this.secret.refreshToken,
            }),
          );
        })
        .finally(() => {
          this.refreshing = undefined;
        });
    await this.refreshing;
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    binary = false,
  ): Promise<any> {
    const operation = operationLabel(path, method);
    if (!this.connected || this.secret.paused)
      throw new PausedError(
        this.secret.paused || "Connect this account to load mail.",
      );
    if (
      !path.startsWith("/api/accounts") ||
      path.includes("..") ||
      path.includes("://")
    )
      throw new Error("Invalid API route.");
    await this.ensureAccess();
    return this.pacer.run(async () => {
      if (!this.connected || this.secret.paused)
        throw new PausedError(this.secret.paused || "Account disconnected.");
      if (Date.now() >= this.secret.expiresAt - 30_000) {
        // An unexpectedly short token or an exceptionally delayed queue does not loop renewal.
        this.connected = false;
        throw new PausedError(
          "Your access session expired while waiting. Reconnect explicitly to continue.",
        );
      }
      const raw = body instanceof Uint8Array;
      const res = await this.fetchOnce(
        REGIONS[this.secret.region].mail + path,
        {
          method,
          headers: {
            Authorization: "Zoho-oauthtoken " + this.secret.accessToken,
            Accept: binary ? "application/octet-stream" : "application/json",
            ...(body !== undefined
              ? {
                  "Content-Type": raw
                    ? "application/octet-stream"
                    : "application/json",
                }
              : {}),
          },
          body:
            body === undefined
              ? undefined
              : raw
                ? (body as unknown as BodyInit)
                : JSON.stringify(body),
        },
      );
      if (res.status === 401 || res.status === 403 || res.status === 429)
        return this.stop(
          `Zoho paused this connection during ${operation} (HTTP ${res.status}). No retry was made. Review account access or limits before reconnecting.`,
        );
      if (res.status >= 500)
        return this.stop(
          "Zoho returned a server error. The request outcome may be unknown; no retry was made.",
        );
      if (binary && res.ok) {
        if (Number(res.headers.get("content-length") || 0) > 30 * 1024 * 1024)
          throw new Error(
            "Attachment exceeds this client’s 30 MB download limit.",
          );
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await res.arrayBuffer());
        } catch {
          return this.stop(
            "Attachment transfer interrupted. Connection stopped without a retry.",
          );
        }
        if (bytes.length > 30 * 1024 * 1024)
          throw new Error(
            "Attachment exceeds this client’s 30 MB download limit.",
          );
        if (res.headers.get("content-type")?.includes("application/json")) {
          let envelope: any;
          try {
            envelope = JSONbig.parse(new TextDecoder().decode(bytes));
          } catch {
            /* An attachment may contain any JSON or text. */
          }
          if (Number(envelope?.status?.code) >= 400)
            return this.stop(
              "Zoho rejected the attachment request. No retry was made.",
            );
        }
        return bytes;
      }
      let data: any;
      try {
        data = JSONbig.parse(await res.text());
      } catch {
        return this.stop(
          "Unexpected response from Zoho. Connection stopped without a retry.",
        );
      }
      const code = Number(data?.status?.code);
      if ([401, 403, 429].includes(code))
        return this.stop(
          `Zoho paused this connection during ${operation} (API ${code}). Review account access or limits before reconnecting.`,
        );
      if (!res.ok || code >= 400) {
        // Do not echo provider payloads: these can contain tokens, message text, or account information.
        return this.stop(
          `Zoho rejected ${operation} (HTTP ${res.status}, API ${Number.isFinite(code) ? code : "unknown"}). No retry was made. Review request details and mailbox access before reconnecting.`,
        );
      }
      if (!Number.isFinite(code) || code < 200 || code >= 300)
        return this.stop(
          "Unrecognized API response. Connection stopped without a retry.",
        );
      return data.data;
    });
  }
}
export function remoteId(value: string): string {
  if (!/^\d{1,30}$/.test(value)) throw new Error("Invalid Zoho identifier.");
  return value;
}
export function normalizeMessage(m: any) {
  const flag =
    { 0: "flag_not_set", 1: "info", 2: "important", 3: "followup" }[
      m.flagid as 0
    ] || String(m.flagid || "flag_not_set");
  return {
    id: String(m.messageId),
    folderId: String(m.folderId),
    threadId: String(m.threadId || ""),
    subject: String(m.subject || "(No subject)"),
    sender: String(m.sender || m.fromAddress || ""),
    from: String(m.fromAddress || ""),
    to: String(m.toAddress || ""),
    cc: m.ccAddress === "Not Provided" ? "" : String(m.ccAddress || ""),
    summary: String(m.summary || ""),
    time: Number(m.receivedTime || m.receivedtime || m.sentDateInGMT || 0),
    unread: m.status === "unread" || String(m.status) === "0",
    flag,
    hasAttachment: m.hasAttachment === true || String(m.hasAttachment) === "1",
    labels: Array.isArray(m.labelId) ? m.labelId.map(String) : [],
  };
}
