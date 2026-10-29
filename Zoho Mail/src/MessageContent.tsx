import { useMemo } from "react";
import { safeMail } from "./sanitize";
/** Keep expensive HTML sanitizing independent of selection, focus and ordering. */
export function MessageContent({
  html,
  dark,
  title,
  onOpenLink,
}: {
  html: string;
  dark: boolean;
  title: string;
  onOpenLink: (url: string) => void;
}) {
  const safe = useMemo(() => safeMail(html, dark), [html, dark]);
  return (
    <>
      <div className="message-document">
        <iframe
          title={title}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={safe.document}
        />
      </div>
      {safe.links.length > 0 && (
        <details className="message-links">
          <summary>Links in this message ({safe.links.length})</summary>
          {safe.links.map((link) => (
            <button
              key={link.url}
              className="text-button"
              onClick={() => onOpenLink(link.url)}
            >
              {link.label}
              <small>{link.url}</small>
            </button>
          ))}
        </details>
      )}
    </>
  );
}
