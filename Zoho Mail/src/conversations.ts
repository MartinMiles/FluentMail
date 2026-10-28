import type { Message } from "./shared";

export const remoteMessageId = (m: Message) => m.remoteId || m.id;
export function conversationKey(m: Message) {
  const thread = m.threadId && m.threadId !== "0" ? m.threadId : "";
  return (
    (m.sourceKey ? m.sourceKey + ":" : "") +
    (thread ? "thread:" + thread : remoteMessageId(m))
  );
}
/** Provider IDs, scoped by authorization/mailbox. Subjects never establish identity. */
export function groupConversations(messages: Message[]) {
  const groups = new Map<string, Message[]>();
  for (const m of messages) {
    const key = conversationKey(m);
    const group = groups.get(key) || [];
    if (!group.some((p) => remoteMessageId(p) === remoteMessageId(m)))
      group.push(m);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([id, members]) => {
      const newest = [...members].sort((a, b) => b.time - a.time)[0];
      return {
        ...newest,
        id,
        remoteId: remoteMessageId(newest),
        threadCount: Math.max(
          members.length,
          ...members.map((m) => m.threadCount || 1),
        ),
        unread: members.some((m) => m.unread),
      };
    })
    .sort((a, b) => b.time - a.time);
}
