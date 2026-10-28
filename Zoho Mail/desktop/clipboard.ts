import type { Clipboard } from "electron";
export type ClipboardMedia = {
  paths: string[];
  images: { name: string; mime: string; bytes: Uint8Array }[];
};
export function decodeDropFiles(data: Uint8Array): string[] {
  const b = Buffer.from(data);
  if (b.length < 24)
    throw new Error(
      "The clipboard file list is incomplete. Copy the files again.",
    );
  const offset = b.readUInt32LE(0);
  if (
    offset < 20 ||
    offset >= b.length ||
    b.readUInt32LE(16) !== 1 ||
    offset % 2
  )
    throw new Error("Unsupported clipboard file-list format.");
  const text = b.subarray(offset).toString("utf16le");
  if (!text.endsWith("\0\0"))
    throw new Error("The clipboard file list is incomplete.");
  return text.split("\0").filter(Boolean);
}
export function localClipboardPaths(paths: string[]): string[] {
  if (paths.length > 20) throw new Error("Paste up to 20 files at a time.");
  if (paths.some((p) => !/^[A-Za-z]:[\\/]/.test(p) || p.includes("\0")))
    throw new Error(
      "Clipboard attachments must be local files. Copy network files to this PC first.",
    );
  return [...new Set(paths)];
}
export async function readClipboardMedia(
  clipboard: Pick<Clipboard, "read">,
): Promise<ClipboardMedia> {
  const items = await clipboard.read();
  for (const item of items)
    for (const type of item.types) {
      if (/format="(?:CF_HDROP|FileNameW)"/i.test(type)) {
        const blob = await item.getType(type);
        if (!("arrayBuffer" in blob)) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const paths = /CF_HDROP/i.test(type)
          ? decodeDropFiles(bytes)
          : [Buffer.from(bytes).toString("utf16le").replace(/\0+$/, "")];
        return { paths: localClipboardPaths(paths), images: [] };
      }
    }
  const images: ClipboardMedia["images"] = [];
  for (const item of items) {
    const mime = item.types.find((t) =>
      ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(t),
    );
    if (!mime) continue;
    const blob = await item.getType(mime);
    if (!("arrayBuffer" in blob)) continue;
    if (blob.size > 20 * 1024 * 1024)
      throw new Error("Clipboard image exceeds 20 MB.");
    images.push({
      name:
        "Pasted image." +
        {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/gif": "gif",
          "image/webp": "webp",
        }[mime],
      mime,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  return { paths: [], images };
}
