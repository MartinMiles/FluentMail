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
/** The mail API operation never reached fetch; retaining a pending-send marker
 * would incorrectly lock a draft that has not been submitted. */
export class UnsentRequestError extends PausedError {}
class CancelledConnectionError extends PausedError {}
class DownloadLimitError extends Error {}
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
  private epoch = 0;
  private cancelled = false;
  constructor(
    public secret: Secret,
    private store: SecretStore,
    private pacer: Pacer,
    private fetcher: Fetcher = fetch,
  ) {}
  stop(message: string): never {
    if (this.cancelled)
      throw new CancelledConnectionError(
        "This connection was closed. Its old response was discarded.",
      );
    this.connected = false;
    this.secret.paused = message;
    this.store.save(this.secret);
    throw new PausedError(message);
  }
  private assertActive(epoch: number) {
    if (this.cancelled || epoch !== this.epoch)
      throw new CancelledConnectionError(
        "This connection was closed. Its old response was discarded.",
      );
  }
  private async fetchOnce(
    url: string,
    init: RequestInit,
    epoch = this.epoch,
  ): Promise<Response> {
    this.assertActive(epoch);
    try {
      const response = await this.fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
      });
      this.assertActive(epoch);
      return response;
    } catch {
      this.assertActive(epoch);
      return this.stop(
        "Connection stopped: the request outcome is unknown. Review Zoho before reconnecting; a send may already have completed.",
      );
    }
  }
  private async token(
    params: URLSearchParams,
    epoch = this.epoch,
  ): Promise<void> {
    this.assertActive(epoch);
    const res = await this.fetchOnce(
      REGIONS[this.secret.region].auth + "/oauth/v2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      epoch,
    );
    let data: any;
    try {
      data = JSONbig.parse(await res.text());
    } catch {
      this.assertActive(epoch);
      return this.stop(
        "Zoho returned an unexpected authentication response. No retry was made.",
      );
    }
    this.assertActive(epoch);
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
    if (Number(data.expires_in) <= 30)
      return this.stop(
        "Zoho returned an access session too short for this client. No retry was made.",
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
    const epoch = ++this.epoch;
    this.cancelled = false;
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
    await this.pacer.run(() => this.token(p, epoch));
    this.assertActive(epoch);
    this.connected = true;
  }
  disconnect() {
    this.epoch++;
    this.cancelled = true;
    this.connected = false;
  }
  private async ensureAccess() {
    const epoch = this.epoch;
    if (Date.now() < this.secret.expiresAt - 30_000) return;
    if (!this.refreshing)
      this.refreshing = this.pacer
        .run(async () => {
          this.assertActive(epoch);
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
            epoch,
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
      throw new UnsentRequestError(
        this.secret.paused || "Connect this account to load mail.",
      );
    // Query strings can legitimately contain ellipses, filenames or URLs.
    // Only the fixed route controls where the authorization header is sent.
    if (!/^\/api\/accounts(?:\/[A-Za-z0-9_-]+)*\/?$/.test(path.split("?")[0]))
      throw new Error("Invalid API route.");
    let issued = false;
    const renew = Symbol("renew-before-first-request");
    const epoch = this.epoch;
    try {
      await this.ensureAccess();
      this.assertActive(epoch);
      if (Date.now() >= this.secret.expiresAt - 30_000)
        this.stop(
          "The access session is too short to issue this operation safely. Review authorization before reconnecting.",
        );
      const queued = () =>
        this.pacer.run(async () => {
          this.assertActive(epoch);
          if (!this.connected || this.secret.paused)
            throw new PausedError(
              this.secret.paused || "Account disconnected.",
            );
          if (Date.now() >= this.secret.expiresAt - 30_000) {
            return renew;
          }
          const raw = body instanceof Uint8Array;
          issued = true;
          const res = await this.fetchOnce(
            REGIONS[this.secret.region].mail + path,
            {
              method,
              headers: {
                Authorization: "Zoho-oauthtoken " + this.secret.accessToken,
                Accept: binary
                  ? "application/octet-stream"
                  : "application/json",
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
            epoch,
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
            const max = 30 * 1024 * 1024;
            if (Number(res.headers.get("content-length") || 0) > max) {
              await res.body?.cancel().catch(() => {});
              throw new Error(
                "Attachment exceeds this client’s 30 MB download limit.",
              );
            }
            let bytes: Uint8Array;
            const reader = res.body?.getReader();
            try {
              const chunks: Uint8Array[] = [];
              let size = 0;
              if (reader)
                while (true) {
                  const part = await reader.read();
                  this.assertActive(epoch);
                  if (part.done) break;
                  size += part.value.length;
                  if (size > max) {
                    await reader.cancel().catch(() => {});
                    throw new DownloadLimitError(
                      "Attachment exceeds this client’s 30 MB download limit.",
                    );
                  }
                  chunks.push(part.value);
                }
              bytes = new Uint8Array(size);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
              }
            } catch (error) {
              if (this.cancelled || epoch !== this.epoch) {
                await reader?.cancel().catch(() => {});
                this.assertActive(epoch);
              }
              if (error instanceof DownloadLimitError) throw error;
              return this.stop(
                "Attachment transfer interrupted. Connection stopped without a retry.",
              );
            } finally {
              reader?.releaseLock();
            }
            if (
              res.headers
                .get("content-type")
                ?.toLowerCase()
                .includes("application/json") &&
              !/^\s*attachment\b/i.test(
                res.headers.get("content-disposition") || "",
              )
            ) {
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
            this.assertActive(epoch);
            return this.stop(
              "Unexpected response from Zoho. Connection stopped without a retry.",
            );
          }
          this.assertActive(epoch);
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
      let result = await queued();
      if (result === renew) {
        await this.ensureAccess();
        if (Date.now() >= this.secret.expiresAt - 30_000)
          this.stop(
            "The renewed access session is too short to issue this operation safely. No mail request was made.",
          );
        result = await queued();
        if (result === renew)
          this.stop(
            "The access session expired again while waiting. Review the account before reconnecting; no mail request was made.",
          );
      }
      return result;
    } catch (error) {
      if (!issued)
        throw new UnsentRequestError(
          error instanceof Error
            ? error.message
            : "The operation was not submitted.",
        );
      throw error;
    }
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
    threadId: String(m.threadId || "") === "0" ? "" : String(m.threadId || ""),
    threadCount: Math.max(1, Math.min(1_000_000, Number(m.threadCount) || 1)),
    hasInline:
      m.hasInline === true || ["true", "1"].includes(String(m.hasInline)),
    subject: String(m.subject || "(No subject)"),
    sender: String(m.sender || m.fromAddress || ""),
    from: String(m.fromAddress || ""),
    to: String(m.toAddress || ""),
    cc: m.ccAddress === "Not Provided" ? "" : String(m.ccAddress || ""),
    summary: String(m.summary || ""),
    time:
      [m.receivedTime, m.receivedtime, m.sentDateInGMT]
        .map(Number)
        .find((time) => Number.isFinite(time) && time > 0 && time <= 8.64e15) ||
      0,
    unread: m.status === "unread" || String(m.status) === "0",
    flag,
    hasAttachment:
      m.hasAttachment === true ||
      ["1", "true"].includes(String(m.hasAttachment)),
    labels: Array.isArray(m.labelId) ? m.labelId.map(String) : [],
  };
}
