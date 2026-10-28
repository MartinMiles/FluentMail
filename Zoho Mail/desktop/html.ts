import sanitize from "sanitize-html";
import { MAIL_STYLES, MAIL_TAGS, validMailLink } from "../src/htmlPolicy";
export function sanitizeOutgoingHtml(
  html: string,
  inlineSources: ReadonlyMap<string, string> = new Map(),
) {
  const clean = sanitize(html, {
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
    allowedSchemesByTag: { img: ["https", "http", "cid"] },
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
  // Zoho's send API recognizes inline-upload references only with literal query
  // separators. Its parser leaves &amp;-encoded references as private preview
  // URLs instead of creating MIME Content-IDs. Restore ONLY the documented keys
  // in an exact, already-vetted image source. Links/other HTML stay sanitized.
  const trusted = new Set(
    [...inlineSources.values()].map((src) =>
      src.replaceAll("&", "&amp;").replaceAll('"', "&quot;"),
    ),
  );
  return clean.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/\bsrc="([^"]*)"/i, (attribute, src: string) =>
      trusted.has(src)
        ? 'src="' +
          src.replace(
            /&amp;(?=(?:fileName|accountId|storeName|frm|fileId)=)/g,
            "&",
          ) +
          '"'
        : attribute,
    ),
  );
}
