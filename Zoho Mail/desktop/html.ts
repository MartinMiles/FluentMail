import sanitize from "sanitize-html";
import { MAIL_STYLES, MAIL_TAGS, validMailLink } from "../src/htmlPolicy";
export function sanitizeOutgoingHtml(
  html: string,
  inlineSources: ReadonlyMap<string, string> = new Map(),
) {
  return sanitize(html, {
    allowedTags: MAIL_TAGS,
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      ol: ["start"],
      img: ["src", "alt", "title", "width", "height"],
    },
    allowedStyles: { "*": MAIL_STYLES },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      img: (_tag, a) => {
        const src = inlineSources.get(a.src || "");
        const attribs: Record<string, string> = src
          ? { src, alt: a.alt || "Pasted image" }
          : {};
        for (const dimension of ["width", "height"])
          if (/^\d{1,4}$/.test(a[dimension] || ""))
            attribs[dimension] = a[dimension];
        return { tagName: "img", attribs };
      },
      a: (_tag, attributes) => {
        const attribs: Record<string, string> = validMailLink(
          attributes.href || "",
        )
          ? { href: attributes.href, rel: "noopener noreferrer" }
          : {};
        return { tagName: "a", attribs };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
