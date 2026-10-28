import sanitize from "sanitize-html";
import { imageDataUrl, MAX_MEDIA } from "./inlineImages";
import { REGIONS, type Region } from "../src/shared";
import { MAIL_TAGS, MAIL_STYLES, validEditorImage } from "../src/htmlPolicy";

type InlinePart = {
  cid?: unknown;
  attachmentName?: unknown;
  attachmentSize?: unknown;
};
const imageOptions = {
  allowedTags: ["img"],
  allowedAttributes: { img: ["src"] },
  allowedSchemes: ["cid", "data", "https"],
  allowProtocolRelative: false,
};
/** Read attribute values with an HTML parser; never fetch message-supplied URLs. */
export function imageSources(html: string) {
  const sources = new Set<string>();
  sanitize(html, {
    ...imageOptions,
    transformTags: {
      img: (_tag, a) => {
        if (a.src) sources.add(a.src);
        return { tagName: "img", attribs: {} };
      },
    },
  });
  return [...sources];
}
export function imageContentId(src: string, region: Region) {
  let value = "";
  if (/^cid:/i.test(src)) {
    try {
      value = decodeURIComponent(src.slice(4));
    } catch {
      return "";
    }
  } else {
    try {
      const url = new URL(src, REGIONS[region].mail);
      if (url.origin !== REGIONS[region].mail || url.username || url.password)
        return "";
      // API HTML and webmail use different display paths. The URL is NEVER
      // fetched: only its CID is matched to this message's server metadata.
      value = url.searchParams.get("cid") || "";
      if (
        !value &&
        /^\/api\/accounts\/\d+\/folders\/\d+\/messages\/\d+\/inline$/.test(
          url.pathname,
        )
      )
        value = url.searchParams.get("contentId") || "";
    } catch {
      return "";
    }
  }
  return value.replace(/^<|>$/g, "");
}
function rasterUrl(bytes: Uint8Array) {
  for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
    try {
      return imageDataUrl(bytes, mime);
    } catch {
      /* Reject unsupported formats. */
    }
  }
  return "";
}
/** Only server-confirmed MIME parts are downloaded, once each, with bounded memory. */
export async function resolveReceivedImages(
  html: string,
  parts: InlinePart[],
  region: Region,
  download: (contentId: string, name: string) => Promise<Uint8Array>,
) {
  const replacements = new Map<string, string>();
  const downloaded = new Map<string, string>();
  let total = 0,
    skipped = 0;
  for (const src of imageSources(html)) {
    const cid = imageContentId(src, region);
    if (!cid) continue; // Remote images remain blocked by the renderer.
    const part = parts.find(
      (p) => String(p.cid || "").replace(/^<|>$/g, "") === cid,
    );
    if (
      !part ||
      cid.length > 1000 ||
      (!downloaded.has(cid) &&
        (downloaded.size >= 20 ||
          total + Math.max(0, Number(part.attachmentSize) || 0) > MAX_MEDIA))
    ) {
      skipped++;
      continue;
    }
    if (!downloaded.has(cid)) {
      const bytes = await download(cid, String(part.attachmentName || "image"));
      total += bytes.length;
      downloaded.set(cid, total <= MAX_MEDIA ? rasterUrl(bytes) : "");
    }
    const local = downloaded.get(cid)!;
    if (local) replacements.set(src, local);
    else skipped++;
  }
  // Keep the shared outgoing/reader tag policy while replacing only parsed img attributes.
  const transformed = sanitize(html, {
    allowedTags: MAIL_TAGS,
    allowedAttributes: {
      "*": ["style"],
      a: ["href"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      ol: ["start"],
      img: ["src", "alt", "title", "width", "height"],
    },
    allowedStyles: { "*": MAIL_STYLES },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["data"] },
    allowProtocolRelative: false,
    transformTags: {
      img: (_tag, a) => ({
        tagName: "img",
        attribs: {
          ...a,
          src:
            replacements.get(a.src) ||
            (validEditorImage(a.src || "") ? a.src : ""),
        },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
  return {
    html: transformed,
    ...(skipped
      ? {
          imageWarning:
            "Some embedded images could not be displayed (missing, unsupported, or over the 20 MB / 20-image limit).",
        }
      : {}),
  };
}
