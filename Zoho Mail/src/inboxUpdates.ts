import { type InboxUpdate, type Message } from "./shared";
import { remoteMessageId } from "./conversations";
export function scopeMessage(message: Message, source: string): Message {
  const id = remoteMessageId(message);
  return { ...message, id: source + ":" + id, remoteId: id, sourceKey: source };
}
export function mergeInboxUpdate(
  current: Message[],
  update: InboxUpdate,
  unified: boolean,
) {
  const source = update.account.profileId + ":" + update.account.id;
  if (!unified) return update.messages.map((m) => scopeMessage(m, source));
  return [
    ...current.filter((m) => m.sourceKey !== source),
    ...update.messages.map((m) => scopeMessage(m, source)),
  ].sort((a, b) => b.time - a.time);
}
