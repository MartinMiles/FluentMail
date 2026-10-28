import { describe, it, expect, vi } from "vitest";
import {
  decodeDropFiles,
  localClipboardPaths,
  readClipboardMedia,
} from "../desktop/clipboard";
import { imageDataUrl, inlineImages } from "../desktop/inlineImages";
import { sanitizeOutgoingHtml } from "../desktop/html";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=",
  "base64",
);
describe("clipboard media fixtures (never the live system clipboard)", () => {
  it("decodes a Unicode Windows Explorer CF_HDROP list", () => {
    const header = Buffer.alloc(20);
    header.writeUInt32LE(20, 0);
    header.writeUInt32LE(1, 16);
    expect(
      decodeDropFiles(
        Buffer.concat([
          header,
          Buffer.from(
            "C:\\Fixtures\\report.pdf\0C:\\Fixtures\\photo.png\0\0",
            "utf16le",
          ),
        ]),
      ),
    ).toEqual(["C:\\Fixtures\\report.pdf", "C:\\Fixtures\\photo.png"]);
  });
  it("rejects malformed file lists, network paths and ordinary copied text", () => {
    expect(() => decodeDropFiles(new Uint8Array(5))).toThrow();
    expect(() => localClipboardPaths(["\\\\server\\private.txt"])).toThrow(
      "local files",
    );
    expect(() => localClipboardPaths(["C:\\file.txt\0extra"])).toThrow();
    expect(() => localClipboardPaths(["a copied password"])).toThrow();
  });
  it("does not read text contents when the clipboard has no media", async () => {
    const getType = vi.fn();
    const source = {
      read: async () => [{ types: ["text/plain"], getType }],
    } as any;
    expect(await readClipboardMedia(source)).toEqual({ paths: [], images: [] });
    expect(getType).not.toHaveBeenCalled();
  });
  it("prefers Explorer file-copy data over an image thumbnail", async () => {
    const header = Buffer.alloc(20);
    header.writeUInt32LE(20, 0);
    header.writeUInt32LE(1, 16);
    const getType = vi.fn(
      async () =>
        new Blob([
          Buffer.concat([
            header,
            Buffer.from("C:\\Fixtures\\photo.png\0\0", "utf16le"),
          ]),
        ]),
    );
    const result = await readClipboardMedia({
      read: async () => [
        {
          types: [
            'electron application/osclipboard;format="CF_HDROP"',
            "image/png",
          ],
          getType,
        },
      ],
    } as any);
    expect(result.paths).toEqual(["C:\\Fixtures\\photo.png"]);
    expect(result.images).toHaveLength(0);
    expect(getType).toHaveBeenCalledTimes(1);
  });
  it("validates raster signatures and keeps local inline images distinct from remote images", () => {
    const src = imageDataUrl(png, "image/png");
    expect(inlineImages(`<p><img src="${src}"></p>`).size).toBe(1);
    expect(() => imageDataUrl(Buffer.from("<svg/>"), "image/png")).toThrow(
      "PNG",
    );
    expect(() =>
      inlineImages('<img src="https://tracker.test/pixel">'),
    ).toThrow("unavailable");
  });
  it("replaces only the corresponding local image with the provider-returned upload URL", () => {
    const src = imageDataUrl(png, "image/png");
    const url =
      "/zm/ImageSignature?fileName=image.png&accountId=100&storeName=fixture";
    const body = sanitizeOutgoingHtml(
      `<p>Hello<img src="${src}" onerror="bad()"><img src="https://tracker.test"></p>`,
      new Map([[src, url]]),
    );
    expect(body).toContain("/zm/ImageSignature?");
    expect(body).not.toContain("base64");
    expect(body).not.toContain("tracker.test");
    expect(body).not.toContain("onerror");
  });
});
