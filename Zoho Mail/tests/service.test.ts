import { afterEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Vault } from "../desktop/vault";
import { MailService } from "../desktop/service";
import { Pacer } from "../desktop/transport";
import { blankCompose } from "../src/shared";
const dirs: string[] = [];
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) =>
    Buffer.from(Buffer.from(s).map((b) => b ^ 0x55)),
  decryptString: (b: Buffer) => Buffer.from(b.map((n) => n ^ 0x55)).toString(),
};
const ok = (data: unknown) =>
  new Response(JSON.stringify({ status: { code: 200 }, data }), {
    headers: { "Content-Type": "application/json" },
  });
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fluent-offline-test-"));
  dirs.push(dir);
  const vault = new Vault(path.join(dir, "fixture.vault"), cipher);
  const fetcher = vi.fn(async (url: string, _init: RequestInit) =>
    url.endsWith("/token")
      ? new Response(
          JSON.stringify({
            access_token: "fake-access",
            refresh_token: "fake-refresh",
            expires_in: 3600,
          }),
        )
      : ok([
          {
            type: "ZOHO_ACCOUNT",
            accountId: "100",
            mailboxAddress: "alex@example.test",
            displayName: "Alex",
            emailAddress: [],
          },
        ]),
  );
  const dialogs = {
    pick: vi.fn(async () => [] as string[]),
    save: vi.fn(async () => null),
    open: vi.fn(async () => false),
  };
  return {
    dir,
    vault,
    fetcher,
    dialogs,
    service: new MailService(vault, dialogs, new Pacer(0), fetcher),
  };
}
async function connect(s: ReturnType<typeof setup>) {
  const result = await s.service.invoke({
    op: "connect",
    email: "alex@example.test",
    region: "US",
    clientId: "fake-client-id",
    clientSecret: "fake-secret-value",
    code: "fake-grant-code",
  });
  expect(result.ok).toBe(true);
  const profileId = s.service.snapshot().profiles[0].id;
  return { profileId, accountId: "100" };
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
describe("application boundary and persistence", () => {
  it("loads fresh recipient history after an explicit reconnection", async () => {
    const s = setup(),
      ref = await connect(s);
    const folders = [
      { folderId: "2", folderName: "Sent", folderType: "Sent", path: "/Sent" },
    ];
    s.fetcher
      .mockResolvedValueOnce(ok(folders))
      .mockResolvedValueOnce(
        ok([{ messageId: "1", toAddress: "before@example.test" }]),
      );
    expect(
      (await s.service.invoke({ op: "recipientHistory", ...ref })).ok,
    ).toBe(true);
    s.fetcher
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "fresh-fixture-token",
            expires_in: 3600,
          }),
        ),
      )
      .mockResolvedValueOnce(
        ok([
          {
            type: "ZOHO_ACCOUNT",
            accountId: "100",
            mailboxAddress: "alex@example.test",
          },
        ]),
      );
    expect(
      (
        await s.service.invoke({
          op: "resume",
          profileId: ref.profileId,
          reviewed: true,
        })
      ).ok,
    ).toBe(true);
    s.fetcher
      .mockResolvedValueOnce(ok(folders))
      .mockResolvedValueOnce(
        ok([{ messageId: "2", toAddress: "after@example.test" }]),
      );
    expect(await s.service.invoke({ op: "recipientHistory", ...ref })).toEqual({
      ok: true,
      value: ["after@example.test", "before@example.test"],
    });
    expect(s.fetcher).toHaveBeenCalledTimes(8);
  });
  it("seeds recipient history once from Sent and persists successful sends in the encrypted vault", async () => {
    const s = setup(),
      ref = await connect(s);
    s.fetcher.mockImplementation(async (url) =>
      url.endsWith("/folders")
        ? ok([
            {
              folderId: "2",
              folderName: "Sent",
              folderType: "Sent",
              path: "/Sent",
            },
          ])
        : url.includes("/messages/view?")
          ? ok([
              {
                messageId: "300",
                toAddress: "Jamie <jamie@example.test>",
                ccAddress: "cc@example.test",
              },
            ])
          : ok({ messageId: "400" }),
    );
    const first = await s.service.invoke({ op: "recipientHistory", ...ref });
    expect(first).toEqual({
      ok: true,
      value: ["jamie@example.test", "cc@example.test"],
    });
    const count = s.fetcher.mock.calls.length;
    await s.service.invoke({ op: "recipientHistory", ...ref });
    expect(s.fetcher).toHaveBeenCalledTimes(count);
    const compose = {
      ...blankCompose("alex@example.test"),
      to: "new@example.test",
      bcc: "hidden@example.test",
    };
    expect(
      (await s.service.invoke({ op: "send", ...ref, compose, confirmed: true }))
        .ok,
    ).toBe(true);
    const key = ref.profileId + ":100";
    const restored = new Vault(path.join(s.dir, "fixture.vault"), cipher);
    expect(restored.recipients(key)).toEqual([
      "new@example.test",
      "hidden@example.test",
      "jamie@example.test",
      "cc@example.test",
    ]);
    expect(restored.recipients("other-profile:100")).toEqual([]);
    expect(restored.recipients(ref.profileId + ":200")).toEqual([]);
    expect(
      fs.readFileSync(path.join(s.dir, "fixture.vault")).toString(),
    ).not.toContain("new@example.test");
    const afterSend = await s.service.invoke({
      op: "recipientHistory",
      ...ref,
    });
    expect(afterSend.ok && afterSend.value).toEqual(restored.recipients(key));
    await s.service.invoke({ op: "forget", profileId: ref.profileId });
    expect(s.vault.recipients(key)).toEqual([]);
  });
  it("never retries a failed history seed and does not remember failed sends or cloud drafts", async () => {
    const s = setup(),
      ref = await connect(s);
    s.fetcher.mockResolvedValueOnce(ok({ messageId: "draft" }));
    const compose = {
      ...blankCompose("alex@example.test"),
      to: "unsent@example.test",
    };
    expect(
      (await s.service.invoke({ op: "saveCloudDraft", ...ref, compose })).ok,
    ).toBe(true);
    expect(s.vault.recipients(ref.profileId + ":100")).toEqual([]);
    s.fetcher.mockRejectedValueOnce(new Error("offline fixture"));
    expect(
      (await s.service.invoke({ op: "recipientHistory", ...ref })).ok,
    ).toBe(false);
    const count = s.fetcher.mock.calls.length;
    expect(
      (await s.service.invoke({ op: "recipientHistory", ...ref })).ok,
    ).toBe(false);
    expect(
      (await s.service.invoke({ op: "send", ...ref, compose, confirmed: true }))
        .ok,
    ).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(count);
    expect(s.vault.recipients(ref.profileId + ":100")).toEqual([]);
  });
  it("retains an inline-image draft and blocks broken delivery before any upload or submission", async () => {
    const s = setup();
    const ref = await connect(s);
    s.fetcher.mockImplementation(async (url, init) =>
      url.includes("/attachments?")
        ? ok({
            storeName: "fixture-store",
            attachmentPath: "/compose/image.png",
            attachmentName: "image.png",
            url: "/zm/ImageSignature?fileName=image.png&accountId=29254000000005001&storeName=fixture-store",
          })
        : ok({ messageId: "400" }),
    );
    const src =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=";
    const compose = {
      ...blankCompose("alex@example.test"),
      format: "html",
      to: "jamie@example.test",
      body: `<p>Screenshot<img src="${src}"></p>`,
    };
    await s.service.invoke({ op: "saveLocalDraft", ...ref, compose });
    const result = await s.service.invoke({
      op: "send",
      ...ref,
      compose,
      confirmed: true,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Inline image delivery");
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    expect(s.vault.data.submitted).toEqual({});
    expect(s.vault.data.drafts[ref.profileId + ":100:" + compose.id].body).toBe(
      compose.body,
    );
  });
  it("imports copied file bytes behind an opaque attachment handle", async () => {
    const s = setup();
    const ref = await connect(s);
    const r = await s.service.invoke({
      op: "importPaste",
      ...ref,
      assets: [
        {
          name: "report.pdf",
          mime: "application/pdf",
          base64: Buffer.from("fixture").toString("base64"),
          inline: false,
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = (r.value as any).attachments[0];
      expect(a.name).toBe("report.pdf");
      expect(a.id).not.toContain("report");
      expect(a.path).toBeUndefined();
    }
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it("loads a v1.0 vault with safe preferences without reconnecting", () => {
    const s = setup();
    expect(s.vault.data.preferences).toBeUndefined();
    const snapshot = s.service.snapshot();
    expect(snapshot.preferences).toMatchObject({
      automaticChecks: true,
      intervalSeconds: 15,
      notifications: true,
    });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("does not connect at startup or expose saved secrets through snapshots", async () => {
    const s = setup();
    const ref = await connect(s);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    const restarted = new MailService(
      s.vault,
      s.dialogs,
      new Pacer(0),
      s.fetcher,
    );
    expect(restarted.snapshot().profiles[0].connected).toBe(false);
    expect(JSON.stringify(restarted.snapshot())).not.toContain("fake-secret");
    expect(JSON.stringify(restarted.snapshot())).not.toContain("fake-access");
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    expect(ref.accountId).toBe("100");
  });
  it("requires an explicit confirmation flag for sending and validates recipients", async () => {
    const s = setup();
    const ref = await connect(s);
    const compose = {
      ...blankCompose("alex@example.test"),
      to: "jamie@example.test",
    };
    expect((await s.service.invoke({ op: "send", ...ref, compose })).ok).toBe(
      false,
    );
    expect(
      (
        await s.service.invoke({
          op: "send",
          ...ref,
          compose: { ...compose, to: "bad\r\nBcc: thief@example.test" },
          confirmed: true,
        })
      ).ok,
    ).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it("persists an uncertain send and rejects re-submission across restarts", async () => {
    const s = setup();
    const ref = await connect(s);
    const compose = {
      ...blankCompose("alex@example.test"),
      to: "jamie@example.test",
      body: "Offline test",
    };
    await s.service.invoke({ op: "saveLocalDraft", ...ref, compose });
    s.fetcher.mockRejectedValueOnce(new Error("network lost"));
    const result = await s.service.invoke({
      op: "send",
      ...ref,
      compose,
      confirmed: true,
    });
    expect(result.ok).toBe(false);
    expect(s.vault.data.submitted[ref.profileId + ":" + compose.id]).toBe(
      "pending",
    );
    expect(s.vault.data.drafts[ref.profileId + ":100:" + compose.id].body).toBe(
      "Offline test",
    );
    const vault2 = new Vault(path.join(s.dir, "fixture.vault"), cipher);
    expect(vault2.data.submitted).toEqual(s.vault.data.submitted);
    const before = s.fetcher.mock.calls.length;
    expect(
      (await s.service.invoke({ op: "send", ...ref, compose, confirmed: true }))
        .ok,
    ).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(before);
  });
  it("does not duplicate successful sends", async () => {
    const s = setup();
    const ref = await connect(s);
    s.fetcher.mockResolvedValueOnce(ok({ messageId: "400" }));
    const compose = {
      ...blankCompose("alex@example.test"),
      to: "jamie@example.test",
    };
    expect(
      (await s.service.invoke({ op: "send", ...ref, compose, confirmed: true }))
        .ok,
    ).toBe(true);
    expect(
      (await s.service.invoke({ op: "send", ...ref, compose, confirmed: true }))
        .ok,
    ).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not accept arbitrary local file paths from the renderer", async () => {
    const s = setup();
    const ref = await connect(s);
    const compose = {
      ...blankCompose("alex@example.test"),
      to: "jamie@example.test",
      attachments: [{ id: "C:/private/file.txt", name: "file.txt", size: 20 }],
    };
    const result = await s.service.invoke({
      op: "send",
      ...ref,
      compose,
      confirmed: true,
    });
    expect(result.ok).toBe(false);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it("stores local drafts separately by mailbox and encrypts persisted content", async () => {
    const s = setup();
    const ref = await connect(s);
    await s.service.invoke({
      op: "saveLocalDraft",
      ...ref,
      compose: {
        ...blankCompose("alex@example.test"),
        body: "private-fixture-text",
      },
    });
    expect(
      fs.readFileSync(path.join(s.dir, "fixture.vault"), "utf8"),
    ).not.toContain("private-fixture-text");
    expect(
      await s.service.invoke({ op: "getDraft", ...ref, accountId: "200" }),
    ).toEqual({ ok: true, value: null });
  });
  it("fails closed when Windows encryption is unavailable", () => {
    const s = setup();
    const vault = new Vault(path.join(s.dir, "unavailable.vault"), {
      ...cipher,
      isEncryptionAvailable: () => false,
    });
    expect(() => vault.persist()).toThrow("Nothing was stored in plaintext");
    expect(fs.existsSync(path.join(s.dir, "unavailable.vault"))).toBe(false);
  });
  it("forgets only local credentials and drafts, never deletes the remote user", async () => {
    const s = setup();
    const ref = await connect(s);
    await s.service.invoke({
      op: "saveLocalDraft",
      ...ref,
      compose: blankCompose("alex@example.test"),
    });
    await s.service.invoke({ op: "forget", profileId: ref.profileId });
    expect(s.service.snapshot().profiles).toHaveLength(0);
    expect(Object.keys(s.vault.data.drafts)).toHaveLength(0);
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it("blocks non-web external links", async () => {
    const s = setup();
    for (const url of [
      "file:///C:/Windows/system32/cmd.exe",
      "javascript:alert(1)",
      "https://user:password@example.test",
    ])
      expect((await s.service.invoke({ op: "openLink", url })).ok).toBe(false);
    expect(s.dialogs.open).not.toHaveBeenCalled();
  });
  it("keeps multiple local drafts and removes only the selected draft", async () => {
    const s = setup();
    const ref = await connect(s);
    const a = { ...blankCompose("alex@example.test"), body: "Draft A" };
    const b = { ...blankCompose("alex@example.test"), body: "Draft B" };
    await s.service.invoke({ op: "saveLocalDraft", ...ref, compose: a });
    await s.service.invoke({ op: "saveLocalDraft", ...ref, compose: b });
    let list = await s.service.invoke({ op: "listLocalDrafts", ...ref });
    expect(list.ok && (list.value as any[]).length).toBe(2);
    await s.service.invoke({
      op: "saveLocalDraft",
      ...ref,
      compose: null,
      draftId: a.id,
    });
    list = await s.service.invoke({ op: "listLocalDrafts", ...ref });
    expect(list.ok && (list.value as any[]).map((d) => d.body)).toEqual([
      "Draft B",
    ]);
  });
});
