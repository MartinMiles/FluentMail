// The same small formatting vocabulary is used for editor paste, display and outbound HTML.
export const MAIL_TAGS = [
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
  "strike",
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
  "img",
];
export function validEditorImage(value: string) {
  return (
    value.length <= 28_000_000 &&
    /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
export const MAIL_STYLES: Record<string, RegExp[]> = {
  color: [/^(#[\da-f]{3,8}|rgba?\([\d., %]+\)|[a-z]+)$/i],
  "background-color": [/^(#[\da-f]{3,8}|rgba?\([\d., %]+\)|[a-z]+)$/i],
  "font-size": [/^(8|9|[1-6]\d|7[0-2])(px|pt)$/i],
  "font-family": [
    /^(Arial|Verdana|Georgia|Tahoma|serif|sans-serif|monospace|'?Times New Roman'?|"Times New Roman"|'?Courier New'?|"Courier New")$/i,
  ],
  "text-align": [/^(left|right|center|justify)$/],
  "font-weight": [/^(normal|bold|[1-9]00)$/],
  "font-style": [/^(normal|italic)$/],
  "text-decoration": [/^(underline|line-through|none)$/],
};
export function safeStyles(value: string) {
  return value
    .split(";")
    .map((part) => {
      const i = part.indexOf(":");
      if (i < 0) return "";
      const key = part.slice(0, i).trim().toLowerCase(),
        val = part.slice(i + 1).trim();
      return MAIL_STYLES[key]?.some((re) => re.test(val))
        ? `${key}: ${val}`
        : "";
    })
    .filter(Boolean)
    .join("; ");
}
export function validMailLink(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      ["https:", "http:", "mailto:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !/[\r\n]/.test(value)
    );
  } catch {
    return false;
  }
}
export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function textToHtml(text: string) {
  return "<p>" + escapeHtml(text).replace(/\r?\n/g, "<br>") + "</p>";
}
