import sanitize from "sanitize-html";
import { MAIL_STYLES, MAIL_TAGS, validMailLink } from "../src/htmlPolicy";
export function sanitizeOutgoingHtml(html: string) {
  return sanitize(html, {
    allowedTags: MAIL_TAGS,
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      ol: ["start"],
    },
    allowedStyles: { "*": MAIL_STYLES },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const attribs: Record<string, string> = validMailLink(
          attributes.href || "",
        )
          ? { href: attributes.href, rel: "noopener noreferrer" }
          : {};
        return { tagName: "a", attribs };
      },
    },
  });
}
