import DOMPurify from "dompurify";
import { MAIL_TAGS, safeStyles, validMailLink } from "./htmlPolicy";
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName === "style") {
    data.attrValue = safeStyles(data.attrValue);
    if (!data.attrValue) data.keepAttr = false;
  }
  if (data.attrName === "href" && !validMailLink(data.attrValue))
    data.keepAttr = false;
});
export function cleanEditorHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MAIL_TAGS,
    ALLOWED_ATTR: ["href", "style", "colspan", "rowspan", "start"],
    ALLOW_DATA_ATTR: false,
  });
}
export function cleanText(value: string) {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.body.textContent || "";
}
export function mailPlainText(html: string) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "div",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "pre",
      "code",
      "table",
      "tr",
      "td",
      "th",
    ],
    ALLOWED_ATTR: [],
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
  doc.querySelectorAll("li").forEach((el) => el.prepend("• "));
  doc.querySelectorAll("td,th").forEach((el) => el.append("\t"));
  doc
    .querySelectorAll("p,div,li,h1,h2,h3,h4,blockquote,tr,pre")
    .forEach((el) => el.append("\n\n"));
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
export function safeMail(html: string, dark = false) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "div",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "hr",
      "a",
    ],
    ALLOWED_ATTR: ["href", "colspan", "rowspan", "style"],
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  const links: { label: string; url: string }[] = [];
  for (const a of doc.querySelectorAll("a")) {
    try {
      const url = new URL(a.getAttribute("href") || "");
      if (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !links.some((l) => l.url === url.href)
      )
        links.push({ label: a.textContent || url.hostname, url: url.href });
    } catch {
      /* Unsafe and relative links remain text. */
    }
    a.removeAttribute("href");
  }
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><style>body{font:15px/1.8 'Segoe UI',sans-serif;color:${dark ? "#dbe2ed" : "#354155"};margin:0;padding:8px 4px;overflow-wrap:anywhere}p{margin:0 0 18px}h1,h2,h3{line-height:1.4;color:${dark ? "#f2f5fa" : "#1b283c"}}h3{font-size:16px;margin:24px 0 12px}a{color:#477bce;text-decoration:underline}blockquote{border-left:3px solid #b4c5de;margin:16px 0;padding:4px 16px}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #b5c2d2;padding:8px}pre{white-space:pre-wrap}ul{padding-left:22px}</style></head><body>${doc.body.innerHTML}</body></html>`;
  return { document, links: links.slice(0, 30) };
}
