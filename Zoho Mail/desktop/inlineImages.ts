import sanitize from "sanitize-html";
export const MAX_MEDIA = 20 * 1024 * 1024;
export function imageDataUrl(bytes: Uint8Array, mime: string): string {
  const b = Buffer.from(bytes);
  let valid = false;
  if (mime === "image/png")
    valid =
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    valid = b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === "image/gif")
    valid = /^GIF8[79]a/.test(b.subarray(0, 6).toString("ascii"));
  if (mime === "image/webp")
    valid =
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP";
  if (!valid)
    throw new Error(
      "Paste a PNG, JPEG, GIF or WebP image. SVG and invalid images are not embedded.",
    );
  if (b.length > MAX_MEDIA) throw new Error("Clipboard image exceeds 20 MB.");
  return `data:${mime};base64,${b.toString("base64")}`;
}
export function inlineImages(html: string) {
  const images = new Map<
    string,
    { mime: string; bytes: Uint8Array; name: string }
  >();
  sanitize(html, {
    allowedTags: ["img"],
    allowedAttributes: { img: ["src"] },
    allowedSchemes: ["data"],
    allowedSchemesByTag: { img: ["data"] },
    transformTags: {
      img: (_tag, a) => {
        const match =
          /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
            a.src || "",
          );
        if (!match)
          throw new Error(
            "An embedded image is unavailable. Paste it again before sending.",
          );
        if (!images.has(a.src)) {
          const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
          imageDataUrl(bytes, match[1]);
          images.set(a.src, {
            mime: match[1],
            bytes,
            name: `pasted-image-${images.size + 1}.${match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1]}`,
          });
        }
        return { tagName: "img", attribs: {} };
      },
    },
  });
  if (images.size > 20) throw new Error("Use at most 20 embedded images.");
  return images;
}
