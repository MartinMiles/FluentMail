import { useId, useState } from "react";
import { X } from "lucide-react";
import { z } from "zod";
import { recipientMatches } from "./recipientHistory";
/** Keep the raw value in the composer so uncommitted/invalid text cannot disappear on Send. */
export function Recipients({
  label,
  value,
  onChange,
  disabled,
  history = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  history?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();
  const [limitError, setLimitError] = useState("");
  const split = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  const prefix = split >= 0 ? value.slice(0, split + 1) + " " : "";
  const rawTail = value.slice(split + 1).trimStart();
  const complete = value
    .slice(0, split + 1)
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const validTail =
    !!rawTail.trim() && z.email().safeParse(rawTail.trim()).success;
  const parts =
    !editing && validTail ? [...complete, rawTail.trim()] : complete;
  const tail = !editing && validTail ? "" : rawTail;
  const update = (next: string) => {
    if (next.length > 1000) {
      setLimitError("Recipient fields support up to 1,000 characters.");
      return;
    }
    setLimitError("");
    onChange(next);
  };
  const commit = () => {
    if (rawTail.trim()) update(prefix + rawTail.trim() + ", ");
  };
  const matches =
    editing && !disabled && !dismissed ? recipientMatches(value, history) : [];
  const highlighted = Math.min(active, Math.max(0, matches.length - 1));
  const choose = (email: string) => {
    update((split >= 0 ? value.slice(0, split + 1) + " " : "") + email + ", ");
    setActive(0);
  };
  return (
    <div className="recipients">
      <div className="recipient-chips">
        {parts.map((part, i) => (
          <span
            className={
              "recipient-chip " +
              (!z.email().safeParse(part).success ? "invalid" : "")
            }
            key={i}
          >
            {part}
            <button
              type="button"
              disabled={disabled}
              aria-label={"Remove recipient " + part}
              onClick={() =>
                update(
                  parts
                    .filter((_, index) => index !== i)
                    .map((x) => x + ", ")
                    .join("") + tail,
                )
              }
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={!!matches.length}
        aria-controls={matches.length ? listId : undefined}
        aria-activedescendant={
          matches.length ? listId + "-" + highlighted : undefined
        }
        autoComplete="off"
        aria-label={label}
        aria-invalid={!!limitError || (!editing && !!tail && !validTail)}
        aria-describedby={limitError ? listId + "-error" : undefined}
        maxLength={Math.max(0, 1000 - prefix.length)}
        value={tail}
        disabled={disabled}
        placeholder={!parts.length ? "name@example.com" : ""}
        onFocus={() => {
          setEditing(true);
          setDismissed(false);
          if (validTail) commit();
        }}
        onBlur={() => {
          if (validTail) commit();
          setEditing(false);
        }}
        onChange={(e) => {
          setActive(0);
          setDismissed(false);
          update(prefix + e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (
            matches.length &&
            (e.key === "ArrowDown" || e.key === "ArrowUp")
          ) {
            e.preventDefault();
            e.stopPropagation();
            setActive(
              (highlighted + (e.key === "ArrowDown" ? 1 : matches.length - 1)) %
                matches.length,
            );
            return;
          }
          if (matches.length && e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            choose(matches[highlighted]);
            return;
          }
          if (matches.length && e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commit();
          }
          if (e.key === "Backspace" && !tail && parts.length) {
            e.preventDefault();
            update(
              parts
                .slice(0, -1)
                .map((x) => x + ", ")
                .join("") + parts.at(-1),
            );
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
      />
      {limitError && (
        <small id={listId + "-error"} role="alert">
          {limitError}
        </small>
      )}
      {!!matches.length && (
        <ul
          className="recipient-suggestions"
          id={listId}
          role="listbox"
          aria-label={label + " suggestions"}
        >
          {matches.map((email, i) => (
            <li
              key={email}
              id={listId + "-" + i}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(email);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {email}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
