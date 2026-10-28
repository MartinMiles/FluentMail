import { useState } from "react";
import { X } from "lucide-react";
import { z } from "zod";
/** Keep the raw value in the composer so uncommitted/invalid text cannot disappear on Send. */
export function Recipients({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
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
        aria-label={label}
        value={editing ? value : parts.length ? "" : value}
        disabled={disabled}
        placeholder={!parts.length ? "name@example.com" : ""}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
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
    </div>
  );
}
