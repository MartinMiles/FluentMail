import { describe, it, expect, vi } from "vitest";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  smtpMessage,
  smtpOptions,
  SmtpMailer,
  SmtpFailure,
  type SmtpClient,
} from "../desktop/smtp";
import { blankCompose, type Account } from "../src/shared";
import { inspectMimeImages } from "../desktop/mimeImages";
const account: Account = {
  id: "100",
  profileId: "fixture",
  email: "alex@example.test",
  name: "Alex Fixture",
  aliases: ["alex@example.test", "hello@example.test"],
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=";
const gif = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const compose = () => ({
  ...blankCompose(account.email),
  format: "html" as const,
  to: "jamie@example.test",
  body:
    '<p><strong>Before</strong></p><p><img src="' +
    png +
    '"></p><p>Between</p><p><img src="' +
    gif +
    '"></p><p>After</p>',
});
const login = {
  region: "US" as const,
  username: account.email,
  password: "fixture-smtp-password",
  server: "standard" as const,
};
async function mime(message: ReturnType<typeof smtpMessage>) {
  // Stream transport intentionally keeps Bcc for archiving. SMTP uses the
  // normal compiled MIME node, whose default excludes the Bcc header.
  const node = new MailComposer(message).compile();
  return { raw: (await node.build()).toString(), envelope: node.getEnvelope() };
}
function mockClient() {
  return {
    sendMail: vi.fn<SmtpClient["sendMail"]>(async () => ({
      messageId: "fixture-message",
      accepted: ["jamie@example.test"],
      rejected: [],
    })),
    verify: vi.fn(async () => true),
    close: vi.fn(),
  };
}
describe("SMTP inline MIME and connection boundary", () => {
  it("produces real related/CID image parts with no ordinary image attachments", async () => {
    const { raw } = await mime(smtpMessage(account, compose(), []));
    expect(inspectMimeImages(raw)).toMatchObject({
      imageElements: 2,
      sourceKinds: { cid: 2 },
      imageParts: 2,
      inlineImageParts: 2,
      ordinaryAttachmentParts: 0,
      unmatchedCidReferences: 0,
      hasRelatedContainer: true,
    });
    expect(raw).not.toContain("ImageSignature");
    expect(raw).not.toContain("data:image");
    expect(raw).toContain("<strong>Before</strong>");
    expect(raw.indexOf("Before")).toBeLessThan(raw.indexOf("Between"));
  });
  it("keeps ordinary documents separate and deduplicates repeated inline images", async () => {
    const c = {
      ...compose(),
      body: '<p><img src="' + png + '">repeat<img src="' + png + '"></p>',
    };
    const { raw } = await mime(
      smtpMessage(account, c, [
        {
          name: "report.pdf",
          bytes: new TextEncoder().encode("offline PDF fixture"),
        },
      ]),
    );
    expect(inspectMimeImages(raw)).toMatchObject({
      imageElements: 2,
      imageParts: 1,
      inlineImageParts: 1,
      ordinaryAttachmentParts: 1,
      unmatchedCidReferences: 0,
    });
  });
  it("uses the authorized alias, hides Bcc and preserves RFC reply threading", async () => {
    const c = {
      ...compose(),
      from: "hello@example.test",
      cc: "copy@example.test",
      bcc: "hidden@example.test",
      replyId: "200",
      replyFolderId: "10",
    };
    const { raw, envelope } = await mime(
      smtpMessage(
        account,
        c,
        [],
        "Message-ID: <original@example.test>\r\nReferences: <prior@example.test>\r\n <other@example.test>\r\n",
      ),
    );
    expect(raw).not.toMatch(/^Bcc:/im);
    expect(envelope.to).toContain("hidden@example.test");
    expect(raw).toContain("hello@example.test");
    expect(raw).toContain("In-Reply-To: <original@example.test>");
    expect(raw).toContain("<prior@example.test>");
    expect(raw).toContain("<other@example.test>");
  });
  it("rejects another sender, unavailable reply ID, oversized media and unsupported scheduling", () => {
    expect(() =>
      smtpMessage(account, { ...compose(), from: "foreign@example.test" }, []),
    ).toThrow("authorized From");
    expect(() =>
      smtpMessage(account, { ...compose(), replyId: "200" }, []),
    ).toThrow("Message-ID");
    expect(() =>
      smtpMessage(account, { ...compose(), schedule: "1" }, []),
    ).toThrow("sent now");
    expect(() =>
      smtpMessage(account, compose(), [
        { name: "large.bin", bytes: new Uint8Array(21 * 1024 * 1024) },
      ]),
    ).toThrow("20 MB");
  });
  it("uses a fixed regional Zoho TLS target with certificate checks and no debug logging", () => {
    expect(smtpOptions(login)).toMatchObject({
      host: "smtp.zoho.com",
      port: 465,
      secure: true,
      logger: false,
      debug: false,
      pool: false,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    });
    expect(
      smtpOptions({ ...login, region: "EU", server: "pro" }),
    ).toMatchObject({ host: "smtppro.zoho.eu", port: 465 });
  });
  it("verifies explicitly without sending and closes after exactly one attempt", async () => {
    const client = mockClient(),
      factory = vi.fn(() => client),
      sender = new SmtpMailer(factory);
    await sender.verify(login);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(client.verify).toHaveBeenCalledTimes(1);
    expect(client.sendMail).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledTimes(1);
  });
  it("does not retry rejected authentication or expose provider response text", async () => {
    const client = mockClient();
    client.verify.mockRejectedValueOnce({
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH LOGIN",
      response: "fixture-smtp-password echoed",
    });
    const sender = new SmtpMailer(() => client);
    await expect(sender.verify(login)).rejects.toMatchObject({
      safeToResubmit: true,
      pause: true,
    });
    expect(client.verify).toHaveBeenCalledTimes(1);
    const failure = SmtpFailure.from({
      code: "EAUTH",
      responseCode: 535,
      response: "private",
    });
    expect(failure.message).toContain("535");
    expect(failure.message).not.toMatch(/private|fixture-smtp-password/);
  });
  it("keeps socket errors uncertain even when labelled CONN and never replays a send", async () => {
    const client = mockClient();
    client.sendMail.mockRejectedValueOnce({
      code: "ESOCKET",
      command: "CONN",
      message: "private trace",
    });
    await expect(
      new SmtpMailer(() => client).send(
        login,
        smtpMessage(account, compose(), []),
      ),
    ).rejects.toMatchObject({ safeToResubmit: false, pause: true });
    expect(client.sendMail).toHaveBeenCalledTimes(1);
  });
  it("returns accepted recipients even when closing a successful transport fails", async () => {
    const client = mockClient();
    client.close.mockImplementation(() => {
      throw new Error("fixture cleanup error");
    });
    expect(
      await new SmtpMailer(() => client).send(
        login,
        smtpMessage(account, compose(), []),
      ),
    ).toMatchObject({
      messageId: "fixture-message",
      accepted: ["jamie@example.test"],
    });
    expect(client.sendMail.mock.calls[0][0]).toMatchObject({
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  });
});
