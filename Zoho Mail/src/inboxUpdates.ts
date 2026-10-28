import { type InboxUpdate, type Message } from "./shared";
export function mergeInboxUpdate(
  current: Message[],
  update: InboxUpdate,
  unified: boolean,
) {
  if (!unified) return update.messages;
  const source = update.account.profileId + ":" + update.account.id;
  return [
    ...current.filter((m) => m.sourceKey !== source),
    ...update.messages.map((m) => ({
      ...m,
      id: source + ":" + m.id,
      remoteId: m.id,
      sourceKey: source,
    })),
  ].sort((a, b) => b.time - a.time);
}
