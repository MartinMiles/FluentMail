import { describe, it, expect, vi } from "vitest";
import {
  imageContentId,
  resolveReceivedImages,
} from "../desktop/receivedImages";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=",
  "base64",
);
describe("authenticated incoming inline images", () => {
  it("resolves Gmail CIDs and Zoho display references to one downloaded raster part", async () => {
    const download = vi.fn(async () => png);
    const result = await resolveReceivedImages(
      '<p>Hi<img src="cid:image.1@test"><img src="/zm/ImageDisplay?mode=inline&amp;cid=image.1%40test" width="100"><img src="https://tracker.test/pixel"></p>',
      [
        {
          cid: "image.1@test",
          attachmentName: "image.png",
          attachmentSize: png.length,
        },
      ],
      "US",
      download,
    );
    expect(download).toHaveBeenCalledExactlyOnceWith(
      "image.1@test",
      "image.png",
    );
    expect((result.html.match(/data:image\/png;base64/g) || []).length).toBe(2);
    expect(result.html).not.toMatch(/tracker|cid:|ImageDisplay/);
    expect(result.imageWarning).toBeUndefined();
  });
  it("resolves regional CID references independently of webmail display paths", async () => {
    const download = vi.fn(async () => png);
    const result = await resolveReceivedImages(
      '<img src="/api-display-image?na=1&amp;cid=image%40test">',
      [{ cid: "image@test" }],
      "US",
      download,
    );
    expect(download).toHaveBeenCalledExactlyOnceWith("image@test", "image");
    expect(result.html).toContain("data:image/png;base64,");
  });
  it("matches only metadata-confirmed parts and never downloads arbitrary message URLs", async () => {
    const download = vi.fn(async () => png);
    const result = await resolveReceivedImages(
      '<img src="cid:missing"><img src="https://evil.test/zm/ImageDisplay?cid=known"><img src="https://mail.zoho.eu/zm/ImageDisplay?cid=known">',
      [{ cid: "known" }],
      "US",
      download,
    );
    expect(download).not.toHaveBeenCalled();
    expect(result.html).not.toContain("<img");
    expect(result.imageWarning).toMatch(/Some embedded/);
  });
  it("omits SVG/HTML and oversized parts with feedback, without breaking message text", async () => {
    const download = vi.fn(async () => Buffer.from('<svg onload="bad()"/>'));
    const result = await resolveReceivedImages(
      '<p>Readable<img src="cid:svg"><img src="cid:large"></p>',
      [{ cid: "svg" }, { cid: "large", attachmentSize: 21 * 1024 * 1024 }],
      "US",
      download,
    );
    expect(download).toHaveBeenCalledTimes(1);
    expect(result.html).toContain("Readable");
    expect(result.html).not.toContain("<img");
    expect(result.imageWarning).toBeTruthy();
  });
  it("stops on the first failed download without retry or further downloads", async () => {
    const download = vi.fn(async () => {
      throw Error("Connection stopped");
    });
    await expect(
      resolveReceivedImages(
        '<img src="cid:a"><img src="cid:b">',
        [{ cid: "a" }, { cid: "b" }],
        "US",
        download,
      ),
    ).rejects.toThrow("Connection stopped");
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("bounds an opened message to twenty inline parts", async () => {
    const download = vi.fn(async () => png);
    const parts = Array.from({ length: 21 }, (_, i) => ({ cid: String(i) }));
    const result = await resolveReceivedImages(
      parts.map((p) => `<img src="cid:${p.cid}">`).join(""),
      parts,
      "US",
      download,
    );
    expect(download).toHaveBeenCalledTimes(20);
    expect(result.imageWarning).toBeTruthy();
  });
  it("validates regional origins and CID encoding", () => {
    expect(imageContentId("cid:%3Cimage%40test%3E", "US")).toBe("image@test");
    expect(imageContentId("/zm/ImageDisplay?cid=image%40test", "EU")).toBe(
      "image@test",
    );
    expect(
      imageContentId(
        "https://user:pass@mail.zoho.com/zm/ImageDisplay?cid=a",
        "US",
      ),
    ).toBe("");
    expect(imageContentId("cid:%invalid", "US")).toBe("");
  });
});
