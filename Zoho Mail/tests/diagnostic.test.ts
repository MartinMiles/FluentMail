import { describe, it, expect, vi } from "vitest";
import { diagnoseMailbox } from "../desktop/diagnostic";
import { Pacer, type Secret } from "../desktop/transport";
const secret: Secret = {
  id: "fixture",
  email: "alex@example.test",
  region: "US",
  clientId: "fixture-client",
  clientSecret: "fixture-secret",
  refreshToken: "fixture-refresh",
  accessToken: "fixture-access",
  expiresAt: 0,
  paused: "old fixture rejection",
};
const response = (data: unknown) =>
  new Response(JSON.stringify({ status: { code: 200 }, data }));
describe("bounded read-only account diagnostic", () => {
  it("inspects only the latest Sent message with the approved subject, exporting image structure only", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/token")
        ? new Response(
            JSON.stringify({
              access_token: "new-fixture-access",
              expires_in: 3600,
            }),
          )
        : url.endsWith("/api/accounts")
          ? response([
              {
                type: "ZOHO_ACCOUNT",
                accountId: "100",
                mailboxAddress: "alex@example.test",
              },
            ])
          : url.endsWith("/folders")
            ? response([
                {
                  folderId: "20",
                  folderName: "Sent",
                  path: "/Sent",
                  folderType: "Sent",
                },
              ])
            : url.includes("/messages/view?")
              ? response([
                  {
                    messageId: "30",
                    subject: "Approved fixture",
                    sentDateInGMT: 10,
                  },
                  {
                    messageId: "31",
                    subject: "Private unrelated fixture",
                    sentDateInGMT: 20,
                  },
                ])
              : response({
                  content:
                    'Content-Type: text/html\r\n\r\n<p>private body</p><img src="/zm/ImageSignature?fileName=private.png">',
                }),
    );
    const report = await diagnoseMailbox(
      secret,
      fetcher,
      new Pacer(0),
      "Approved fixture",
    );
    expect(report.failure).toBeUndefined();
    expect(report.images?.sourceKinds).toEqual({ "compose-preview": 1 });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls[4][0]).toContain("/messages/30/originalmessage");
    expect(JSON.stringify(report)).not.toMatch(
      /private|Approved fixture|example.test/i,
    );
  });
  it("identifies the first rejected endpoint and symbolic provider code without leaking its error prose", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/token")
        ? new Response(
            JSON.stringify({
              access_token: "new-fixture-access",
              expires_in: 3600,
            }),
          )
        : url.endsWith("/api/accounts")
          ? response([
              {
                type: "ZOHO_ACCOUNT",
                accountId: "100",
                mailboxAddress: "alex@example.test",
              },
            ])
          : new Response(
              JSON.stringify({
                status: { code: 400 },
                data: {
                  errorCode: "INVALID_ACCOUNT",
                  errorMessage: "private account information fixture-access",
                },
              }),
              { status: 400 },
            ),
    );
    const report = await diagnoseMailbox(secret, fetcher, new Pacer(0));
    expect(report.failure).toMatchObject({
      operation: "folder loading",
      httpStatus: 400,
      apiStatus: 400,
      providerCode: "INVALID_ACCOUNT",
      category: "Mailbox account",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(report)).not.toMatch(
      /private|fixture-access|alex@|100/,
    );
    expect(secret.accessToken).toBe("fixture-access");
    expect(secret.paused).toBe("old fixture rejection");
  });
  it("performs only one refresh and four GETs, reports no mail contents and never probes other accounts", async () => {
    const fetcher = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith("/token")
        ? new Response(
            JSON.stringify({
              access_token: "new-fixture-access",
              expires_in: 3600,
            }),
          )
        : url.endsWith("/api/accounts")
          ? response([
              {
                type: "ZOHO_ACCOUNT",
                accountId: "100",
                mailboxAddress: "alex@example.test",
              },
            ])
          : url.endsWith("/folders")
            ? response([
                {
                  folderId: "10",
                  folderName: "Inbox",
                  path: "/Inbox",
                  folderType: "Inbox",
                },
              ])
            : response([]),
    );
    const report = await diagnoseMailbox(secret, fetcher, new Pacer(0));
    expect(report.failure).toBeUndefined();
    expect(report.steps).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
      "POST",
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
    expect(JSON.stringify(report)).not.toContain("example.test");
  });
  it("stops after one rejected authorization without attempting mailbox reads", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "invalid_grant", private: "never exported" }),
          { status: 400 },
        ),
    );
    const report = await diagnoseMailbox(secret, fetcher, new Pacer(0));
    expect(report.failure?.operation).toBe("authorization");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report)).not.toContain("never exported");
  });
});
