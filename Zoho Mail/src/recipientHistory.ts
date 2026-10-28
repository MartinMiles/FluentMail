import { z } from "zod";
import { addresses } from "./shared";

/** Most recently used first; only addresses, never message bodies. Mailbox-scoped by the caller. */
export function rememberRecipients(
  previous: string[],
  fields: string[],
): string[] {
  return [
    ...new Set(
      [...fields.flatMap(addresses), ...previous]
        .map((email) => email.toLowerCase())
        .filter((email) => z.email().safeParse(email).success),
    ),
  ].slice(0, 1000);
}

export function recipientMatches(value: string, history: string[]): string[] {
  const parts = value.split(/[;,]/);
  const prefix = parts.pop()!.trim().toLowerCase();
  const chosen = new Set(parts.map((s) => s.trim().toLowerCase()));
  if (prefix.length < 2) return [];
  return history
    .filter(
      (email) =>
        email.toLowerCase().startsWith(prefix) &&
        !chosen.has(email.toLowerCase()) &&
        email.toLowerCase() !== prefix,
    )
    .slice(0, 8);
}
