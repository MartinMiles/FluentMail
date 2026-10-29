import type { LocalFile } from "./shared";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 20;
export function inlineImageStats(html: string) {
  const unique = new Set(
    [
      ...html.matchAll(
        /\bsrc=["'](data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2}))["']/gi,
      ),
    ].map((m) => m[1]),
  );
  let bytes = 0;
  for (const src of unique) {
    const b64 = src.slice(src.indexOf(",") + 1);
    bytes +=
      (b64.length * 3) / 4 -
      (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  }
  return { bytes, count: unique.size };
}
export function validateAttachmentBudget(
  files: Pick<LocalFile, "size">[],
  imageBytes = 0,
  imageCount = 0,
) {
  if (files.length > MAX_ATTACHMENT_COUNT)
    throw Error("Use at most 20 file attachments.");
  if (imageCount > 20) throw Error("Use at most 20 embedded images.");
  if (
    files.reduce((sum, file) => sum + file.size, 0) + imageBytes >
    MAX_ATTACHMENT_BYTES
  )
    throw Error("Files and embedded images must total no more than 20 MB.");
}
