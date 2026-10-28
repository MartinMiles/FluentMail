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
  const matches =
    editing && !disabled && !dismissed ? recipientMatches(value, history) : [];
  const highlighted = Math.min(active, Math.max(0, matches.length - 1));
  const choose = (email: string) => {
    const split = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
    onChange(
      (split >= 0 ? value.slice(0, split + 1) + " " : "") + email + ", ",
    );
    setActive(0);
  };
  const parts = value
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return (
    <div className="recipients">
      <div className="recipient-chips">
        {!editing &&
          parts.map((part, i) => (
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
                  onChange(parts.filter((_, index) => index !== i).join(", "))
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
        value={editing ? value : parts.length ? "" : value}
        disabled={disabled}
        placeholder={!parts.length ? "name@example.com" : ""}
        onFocus={() => {
          setEditing(true);
          setDismissed(false);
        }}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          setActive(0);
          setDismissed(false);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
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
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
      />
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
