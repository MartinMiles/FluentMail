import sanitize from "sanitize-html";

/** Inspect MIME structure in memory. Return counts only, never mail text, addresses,
 * filenames, URLs, content IDs or attachment bytes. This is a bounded diagnostic,
 * not the HTML reader or a general-purpose mail parser.
 */
export function inspectMimeImages(mime: string) {
  if (mime.length > 40 * 1024 * 1024)
    throw new Error("Diagnostic MIME exceeds 40 MB.");
  const refs: string[] = [],
    ids = new Set<string>();
  const sourceKinds: Record<string, number> = {};
  let imageParts = 0,
    ordinaryAttachmentParts = 0,
    inlineImageParts = 0,
    parts = 0,
    hasRelatedContainer = false;
  const visit = (raw: string, depth: number) => {
    if (++parts > 500 || depth > 12)
      throw new Error("MIME structure exceeds diagnostic limits.");
    const normalized = raw.replace(/\r\n/g, "\n");
    const split = normalized.indexOf("\n\n");
    if (split < 0) return;
    const headers = normalized.slice(0, split).replace(/\n[ \t]+/g, " ");
    const body = normalized.slice(split + 2);
    const header = (key: string) =>
      headers.match(new RegExp("^" + key + ":\\s*(.*)$", "im"))?.[1]?.trim() ||
      "";
    const type = header("content-type");
    if (/^multipart\//i.test(type)) {
      if (/^multipart\/related/i.test(type)) hasRelatedContainer = true;
      const boundary = type.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
      const value = boundary?.[1] || boundary?.[2];
      if (!value || value.length > 200)
        throw new Error("MIME boundary unavailable.");
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const part of body
        .split(new RegExp("(?:^|\\n)--" + escaped + "(?:--)?[ \\t]*(?:\\n|$)"))
        .slice(1, -1))
        visit(part, depth + 1);
      return;
    }
    const cid = header("content-id").replace(/^<|>$/g, "");
    if (/^attachment\b/i.test(header("content-disposition")))
      ordinaryAttachmentParts++;
    if (cid) ids.add(cid);
    if (/^image\//i.test(type)) {
      imageParts++;
      if (cid || /^inline/i.test(header("content-disposition")))
        inlineImageParts++;
    }
    if (!/^text\/html/i.test(type)) return;
    const encoding = header("content-transfer-encoding");
    const html = /^base64/i.test(encoding)
      ? Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8")
      : /^quoted-printable/i.test(encoding)
        ? Buffer.from(
            body
              .replace(/=\n/g, "")
              .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16)),
              ),
            "latin1",
          ).toString("utf8")
        : body;
    sanitize(html, {
      allowedTags: ["img"],
      transformTags: {
        img: (_tag, attrs) => {
          const src = attrs.src || "";
          let kind = "other";
          if (/^cid:/i.test(src)) {
            kind = "cid";
            refs.push(src.slice(4));
          } else if (/^data:/i.test(src)) kind = "data";
          else if (/^(?:https?:\/\/[^/]+)?\/zm\/ImageSignature\?/i.test(src))
            kind = "compose-preview";
          else if (/^https?:/i.test(src)) kind = "remote";
          else if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) kind = "relative";
          sourceKinds[kind] = (sourceKinds[kind] || 0) + 1;
          return { tagName: "img", attribs: {} };
        },
      },
    });
  };
  visit(mime, 0);
  return {
    imageElements: Object.values(sourceKinds).reduce((n, v) => n + v, 0),
    sourceKinds,
    imageParts,
    ordinaryAttachmentParts,
    inlineImageParts,
    unmatchedCidReferences: refs.filter((id) => !ids.has(id)).length,
    hasRelatedContainer,
  };
}
