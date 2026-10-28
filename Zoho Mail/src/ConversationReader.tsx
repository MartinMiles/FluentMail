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
} from "lucide-react";
import { call } from "./api";
import type { Account, Detail, ListResult, Message } from "./shared";
import { PAGE_SIZE } from "./shared";
import { remoteMessageId } from "./conversations";
import { cleanText, safeMail } from "./sanitize";

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
const date = (stamp: number) =>
  stamp
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(stamp)
    : "";

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
        for (const m of [...current, ...result.messages])
          unique.set(remoteMessageId(m), { ...m, sourceKey: row.sourceKey });
        return [...unique.values()].sort((a, b) => a.time - b.time);
      };
      setHasMore(result.hasMore);
      setNextStart(start + PAGE_SIZE);
      if (initial) {
        const all = merge([row]);
        setMembers(all);
        callbacks.current.onCount(
          result.hasMore
            ? Math.max(row.threadCount || 1, all.length)
            : all.length,
          !result.hasMore,
        );
        await openBody(row, version);
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
    setMembers([row]);
    setExpanded(new Set([memberKey(row)]));
    activeKey.current = memberKey(row);
    setActive(memberKey(row));
    callbacks.current.onActive(row, cache.current[memberKey(row)] || null);
    if (row.threadId && row.threadId !== "0") void loadPage(1, version, true);
    else {
      setHasMore(false);
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
  return (
    <div className="conversation-view" aria-label="Conversation">
      {(members.length > 1 || (row.threadCount || 1) > 1 || loading) && (
        <div className="conversation-toolbar">
          <span>
            {loading
              ? "Loading conversation…"
              : `${members.length}${hasMore ? "+" : ""} messages in this conversation`}
          </span>
          <button
            className="text-button"
            onClick={() => void expandAll()}
            disabled={loading || busy || !!failure}
          >
            Expand all
          </button>
        </div>
      )}
      {failure && (
        <p className="conversation-warning" role="status">
          {failure}
        </p>
      )}
      {members.map((m) => {
        const id = memberKey(m),
          detail = details[id],
          isOpen = expanded.has(id);
        const safe = detail ? safeMail(detail.html, dark) : null;
        return (
          <article
            key={id}
            className={
              "conversation-message" + (active === id ? " active-message" : "")
            }
          >
            <button
              className="conversation-summary"
              aria-expanded={isOpen}
              onClick={() => toggle(m)}
            >
              {isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              <span className="conversation-person">
                <strong>{cleanText(m.sender || m.from)}</strong>
                <small>{m.from}</small>
              </span>
              <span className="conversation-date">{date(m.time)}</span>
              {m.unread && <span className="unread-dot" />}
            </button>
            {isOpen && (
              <div
                className="conversation-body"
                onFocus={() => {
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
                ) : detail && safe ? (
                  <>
                    {detail.imageWarning && (
                      <p className="conversation-warning" role="status">
                        {detail.imageWarning}
                      </p>
                    )}
                    <div className="message-document">
                      <iframe
                        title={
                          active === id
                            ? "Email content"
                            : `Email content from ${cleanText(m.sender)}`
                        }
                        sandbox=""
                        referrerPolicy="no-referrer"
                        srcDoc={safe.document}
                      />
                    </div>
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
                    {safe.links.length > 0 && (
                      <details className="message-links">
                        <summary>
                          Links in this message ({safe.links.length})
                        </summary>
                        {safe.links.map((link) => (
                          <button
                            key={link.url}
                            className="text-button"
                            onClick={() =>
                              void call({
                                op: "openLink",
                                url: link.url,
                              }).catch(callbacks.current.onFailure)
                            }
                          >
                            {link.label}
                            <small>{link.url}</small>
                          </button>
                        ))}
                      </details>
                    )}
                    <div className="reply-buttons">
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
