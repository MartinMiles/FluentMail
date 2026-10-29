import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Reply,
  ReplyAll,
  ArrowRight,
  ShieldCheck,
  ArrowDownUp,
  ArrowUpRight,
} from "lucide-react";
import { call } from "./api";
import type { Account, Detail, ListResult, Message } from "./shared";
import { PAGE_SIZE, addresses } from "./shared";
import {
  remoteMessageId,
  newestMessages,
  hasMessageTime,
  readConversationOrder,
  rememberConversationOrder,
  type ConversationOrder,
} from "./conversations";
import { cleanText } from "./sanitize";
import { MessageContent } from "./MessageContent";

type Mode = "reply" | "all" | "forward" | "edit";
type Props = {
  account: Account;
  row: Message;
  dark: boolean;
  busy: boolean;
  drafts: boolean;
  revision?: number;
  onActive: (message: Message, detail: Detail | null) => void;
  onCount: (count: number, exact: boolean) => void;
  onReply: (mode: Mode, message: Message, detail: Detail) => void;
  onFailure: (error: unknown) => void;
  onToast: (text: string) => void;
};
const memberKey = (m: Message) => m.folderId + ":" + remoteMessageId(m);
const date = (message: Message, full = false) => {
  if (!hasMessageTime(message)) return "Time unavailable";
  if (full)
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "long",
    }).format(message.time);
  const today =
    new Date(message.time).toDateString() === new Date().toDateString();
  return today
    ? "Today, " +
        new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }).format(message.time)
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(message.time);
};

export function ConversationReader(props: Props) {
  const { account, row, dark, busy } = props;
  const [members, setMembers] = useState<Message[]>([row]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set([memberKey(row)]),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(memberKey(row));
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextStart, setNextStart] = useState(1);
  const [failure, setFailure] = useState("");
  const [order, setOrder] = useState<ConversationOrder>(readConversationOrder);
  const cards = useRef(new Map<string, HTMLElement>());
  const initialized = useRef(false);
  const membersRef = useRef(members);
  membersRef.current = members;
  const callbacks = useRef(props);
  callbacks.current = props;
  const generation = useRef(0);
  const cache = useRef<Record<string, Detail>>({});
  const inFlight = useRef(new Set<string>());
  const stopped = useRef(false);
  const activeKey = useRef(active);
  const ref = { profileId: account.profileId, accountId: account.id };
  const stop = (error: unknown, version: number) => {
    if (version !== generation.current) return;
    stopped.current = true;
    setFailure(
      error instanceof Error
        ? error.message
        : "Conversation could not be loaded.",
    );
    callbacks.current.onFailure(error);
  };
  const openBody = async (
    message: Message,
    version: number,
    activate = true,
  ) => {
    const id = memberKey(message);
    if (activate) {
      activeKey.current = id;
      setActive(id);
      callbacks.current.onActive(message, cache.current[id] || null);
    }
    if (cache.current[id] || inFlight.current.has(id) || stopped.current)
      return;
    inFlight.current.add(id);
    setPending(new Set(inFlight.current));
    try {
      const detail = await call<Detail>({
        op: "detail",
        ...ref,
        folderId: message.folderId,
        messageId: remoteMessageId(message),
        attachments: message.hasAttachment,
      });
      if (version !== generation.current) return;
      cache.current[id] = detail;
      setDetails({ ...cache.current });
      if (activeKey.current === id) callbacks.current.onActive(message, detail);
    } catch (error) {
      stop(error, version);
    } finally {
      if (version === generation.current) {
        inFlight.current.delete(id);
        setPending(new Set(inFlight.current));
      }
    }
  };
  const loadPage = async (start: number, version: number, initial = false) => {
    if (stopped.current) return;
    setLoading(true);
    try {
      const result = await call<ListResult>({
        op: "list",
        ...ref,
        threadId: row.threadId,
        filter: "all",
        start,
      });
      if (version !== generation.current) return;
      // Retain the selected folder's message even if a provider page omits it.
      const merge = (current: Message[]) => {
        const unique = new Map<string, Message>();
        for (const m of initial
          ? [...result.messages, ...current]
          : [...current, ...result.messages]) {
          if (initial && unique.has(remoteMessageId(m))) continue;
          unique.set(remoteMessageId(m), { ...m, sourceKey: row.sourceKey });
        }
        return newestMessages([...unique.values()]);
      };
      setHasMore(result.hasMore);
      setNextStart(start + PAGE_SIZE);
      if (initial) {
        const previous = membersRef.current.find(
          (m) => memberKey(m) === activeKey.current,
        );
        const all = merge(
          result.hasMore && initialized.current && previous
            ? [row, previous]
            : [row],
        );
        setMembers(all);
        callbacks.current.onCount(
          result.hasMore
            ? Math.max(row.threadCount || 1, all.length)
            : all.length,
          !result.hasMore,
        );
        const chosen = initialized.current
          ? all.find((m) => memberKey(m) === activeKey.current) || all[0]
          : all[0];
        const firstOpen = !initialized.current;
        initialized.current = true;
        setExpanded((current) =>
          firstOpen
            ? new Set([memberKey(chosen)])
            : new Set(
                [...current, memberKey(chosen)].filter((id) =>
                  all.some((m) => memberKey(m) === id),
                ),
              ),
        );
        setLoading(false);
        if (firstOpen && order === "oldest")
          requestAnimationFrame(() =>
            generation.current === version &&
            activeKey.current === memberKey(chosen)
              ? cards.current
                  .get(memberKey(chosen))
                  ?.scrollIntoView?.({ block: "start" })
              : undefined,
          );
        await openBody(chosen, version);
      } else
        setMembers((current) => {
          const all = merge(current);
          // Count is reported in an effect below, outside a React state updater.
          return all;
        });
    } catch (error) {
      stop(error, version);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    const version = ++generation.current;
    stopped.current = false;
    setFailure("");
    inFlight.current = new Set();
    setPending(new Set());
    if (!initialized.current) {
      setMembers([row]);
      setExpanded(new Set([memberKey(row)]));
      activeKey.current = memberKey(row);
      setActive(memberKey(row));
      callbacks.current.onActive(row, cache.current[memberKey(row)] || null);
    }
    if (row.threadId && row.threadId !== "0") void loadPage(1, version, true);
    else {
      setHasMore(false);
      initialized.current = true;
      void openBody(row, version);
    }
    return () => {
      generation.current++;
    };
  }, [
    account.profileId,
    account.id,
    remoteMessageId(row),
    row.threadId,
    props.revision,
  ]);
  useEffect(() => {
    if (members.length > 1)
      callbacks.current.onCount(
        hasMore
          ? Math.max(row.threadCount || 1, members.length)
          : members.length,
        !hasMore,
      );
  }, [members, hasMore]);
  const toggle = (m: Message) => {
    const id = memberKey(m);
    if (expanded.has(id)) {
      setExpanded((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      return;
    }
    setExpanded((s) => new Set([...s, id]));
    void openBody(m, generation.current);
  };
  const expandAll = async () => {
    const version = generation.current;
    setExpanded(new Set(members.map(memberKey)));
    // Serial, user-triggered downloads. Stop at the first failure.
    for (const m of members) {
      if (version !== generation.current || stopped.current) break;
      await openBody(m, version, false);
    }
  };
  const descending = newestMessages(members);
  const latest = descending[0];
  const latestId = latest && memberKey(latest);
  const chronology = [...descending].reverse();
  const shown = order === "newest" ? descending : chronology;
  const completeSequence = !hasMore && members.every(hasMessageTime);
  const showingEarlier = active !== latestId;
  const goLatest = () => {
    if (!latest) return;
    setExpanded((current) => new Set([...current, latestId]));
    void openBody(latest, generation.current);
    requestAnimationFrame(() =>
      cards.current.get(latestId)?.scrollIntoView?.({ block: "start" }),
    );
  };
  return (
    <div className="conversation-view" aria-label="Conversation">
      {(members.length > 1 || (row.threadCount || 1) > 1 || loading) && (
        <div className="conversation-toolbar">
          <div className="conversation-context">
            <strong>
              {loading
                ? "Loading conversation…"
                : `${members.length}${hasMore ? "+" : ""} messages in this conversation`}
            </strong>
            <span>
              {order === "newest"
                ? "Latest message at the top"
                : "Latest message at the bottom"}
            </span>
          </div>
          <div className="conversation-controls">
            <label className="conversation-order">
              <ArrowDownUp size={14} />
              <span className="sr-only">Conversation order</span>
              <select
                aria-label="Conversation order"
                value={order}
                onChange={(event) => {
                  const value = event.target.value as ConversationOrder;
                  setOrder(value);
                  rememberConversationOrder(value);
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <button
              className="latest-jump"
              onClick={goLatest}
              disabled={loading || busy || !!failure}
            >
              <ArrowUpRight size={14} />
              Go to latest
            </button>
            <button
              className="text-button"
              onClick={() => void expandAll()}
              disabled={loading || busy || !!failure}
            >
              Expand all
            </button>
            {expanded.size > 1 && (
              <button
                className="text-button"
                onClick={() => {
                  setExpanded(new Set([latestId]));
                  goLatest();
                }}
                disabled={loading || busy || !!failure}
              >
                Collapse earlier messages
              </button>
            )}
          </div>
          {!loading && members.length > 1 && (
            <p
              className={
                "conversation-position" +
                (showingEarlier ? " viewing-earlier" : "")
              }
              role="status"
            >
              {showingEarlier
                ? "Viewing an earlier message. Reply uses that message."
                : "Viewing the latest message."}
            </p>
          )}
        </div>
      )}
      {failure && (
        <p className="conversation-warning" role="status">
          {failure}
        </p>
      )}
      {shown.map((m) => {
        const id = memberKey(m),
          detail = details[id],
          isOpen = expanded.has(id);
        const isLatest = id === latestId;
        const ordinal = chronology.findIndex((p) => memberKey(p) === id) + 1;
        const own = addresses(m.from).some((email) =>
          account.aliases.some((alias) => alias.toLowerCase() === email),
        );
        return (
          <article
            key={id}
            ref={(node) => {
              if (node) cards.current.set(id, node);
              else cards.current.delete(id);
            }}
            aria-label={`${isLatest ? "Latest message" : "Earlier message"} from ${cleanText(m.sender || m.from)}`}
            className={
              "conversation-message" +
              (active === id ? " active-message" : "") +
              (isLatest ? " latest-message" : " earlier-message")
            }
          >
            <button
              className="conversation-summary"
              disabled={busy}
              aria-expanded={isOpen}
              aria-current={active === id ? "true" : undefined}
              onClick={() => toggle(m)}
            >
              {isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              <span
                className={"conversation-avatar" + (own ? " from-you" : "")}
                aria-hidden="true"
              >
                {own
                  ? "Y"
                  : cleanText(m.sender || m.from)
                      .slice(0, 1)
                      .toUpperCase()}
              </span>
              <span className="conversation-person">
                <span className="conversation-identity">
                  <strong>
                    {own ? "You · " : ""}
                    {cleanText(m.sender || m.from)}
                  </strong>
                  {!loading && members.length > 1 && (
                    <span
                      className={isLatest ? "latest-label" : "earlier-label"}
                    >
                      {isLatest ? "Latest" : "Earlier"}
                    </span>
                  )}
                  {m.unread && (
                    <span className="conversation-unread">Unread</span>
                  )}
                </span>
                <small>
                  {m.from}{" "}
                  <span className="conversation-sequence">
                    {completeSequence
                      ? `Message ${ordinal} of ${members.length}`
                      : isLatest
                        ? "Most recent message"
                        : "Earlier message"}
                  </span>
                </small>
              </span>
              <time
                className="conversation-date"
                dateTime={
                  hasMessageTime(m) ? new Date(m.time).toISOString() : undefined
                }
                title={date(m, true)}
              >
                {date(m)}
              </time>
            </button>
            {isOpen && (
              <div
                className="conversation-body"
                onFocus={() => {
                  if (busy) return;
                  activeKey.current = id;
                  setActive(id);
                  callbacks.current.onActive(m, detail || null);
                }}
              >
                <p className="conversation-recipients">
                  To: {cleanText(m.to)}
                  {m.cc && " · Cc: " + cleanText(m.cc)}
                </p>
                {pending.has(id) ? (
                  <p role="status">Opening message…</p>
                ) : detail ? (
                  <>
                    {detail.imageWarning && (
                      <p className="conversation-warning" role="status">
                        {detail.imageWarning}
                      </p>
                    )}
                    <MessageContent
                      html={detail.html}
                      dark={dark}
                      title={
                        active === id
                          ? "Email content"
                          : `Email content from ${cleanText(m.sender)}`
                      }
                      onOpenLink={(url) =>
                        void call({ op: "openLink", url }).catch(
                          callbacks.current.onFailure,
                        )
                      }
                    />
                    {detail.attachments.length > 0 && (
                      <div className="attachments">
                        <h4>
                          {detail.attachments.length} ATTACHMENT
                          {detail.attachments.length > 1 ? "S" : ""}
                        </h4>
                        {detail.attachments.map((a) => (
                          <button
                            className="attachment-card"
                            key={a.id}
                            disabled={busy || !!failure}
                            onClick={() => {
                              void call<string | null>({
                                op: "saveAttachment",
                                ...ref,
                                folderId: m.folderId,
                                messageId: remoteMessageId(m),
                                attachmentId: a.id,
                                name: a.name,
                              })
                                .then((result) => {
                                  if (result) callbacks.current.onToast(result);
                                })
                                .catch(callbacks.current.onFailure);
                            }}
                          >
                            <span>
                              <FileText size={23} />
                            </span>
                            <div>
                              <strong>{a.name}</strong>
                              <small>{(a.size / 1024).toFixed(1)} KB</small>
                            </div>
                            <Download size={17} />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="reply-buttons">
                      {!isLatest && (
                        <span className="earlier-reply-note">
                          Reply to this earlier message
                        </span>
                      )}
                      {props.drafts ? (
                        <button
                          className="secondary"
                          disabled={busy || !!failure}
                          onClick={() => props.onReply("edit", m, detail)}
                        >
                          Edit as new message
                        </button>
                      ) : (
                        <>
                          <button
                            className="secondary"
                            disabled={busy || !!failure}
                            onClick={() => props.onReply("reply", m, detail)}
                          >
                            <Reply size={17} />
                            Reply
                          </button>
                          <button
                            className="secondary"
                            disabled={busy || !!failure}
                            onClick={() => props.onReply("all", m, detail)}
                          >
                            <ReplyAll size={17} />
                            Reply all
                          </button>
                          <button
                            className="secondary"
                            disabled={busy || !!failure}
                            onClick={() => props.onReply("forward", m, detail)}
                          >
                            <ArrowRight size={17} />
                            Forward
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  !loading &&
                  !failure && <p>Message content could not be loaded.</p>
                )}
              </div>
            )}
          </article>
        );
      })}
      {hasMore && (
        <button
          className="secondary"
          disabled={loading || !!failure}
          onClick={() => void loadPage(nextStart, generation.current)}
        >
          Load older messages
        </button>
      )}
      <p className="privacy-note">
        <ShieldCheck size={13} /> Embedded images are displayed. Remote images
        and active content are blocked.
      </p>
    </div>
  );
}
