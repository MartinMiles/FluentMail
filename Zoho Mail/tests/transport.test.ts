import { describe, it, expect, vi } from "vitest";
import {
  ZohoTransport,
  Pacer,
  normalizeMessage,
  type Secret,
  type Fetcher,
} from "../desktop/transport";
const secret = (): Secret => ({
  id: "offline",
  email: "alex@example.test",
  region: "US",
  clientId: "fixture-client",
  clientSecret: "fixture-secret",
  refreshToken: "fixture-refresh",
  accessToken: "fixture-access",
  expiresAt: Date.now() + 3600_000,
  paused: null,
});
function setup(
  fetcher: Fetcher = async () =>
    new Response('{"status":{"code":200},"data":[]}'),
) {
  const save = vi.fn();
  const fetchMock = vi.fn(fetcher);
  const transport = new ZohoTransport(
    secret(),
    { save },
    new Pacer(0),
    fetchMock,
  );
  transport.connected = true;
  return { transport, save, fetcher: fetchMock };
}
describe("Zoho transport contracts and stop conditions", () => {
  it("identifies a rejected operation without disclosing provider payloads or private query values", async () => {
    const { transport, fetcher } = setup(
      async () =>
        new Response(
          JSON.stringify({
            status: { code: 400 },
            data: { errorMessage: "private account information" },
          }),
          { status: 400 },
        ),
    );
    await expect(
      transport.request("/api/accounts/123/folders"),
    ).rejects.toThrow("folder loading (HTTP 400, API 400)");
    expect(transport.secret.paused).not.toContain("123");
    expect(transport.secret.paused).not.toContain("private");
    await expect(
      transport.request("/api/accounts/123/folders"),
    ).rejects.toThrow("No retry");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves IDs beyond JavaScript integer precision", async () => {
    const { transport } = setup(
      vi.fn(
        async () =>
          new Response(
            '{"status":{"code":200},"data":{"messageId":1709876190693100009}}',
          ),
      ),
    );
    expect(
      (await transport.request("/api/accounts/1/messages/view")).messageId,
    ).toBe("1709876190693100009");
  });
  it("constructs a regional authenticated request without leaking secrets into URL", async () => {
    const { transport, fetcher } = setup();
    transport.secret.region = "EU";
    await transport.request("/api/accounts/1/folders");
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://mail.zoho.eu/api/accounts/1/folders");
    expect(init.headers).toMatchObject({
      Authorization: "Zoho-oauthtoken fixture-access",
    });
    expect(init.redirect).toBe("error");
  });
  it.each([401, 403, 429])(
    "latches HTTP %i and cancels queued calls",
    async (status) => {
      const { transport, fetcher, save } = setup(
        vi.fn(async () => new Response("private error payload", { status })),
      );
      const results = await Promise.allSettled([
        transport.request("/api/accounts"),
        transport.request("/api/accounts"),
      ]);
      expect(results.every((r) => r.status === "rejected")).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(transport.connected).toBe(false);
      expect(save).toHaveBeenCalled();
      expect(transport.secret.paused).not.toContain("private error");
    },
  );
  it("stops on an API error envelope even when HTTP is 200", async () => {
    const { transport, fetcher } = setup(
      vi.fn(
        async () =>
          new Response('{"status":{"code":403},"data":{"token":"private"}}'),
      ),
    );
    await expect(transport.request("/api/accounts")).rejects.toThrow("API 403");
    await expect(transport.request("/api/accounts")).rejects.toThrow("API 403");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not replay a send after an uncertain network failure", async () => {
    const { transport, fetcher } = setup(
      vi.fn(async () => {
        throw new Error("secret private server trace");
      }),
    );
    await expect(
      transport.request("/api/accounts/1/messages", "POST", {
        content: "fixture",
      }),
    ).rejects.toThrow("outcome is unknown");
    expect(transport.secret.paused).not.toContain("private");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops on an HTML login/challenge response", async () => {
    const { transport } = setup(
      vi.fn(async () => new Response("<html>Sign in</html>")),
    );
    await expect(transport.request("/api/accounts")).rejects.toThrow(
      "Unexpected response",
    );
    expect(transport.connected).toBe(false);
  });
  it("renews an expiring connected session once before concurrent API reads", async () => {
    const { transport, fetcher } = setup(
      vi.fn(async (url: string) =>
        url.endsWith("/token")
          ? new Response(
              JSON.stringify({
                access_token: "renewed-fixture",
                expires_in: 3600,
              }),
            )
          : new Response('{"status":{"code":200},"data":[]}'),
      ),
    );
    transport.secret.expiresAt = 0;
    await Promise.all([
      transport.request("/api/accounts"),
      transport.request("/api/accounts/1/folders"),
    ]);
    expect(
      fetcher.mock.calls.filter(([url]) => url.endsWith("/token")),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(transport.secret.accessToken).toBe("renewed-fixture");
  });
  it("pauses on failed renewal without retrying the refresh or the mail request", async () => {
    const { transport, fetcher } = setup(
      vi.fn(async () => new Response('{"error":"invalid_grant"}')),
    );
    transport.secret.expiresAt = 0;
    const results = await Promise.allSettled([
      transport.request("/api/accounts"),
      transport.request("/api/accounts"),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(transport.connected).toBe(false);
  });
  it("does not perform any network access on construction or while disconnected", async () => {
    const { transport, fetcher } = setup();
    transport.connected = false;
    await expect(transport.request("/api/accounts")).rejects.toThrow("Connect");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects injected API hosts and parent path traversal", async () => {
    const { transport, fetcher } = setup();
    await expect(
      transport.request("https://evil.test/api/accounts"),
    ).rejects.toThrow("route");
    await expect(
      transport.request("/api/accounts/../organization"),
    ).rejects.toThrow("route");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses one authorization-code exchange and stores refresh credentials", async () => {
    const { transport, fetcher, save } = setup(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "new-fixture-token",
              refresh_token: "new-fixture-refresh",
              expires_in: 3600,
            }),
          ),
      ),
    );
    await transport.authorize("fixture-grant");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(init.body as string).get("grant_type")).toBe(
      "authorization_code",
    );
    expect(transport.secret.refreshToken).toBe("new-fixture-refresh");
    expect(save).toHaveBeenCalled();
  });
  it("stops at rejected authorization without retrying", async () => {
    const { transport, fetcher } = setup(
      vi.fn(async () => new Response('{"error":"invalid_code"}')),
    );
    await expect(transport.authorize("fixture-grant")).rejects.toThrow(
      "did not accept",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(transport.connected).toBe(false);
  });
  it("downloads a JSON attachment as bytes instead of treating it as an API envelope", async () => {
    const { transport } = setup(
      vi.fn(
        async () =>
          new Response('{"hello":"world"}', {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const bytes = await transport.request(
      "/api/accounts/1/folders/2/messages/3/attachments/4",
      "GET",
      undefined,
      true,
    );
    expect(new TextDecoder().decode(bytes)).toBe('{"hello":"world"}');
  });
  it("serializes requests at less than the documented 30/minute rate", async () => {
    let now = 10_000;
    const times: number[] = [];
    const pacer = new Pacer(
      2600,
      () => now,
      async (delay) => {
        now += delay;
      },
    );
    await Promise.all(
      [1, 2, 3, 4].map(() => pacer.run(async () => times.push(now))),
    );
    expect(times).toEqual([10000, 12600, 15200, 17800]);
  });
  it("normalizes numeric and textual read status and flags", () => {
    expect(
      normalizeMessage({ messageId: "1", status: "unread", flagid: 2 }),
    ).toMatchObject({ id: "1", unread: true, flag: "important" });
    expect(
      normalizeMessage({ status: "1", flagid: "flag_not_set" }),
    ).toMatchObject({ unread: false, flag: "flag_not_set" });
  });
});
