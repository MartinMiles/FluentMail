import { describe, it, expect } from "vitest";
import { inspectMimeImages } from "../desktop/mimeImages";
function related(html: string, cid = "image-fixture", encoding = "7bit") {
  return `From: confidential@example.test\r\nContent-Type: multipart/related; boundary="test-boundary"\r\n\r\n--test-boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${html}\r\n--test-boundary\r\nContent-Type: image/png\r\nContent-ID: <${cid}>\r\nContent-Disposition: inline; filename="confidential.png"\r\n\r\nPRIVATE-IMAGE-BYTES\r\n--test-boundary--\r\n`;
}
describe("private MIME image diagnostic", () => {
  it("recognizes matching inline parts without exporting message data", () => {
    const report = inspectMimeImages(
      related('<p>PRIVATE BODY</p><img src="cid:image-fixture">'),
    );
    expect(report).toEqual({
      imageElements: 1,
      sourceKinds: { cid: 1 },
      imageParts: 1,
      ordinaryAttachmentParts: 0,
      inlineImageParts: 1,
      unmatchedCidReferences: 0,
      hasRelatedContainer: true,
    });
    expect(JSON.stringify(report)).not.toMatch(
      /PRIVATE|confidential|image-fixture/,
    );
  });
  it("detects unmatched CIDs and private compose URLs instead of guessing successful rendering", () => {
    expect(
      inspectMimeImages(
        related(
          '<img src="cid:missing"><img src="/zm/ImageSignature?fileName=private.png"><img src="data:image/png;base64,AAAA">',
        ),
      ).unmatchedCidReferences,
    ).toBe(1);
    expect(
      inspectMimeImages(
        related(
          '<img src="https://mail.zoho.com/zm/ImageSignature?accountId=100">',
        ),
      ).sourceKinds,
    ).toEqual({ "compose-preview": 1 });
  });
  it("decodes base64 and quoted-printable HTML parts", () => {
    expect(
      inspectMimeImages(
        related(
          Buffer.from('<img src="cid:image-fixture">').toString("base64"),
          "image-fixture",
          "base64",
        ),
      ).sourceKinds,
    ).toEqual({ cid: 1 });
    expect(
      inspectMimeImages(
        related(
          '<img src=3D"cid:image-\r\nfixture">',
          "image-fixture",
          "quoted-printable",
        ),
      ).imageElements,
    ).toBe(1);
  });
});
