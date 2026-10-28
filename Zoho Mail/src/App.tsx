import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Check,
  FileText,
  Folder as FolderIcon,
  Inbox,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  X,
  AlertCircle,
  ArrowUpRight,
  Download,
  PanelLeft,
  Keyboard,
  Info,
} from "lucide-react";
import { call, subscribe } from "./api";
import {
  type Snapshot,
  type Account,
  type Folder,
  type Label,
  type Message,
  type Detail,
  type ListResult,
  type Compose,
  type Command,
  PAGE_SIZE,
  blankCompose,
  addresses,
  DEFAULT_PREFERENCES,
  type AppEvent,
} from "./shared";
import {
  cleanText,
  safeMail,
  mailPlainText,
  cleanEditorHtml,
} from "./sanitize";
import { escapeHtml } from "./htmlPolicy";
import { APP_INFO } from "./version";
import { About } from "./About";
import { flushActiveDraft } from "./draftFlush";
import { mergeInboxUpdate } from "./inboxUpdates";
import { Settings } from "./Settings";
import { Composer } from "./Composer";
import { Modal } from "./Modal";

const initialSnapshot: Snapshot = { demo: false, profiles: [], accounts: [] };
const accountKey = (a: Account) => a.profileId + ":" + a.id;
const initials = (name: string) =>
  name
    .split(/[ @.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
const time = (stamp: number) =>
  stamp
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(stamp)
    : "";
const shortTime = (stamp: number) =>
  new Date(stamp).toDateString() === new Date().toDateString()
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(stamp)
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(stamp);
function FolderGlyph({ type }: { type: string }) {
  const props = { size: 18 };
  switch (type.toLowerCase()) {
    case "inbox":
      return <Inbox {...props} />;
    case "sent":
      return <Send {...props} />;
    case "drafts":
      return <FileText {...props} />;
    case "trash":
      return <Trash2 {...props} />;
    case "spam":
      return <AlertCircle {...props} />;
    case "archive":
      return <Archive {...props} />;
    default:
      return <FolderIcon {...props} />;
  }
}
function Tool({
  title,
  children,
  onClick,
  disabled = false,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function App() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [boot, setBoot] = useState(true);
  const [key, setKey] = useState("");
  const unified = key === "unified";
  const [mailboxFolders, setMailboxFolders] = useState<
    Record<string, Folder[]>
  >({});
  const [senderChoice, setSenderChoice] = useState(false);
  const [draftChoice, setDraftChoice] = useState<{
    account: Account;
    drafts: Compose[];
  } | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loadedFor, setLoadedFor] = useState("");
  const [view, setView] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [start, setStart] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const [lastChecked, setLastChecked] = useState(0);
  const eventHandler = useRef<(event: AppEvent) => Promise<void>>(
    async () => {},
  );
  const pendingOpen = useRef<{ account: Account; message: Message } | null>(
    null,
  );
  const previousListScope = useRef("");
  const prefs = snapshot.preferences || DEFAULT_PREFERENCES;
  const [compose, setCompose] = useState<{
    account: Account;
    value: Compose;
  } | null>(null);
  const [headers, setHeaders] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [manage, setManage] = useState<"" | "folder" | "label" | "rename">("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#5579b9");
  const [dark, setDark] = useState(
    localStorage.getItem("fluent-theme") === "dark",
  );
  const [compact, setCompact] = useState(false);
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const lock = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const availableAccounts = snapshot.accounts.filter((a) =>
    snapshot.profiles.some((p) => p.id === a.profileId && p.connected),
  );
  const connectionSignature = snapshot.profiles
    .filter((p) => p.connected)
    .map((p) => p.id)
    .join("|");
  const account = unified
    ? availableAccounts[0]
    : snapshot.accounts.find((a) => accountKey(a) === key);
  const ref = account
    ? { profileId: account.profileId, accountId: account.id }
    : null;
  const profile = account
    ? snapshot.profiles.find((p) => p.id === account.profileId)
    : undefined;
  const connected = !!profile?.connected;
  const message = messages.find((m) => m.id === selected);
  const folder = folders.find((f) => f.id === view);
  const label = labels.find((l) => "label:" + l.id === view);
  const sourceAccount = (m: Message) =>
    snapshot.accounts.find((a) => accountKey(a) === m.sourceKey) || account!;
  const messageAccount = message ? sourceAccount(message) : account;
  const messageRef = messageAccount
    ? { profileId: messageAccount.profileId, accountId: messageAccount.id }
    : null;
  const messageId = (m: Message) => m.remoteId || m.id;
  const title = unified
    ? query
      ? "Search all mailboxes"
      : "All inboxes"
    : query
      ? "Search results"
      : view === "all"
        ? "All mail"
        : view === "starred"
          ? "Flagged"
          : label?.name || folder?.name || "Inbox";
  const safe = useMemo(
    () => safeMail(detail?.html || "", dark),
    [detail?.html, dark],
  );
  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong.");
    void call<Snapshot>({ op: "snapshot" })
      .then(setSnapshot)
      .catch(() => {});
  }, []);
  const updateSnapshot = (s: Snapshot) => {
    setSnapshot(s);
    if (
      !(key === "unified" && s.accounts.length > 1) &&
      !s.accounts.some((a) => accountKey(a) === key)
    )
      setKey(s.accounts[0] ? accountKey(s.accounts[0]) : "");
  };
  eventHandler.current = async (event) => {
    if (event.type === "prepare-exit") {
      try {
        await flushActiveDraft();
        await call({ op: "quitReady", requestId: event.requestId });
      } catch {
        await call({
          op: "quitReady",
          requestId: event.requestId,
          error: "Draft could not be saved.",
        });
      }
      return;
    }
    if (event.type === "about") {
      setAbout(true);
      return;
    }
    if (event.type === "notice") {
      setToast(event.message);
      return;
    }
    if (event.type === "connection") {
      setSnapshot(event.snapshot);
      if (event.error) setError(event.error);
      return;
    }
    if (event.type === "open-message") {
      pendingOpen.current = { account: event.account, message: event.message };
      setKey(accountKey(event.account));
      setQuery("");
      setQueryInput("");
      setFilter("all");
      setStart(1);
      setRefresh((r) => r + 1);
      return;
    }
    if (event.type === "inbox") {
      const u = event.update;
      setLastChecked(u.checkedAt);
      if (u.catchUpLimited)
        setToast(
          "A large batch of mail arrived. Open the mailbox to review older arrivals.",
        );
      else if (u.fresh.length)
        setToast(
          `${u.fresh.length} new message${u.fresh.length === 1 ? "" : "s"} · ${u.account.email}`,
        );
      if (
        !loading &&
        !busy &&
        !query &&
        filter === "all" &&
        start === 1 &&
        (unified ||
          (account &&
            key === accountKey(u.account) &&
            folder?.path.toLowerCase() === "/inbox"))
      ) {
        setMessages((current) => mergeInboxUpdate(current, u, unified));
        if (!unified) setHasMore(u.hasMore);
      }
    }
  };
  useEffect(
    () =>
      subscribe((event) => {
        void eventHandler.current(event);
      }),
    [],
  );
  useEffect(() => {
    let active = true;
    void call<Snapshot>({ op: "snapshot" })
      .then((s) => {
        if (active) {
          setSnapshot(s);
          setKey(s.accounts[0] ? accountKey(s.accounts[0]) : "");
        }
      })
      .catch(fail)
      .finally(() => {
        if (active) setBoot(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("fluent-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let active = true;
    listGeneration.current++;
    detailGeneration.current++;
    setMessages([]);
    setSelected("");
    setChecked([]);
    setDetail(null);
    setFolders([]);
    setLabels([]);
    setLoadedFor("");
    setQuery("");
    setQueryInput("");
    setStart(1);
    if (!ref || !connected) return;
    setLoading(true);
    void (async () => {
      try {
        if (unified) {
          const all: Record<string, Folder[]> = {};
          for (const a of availableAccounts) {
            all[accountKey(a)] = await call<Folder[]>({
              op: "folders",
              profileId: a.profileId,
              accountId: a.id,
            });
            if (!active) return;
          }
          setMailboxFolders(all);
          setFolders([]);
          setLabels([]);
          setView("unified");
          setLoadedFor(key);
          return;
        }
        const f = await call<Folder[]>({ op: "folders", ...ref });
        if (!active) return;
        const l = await call<Label[]>({ op: "labels", ...ref });
        if (!active) return;
        setFolders(f);
        setLabels(l);
        setView(
          f.find((x) => x.path.toLowerCase() === "/inbox")?.id ||
            f[0]?.id ||
            "all",
        );
        setLoadedFor(key);
      } catch (e) {
        if (active) fail(e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [key, connected, connectionSignature]);
  useEffect(() => {
    if (!ref || loadedFor !== key || !connected) return;
    const generation = ++listGeneration.current;
    const scope = [key, view, filter, query, start].join("|");
    const scopeChanged = previousListScope.current !== scope;
    previousListScope.current = scope;
    setLoading(true);
    if (scopeChanged) {
      setSelected("");
      setDetail(null);
      setChecked([]);
    }
    if (unified) {
      void (async () => {
        try {
          const combined: Message[] = [];
          for (const a of availableAccounts) {
            if (generation !== listGeneration.current) return;
            const inbox = mailboxFolders[accountKey(a)]?.find(
              (f) => f.path.toLowerCase() === "/inbox",
            );
            if (!inbox) continue;
            const r = await call<ListResult>({
              op: "list",
              profileId: a.profileId,
              accountId: a.id,
              start: 1,
              filter,
              ...(query ? { query } : { folderId: inbox.id }),
            });
            combined.push(
              ...r.messages.map((m) => ({
                ...m,
                id: accountKey(a) + ":" + m.id,
                remoteId: m.id,
                sourceKey: accountKey(a),
              })),
            );
          }
          if (generation === listGeneration.current) {
            setMessages(combined.sort((a, b) => b.time - a.time));
            setHasMore(false);
          }
        } catch (e) {
          if (generation === listGeneration.current) {
            setMessages([]);
            fail(e);
          }
        } finally {
          if (generation === listGeneration.current) setLoading(false);
        }
      })();
      return () => {
        listGeneration.current++;
      };
    }
    const cmd: Command = {
      op: "list",
      ...ref,
      start,
      filter: view === "starred" ? "flagged" : filter,
      ...(query
        ? { query }
        : label
          ? { labelId: label.id }
          : folder
            ? { folderId: folder.id }
            : {}),
    };
    void call<ListResult>(cmd)
      .then((r) => {
        if (generation === listGeneration.current) {
          const pending = pendingOpen.current;
          if (pending && accountKey(pending.account) === key) {
            setMessages(
              r.messages.some((m) => m.id === pending.message.id)
                ? r.messages
                : [pending.message, ...r.messages],
            );
            setSelected(pending.message.id);
            pendingOpen.current = null;
          } else setMessages(r.messages);
          setHasMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (generation === listGeneration.current) {
          setMessages([]);
          fail(e);
        }
      })
      .finally(() => {
        if (generation === listGeneration.current) setLoading(false);
      });
    return () => {
      listGeneration.current++;
    };
  }, [key, loadedFor, view, filter, query, start, refresh, connected]);
  useEffect(() => {
    const generation = ++detailGeneration.current;
    setDetail(null);
    if (!ref || !message || !connected) return;
    setBodyLoading(true);
    void call<Detail>({
      op: "detail",
      ...messageRef!,
      folderId: message.folderId,
      messageId: messageId(message),
      attachments: message.hasAttachment,
    })
      .then((d) => {
        if (generation === detailGeneration.current) setDetail(d);
      })
      .catch((e) => {
        if (generation === detailGeneration.current) fail(e);
      })
      .finally(() => {
        if (generation === detailGeneration.current) setBodyLoading(false);
      });
    return () => {
      detailGeneration.current++;
    };
  }, [key, selected, connected]);
  const chooseView = (v: string) => {
    if (busy) return;
    setView(v);
    setQuery("");
    setQueryInput("");
    setStart(1);
    setFilter("all");
  };
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const action = async (
    action: Extract<Command, { op: "action" }>["action"],
    target?: string,
    ids?: string[],
  ) => {
    if (!ref || !connected) return;
    const chosen =
      ids || (checked.length ? checked : selected ? [selected] : []);
    if (!chosen.length) return;
    await run(async () => {
      const selectedMessages = chosen
        .map((id) => messages.find((m) => m.id === id))
        .filter((m): m is Message => !!m);
      if (!selectedMessages.length) return;
      const source = sourceAccount(selectedMessages[0]);
      if (
        selectedMessages.some(
          (m) => accountKey(sourceAccount(m)) !== accountKey(source),
        )
      )
        throw new Error("Select messages from one mailbox at a time.");
      const dest =
        target === "__trash__"
          ? (unified ? mailboxFolders[accountKey(source)] : folders)?.find(
              (f) => f.type === "Trash",
            )?.id
          : target;
      if (action === "move" && !dest)
        throw new Error(
          "The destination folder is unavailable. Open this mailbox individually to choose a folder.",
        );
      await call({
        op: "action",
        profileId: source.profileId,
        accountId: source.id,
        ids: selectedMessages.map(messageId),
        action,
        target: dest,
      });
      setToast(action === "move" ? "Messages moved." : "Updated.");
      setRefresh((r) => r + 1);
    });
  };
  const composeFrom = (sender: Account) => {
    setSenderChoice(false);
    void run(async () => {
      const drafts = await call<Compose[]>({
        op: "listLocalDrafts",
        profileId: sender.profileId,
        accountId: sender.id,
      });
      if (drafts.length) setDraftChoice({ account: sender, drafts });
      else setCompose({ account: sender, value: blankCompose(sender.email) });
    });
  };
  const newMessage = () => {
    if (!account || !connected || busy) return;
    if (availableAccounts.length > 1) setSenderChoice(true);
    else composeFrom(account);
  };
  const reply = (mode: "reply" | "all" | "forward" | "edit") => {
    if (!messageAccount || !message || !detail) return;
    const c = blankCompose(messageAccount.email);
    const own = messageAccount.aliases.map((a) => a.toLowerCase());
    c.subject =
      (mode === "forward"
        ? "Fwd: "
        : mode === "edit"
          ? ""
          : /^re:/i.test(message.subject)
            ? ""
            : "Re: ") + message.subject;
    if (mode === "reply" || mode === "all") {
      c.to = addresses(message.from)
        .filter((e) => !own.includes(e))
        .join(", ");
      if (!c.to)
        c.to = addresses(message.to)
          .filter((e) => !own.includes(e))
          .join(", ");
      if (mode === "all")
        c.cc = [
          ...new Set([...addresses(message.to), ...addresses(message.cc)]),
        ]
          .filter((e) => !own.includes(e) && !addresses(c.to).includes(e))
          .join(", ");
      c.replyId = messageId(message);
      c.replyFolderId = message.folderId;
    }
    if (mode === "edit") {
      c.to = addresses(message.to).join(", ");
      c.cc = addresses(message.cc).join(", ");
      c.format = "html";
      c.body = cleanEditorHtml(detail.html);
    } else {
      c.format = "html";
      c.body =
        "<p></p><blockquote><p>" +
        escapeHtml(
          mode === "forward"
            ? "---------- Forwarded message ----------"
            : `On ${time(message.time)}, ${message.from} wrote:`,
        ) +
        "</p>" +
        cleanEditorHtml(detail.html) +
        "</blockquote>";
    }
    if (message.hasAttachment && (mode === "forward" || mode === "edit"))
      setToast(
        "Reattach any files you want to include; original attachments are not copied automatically.",
      );
    if (mode === "reply" || mode === "all") {
      void run(async () => {
        const headers = await call<string>({
          op: "headers",
          profileId: messageAccount.profileId,
          accountId: messageAccount.id,
          folderId: message.folderId,
          messageId: messageId(message),
        });
        const replyTo = headers
          .replace(/\r?\n[ \t]+/g, " ")
          .match(/^reply-to:\s*(.+)$/im)?.[1];
        if (replyTo) {
          const recipients = addresses(replyTo).filter((e) => !own.includes(e));
          if (recipients.length) c.to = recipients.join(", ");
        }
        if (mode === "all")
          c.cc = [
            ...new Set([...addresses(message.to), ...addresses(message.cc)]),
          ]
            .filter((e) => !own.includes(e) && !addresses(c.to).includes(e))
            .join(", ");
        setCompose({ account: messageAccount, value: c });
      });
    } else setCompose({ account: messageAccount, value: c });
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        settings ||
        about ||
        compose ||
        headers !== null ||
        help ||
        manage ||
        senderChoice ||
        draftChoice
      )
        return;
      const typing =
        e.target instanceof HTMLElement &&
        !!e.target.closest("input,textarea,select,[contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newMessage();
        return;
      }
      if (typing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const index = messages.findIndex((m) => m.id === selected);
        setSelected(
          messages[
            Math.max(
              0,
              Math.min(
                messages.length - 1,
                index + (e.key === "ArrowDown" ? 1 : -1),
              ),
            )
          ]?.id || "",
        );
      }
      if (e.key === "r" && detail) reply("reply");
      if (e.key === "F5") {
        e.preventDefault();
        if (!loading) setRefresh((r) => r + 1);
      }
      if (e.key === "Escape") {
        setChecked([]);
        setSelected("");
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  const hasSelection = checked.length > 0 || !!selected;
  const disabled = !hasSelection || busy || !connected || loading;
  return (
    <div className={"app " + (compact ? "compact" : "")}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Mail size={22} />
          </span>
          <span>
            Fluent <b>Mail</b>
          </span>
        </div>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(queryInput.trim());
            setStart(1);
          }}
        >
          <Search size={19} />
          <input
            ref={searchRef}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            aria-label="Search mail"
            placeholder="Search mail · subject:proposal, from:name"
            disabled={!connected || busy}
          />
          {queryInput ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQueryInput("");
                setQuery("");
              }}
            >
              <X size={15} />
            </button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </form>
        <div className="header-end">
          {snapshot.demo && <span className="demo-pill">Offline demo</span>}
          <Tool title="Keyboard shortcuts" onClick={() => setHelp(true)}>
            <Keyboard size={19} />
          </Tool>
          <Tool title="Settings" onClick={() => setSettings(true)}>
            <SettingsIcon size={20} />
          </Tool>
          <Tool title="About Fluent Mail" onClick={() => setAbout(true)}>
            <Info size={20} />
          </Tool>
          <span className="header-avatar">
            {account ? initials(account.name) : "FM"}
          </span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-top">
            <button
              className="compose-button"
              disabled={!connected || busy}
              onClick={newMessage}
            >
              <PenLine size={19} />
              Compose <kbd>Ctrl N</kbd>
            </button>
            {account ? (
              <label className="account-picker">
                <span className="account-orb">
                  {unified ? "ALL" : initials(account.name)}
                </span>
                <select
                  aria-label="Switch mailbox"
                  disabled={busy || !!compose}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                >
                  {availableAccounts.length > 1 && (
                    <option value="unified">All inboxes</option>
                  )}
                  {snapshot.accounts.map((a) => (
                    <option key={accountKey(a)} value={accountKey(a)}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <button
                className="connect-sidebar"
                onClick={() => setSettings(true)}
              >
                <Plus size={17} /> Connect an account
              </button>
            )}
          </div>
          <nav aria-label="Mail folders">
            <div className="nav-caption">MAILBOX</div>
            {folders.map((f) => (
              <button
                key={f.id}
                className={
                  "nav-item " + (!query && view === f.id ? "active" : "")
                }
                disabled={busy}
                onClick={() => chooseView(f.id)}
              >
                <FolderGlyph type={f.name} />
                <span>{f.name}</span>
                {f.id === view &&
                  !query &&
                  filter === "all" &&
                  messages.some((m) => m.unread) && (
                    <b>
                      {messages.filter((m) => m.unread).length}
                      {hasMore ? "+" : ""}
                    </b>
                  )}
              </button>
            ))}
            {unified && (
              <>
                <button
                  className="nav-item active"
                  onClick={() => {
                    setQuery("");
                    setQueryInput("");
                  }}
                >
                  <Inbox size={18} />
                  <span>All inboxes</span>
                </button>
                <div className="nav-caption">INDIVIDUAL MAILBOXES</div>
                {availableAccounts.map((a) => (
                  <button
                    className="nav-item"
                    key={accountKey(a)}
                    onClick={() => setKey(accountKey(a))}
                  >
                    <Mail size={17} />
                    <span>{a.email}</span>
                  </button>
                ))}
              </>
            )}
            {account && !unified && (
              <>
                <button
                  className={
                    "nav-item " + (view === "starred" && !query ? "active" : "")
                  }
                  onClick={() => chooseView("starred")}
                  disabled={busy}
                >
                  <Star size={18} />
                  <span>Flagged</span>
                </button>
                <button
                  className={
                    "nav-item " + (view === "all" && !query ? "active" : "")
                  }
                  onClick={() => chooseView("all")}
                  disabled={busy}
                >
                  <Mail size={18} />
                  <span>All mail</span>
                </button>
              </>
            )}
            {!unified && (
              <>
                <div className="nav-caption section">
                  <span>LABELS</span>
                  <Tool
                    title="New label"
                    disabled={!connected || busy}
                    onClick={() => {
                      setName("");
                      setManage("label");
                    }}
                  >
                    <Plus size={15} />
                  </Tool>
                </div>
                {labels.map((l) => (
                  <button
                    className={
                      "nav-item " +
                      (view === "label:" + l.id && !query ? "active" : "")
                    }
                    key={l.id}
                    disabled={busy}
                    onClick={() => chooseView("label:" + l.id)}
                  >
                    <span
                      className="label-dot"
                      style={{ background: l.color }}
                    />
                    <span>{l.name}</span>
                  </button>
                ))}
                <button
                  className="nav-item subtle"
                  disabled={!connected || busy}
                  onClick={() => {
                    setName("");
                    setManage("folder");
                  }}
                >
                  <Plus size={17} />
                  <span>New folder</span>
                </button>
              </>
            )}
          </nav>
          <div className="sidebar-bottom">
            <ShieldCheck size={18} />
            <div>
              {snapshot.demo
                ? "A space to try things"
                : "Your mail, your space"}
              <small>
                {snapshot.demo
                  ? "Sample mail · nothing is sent"
                  : connected
                    ? "Connected to Zoho"
                    : "Disconnected"}
              </small>
            </div>
          </div>
        </aside>
        {!account ? (
          <main className="welcome">
            <div className="welcome-icon">
              <Mail size={42} />
            </div>
            <p className="eyebrow">WELCOME TO FLUENT MAIL</p>
            <h1>
              Your inbox.
              <br />A little clearer.
            </h1>
            <p>
              A familiar place for your Zoho mail.
              <br />
              All your folders, fewer distractions.
            </p>
            <button className="primary" onClick={() => setSettings(true)}>
              {snapshot.profiles.length
                ? "Connect a saved account"
                : "Connect your Zoho account"}
              <ArrowRight size={17} />
            </button>
            <button
              className="text-button"
              onClick={() =>
                void call<Snapshot>({ op: "demo" })
                  .then(updateSnapshot)
                  .catch(fail)
              }
            >
              Explore with sample mail
            </button>
            {boot && <span>Opening…</span>}
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
          </main>
        ) : (
          <main className="mail-area">
            <div className="mail-heading">
              <div>
                <h1>{title}</h1>
                <span>
                  {unified
                    ? `${availableAccounts.length} mailboxes · latest ${PAGE_SIZE} messages from each · open a mailbox for full history`
                    : account.email}
                </span>
              </div>
              <div className="heading-actions">
                <span
                  className={"connection-dot " + (connected ? "online" : "")}
                />
                <span>
                  {connected
                    ? lastChecked
                      ? "Checked " + shortTime(lastChecked)
                      : prefs.automaticChecks
                        ? "Automatic checks on"
                        : "Checks paused"
                    : "Disconnected"}
                </span>
                <Tool
                  title="Refresh mail"
                  disabled={loading || busy || !connected}
                  onClick={() => setRefresh((r) => r + 1)}
                >
                  <RefreshCw size={18} className={loading ? "spinning" : ""} />
                </Tool>
                <Tool
                  title="Toggle compact list"
                  onClick={() => setCompact((v) => !v)}
                >
                  <PanelLeft size={18} />
                </Tool>
              </div>
            </div>
            {error && (
              <div className="error-box inline-error" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
                <button
                  className="text-button"
                  onClick={() => setSettings(true)}
                >
                  Accounts
                </button>
                <Tool title="Dismiss error" onClick={() => setError("")}>
                  <X size={15} />
                </Tool>
              </div>
            )}
            <div className="mail-toolbar">
              <input
                type="checkbox"
                aria-label="Select all visible messages"
                checked={
                  messages.length > 0 && checked.length === messages.length
                }
                disabled={busy || loading || unified}
                onChange={(e) =>
                  setChecked(e.target.checked ? messages.map((m) => m.id) : [])
                }
              />
              <div className="toolbar-divider" />
              <Tool
                title="Archive"
                disabled={disabled}
                onClick={() => void action("archive")}
              >
                <Archive size={18} />
              </Tool>
              <Tool
                title="Move to Trash"
                disabled={
                  disabled ||
                  (!unified && !folders.some((f) => f.type === "Trash"))
                }
                onClick={() => void action("move", "__trash__")}
              >
                <Trash2 size={18} />
              </Tool>
              <Tool
                title="Mark as read"
                disabled={disabled}
                onClick={() => void action("read")}
              >
                <MailOpen size={18} />
              </Tool>
              <Tool
                title="Mark as unread"
                disabled={disabled}
                onClick={() => void action("unread")}
              >
                <Mail size={18} />
              </Tool>
              <select
                aria-label="Move messages to folder"
                value=""
                disabled={disabled || unified}
                onChange={(e) => void action("move", e.target.value)}
              >
                <option value="">Move to…</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Apply label"
                value=""
                disabled={disabled || unified}
                onChange={(e) => void action("label", e.target.value)}
              >
                <option value="">Label…</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <details className="more-menu">
                <summary aria-label="More message actions">
                  <MoreHorizontal size={20} />
                </summary>
                <div>
                  <button
                    disabled={disabled}
                    onClick={() => void action("spam")}
                  >
                    Mark as spam
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => void action("notspam")}
                  >
                    Not spam
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => void action("unarchive")}
                  >
                    Unarchive
                  </button>
                  {label && (
                    <button
                      disabled={disabled}
                      onClick={() => void action("unlabel", label.id)}
                    >
                      Remove this label
                    </button>
                  )}
                  {folder &&
                    ![
                      "Inbox",
                      "Sent",
                      "Drafts",
                      "Trash",
                      "Spam",
                      "Archive",
                      "Outbox",
                      "Templates",
                      "Snoozed",
                    ].includes(folder.name) && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setName(folder.name);
                          setManage("rename");
                        }}
                      >
                        Rename folder
                      </button>
                    )}
                </div>
              </details>
              <span className="toolbar-spacer" />
              <span className="page-count">
                {messages.length
                  ? `${start}–${start + messages.length - 1}`
                  : "0 messages"}
              </span>
              <Tool
                title="Previous page"
                disabled={start === 1 || loading || busy}
                onClick={() => setStart((s) => Math.max(1, s - PAGE_SIZE))}
              >
                <ArrowLeft size={16} />
              </Tool>
              <Tool
                title="Next page"
                disabled={!hasMore || loading || busy}
                onClick={() => setStart((s) => s + PAGE_SIZE)}
              >
                <ArrowRight size={16} />
              </Tool>
            </div>
            <div className="mail-columns">
              <section className="message-list" aria-label="Message list">
                <div className="list-tabs">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => {
                      setFilter("all");
                      setStart(1);
                    }}
                    disabled={busy || !!query}
                  >
                    All
                  </button>
                  <button
                    className={filter === "unread" ? "selected" : ""}
                    onClick={() => {
                      setFilter("unread");
                      setStart(1);
                    }}
                    disabled={busy || !!query}
                  >
                    Unread
                  </button>
                  <span>Newest first</span>
                </div>
                <div className="list-scroll">
                  {loading ? (
                    <div className="list-loading">
                      <RefreshCw className="spinning" size={24} />
                      <span>Loading mail…</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="empty-list">
                      <Inbox size={32} />
                      <h3>{query ? "No matches" : "All clear"}</h3>
                      <p>
                        {query
                          ? "Try a different Zoho search expression."
                          : "There are no messages in this view."}
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={
                          "message-row " +
                          (selected === m.id ? "current " : "") +
                          (m.unread ? "unread" : "")
                        }
                      >
                        <div className="row-check">
                          <input
                            type="checkbox"
                            aria-label={"Select " + cleanText(m.subject)}
                            checked={checked.includes(m.id)}
                            disabled={busy}
                            onChange={(e) =>
                              setChecked((ids) =>
                                e.target.checked
                                  ? [
                                      ...ids.filter(
                                        (id) =>
                                          !unified ||
                                          messages.find((x) => x.id === id)
                                            ?.sourceKey === m.sourceKey,
                                      ),
                                      m.id,
                                    ]
                                  : ids.filter((id) => id !== m.id),
                              )
                            }
                          />
                          <button
                            className={
                              "row-star " +
                              (m.flag !== "flag_not_set" ? "flagged" : "")
                            }
                            title="Toggle flag"
                            aria-label={"Flag " + cleanText(m.subject)}
                            disabled={busy || !connected}
                            onClick={() =>
                              void action(
                                m.flag === "flag_not_set" ? "flag" : "unflag",
                                undefined,
                                [m.id],
                              )
                            }
                          >
                            <Star size={15} />
                          </button>
                        </div>
                        <button
                          className="message-select"
                          aria-label={"Open " + cleanText(m.subject)}
                          aria-pressed={selected === m.id}
                          onClick={() => setSelected(m.id)}
                          disabled={busy}
                        >
                          <div className="row-top">
                            <strong>{cleanText(m.sender)}</strong>
                            <time>{shortTime(m.time)}</time>
                          </div>
                          <div className="row-subject">
                            {m.unread && <span className="unread-dot" />}
                            {cleanText(m.subject)}
                            {m.hasAttachment && <Paperclip size={13} />}
                          </div>
                          <p>{cleanText(m.summary)}</p>
                          {unified ? (
                            <div className="row-labels">
                              <span>{sourceAccount(m).email}</span>
                            </div>
                          ) : (
                            m.labels.length > 0 && (
                              <div className="row-labels">
                                {m.labels.map((id) => {
                                  const l = labels.find((l) => l.id === id);
                                  return l ? (
                                    <span key={id}>{l.name}</span>
                                  ) : null;
                                })}
                              </div>
                            )
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="list-footer">
                  {checked.length
                    ? `${checked.length} selected`
                    : "Select a message to read"}
                  <span>{snapshot.demo ? "Demo" : "Zoho Mail"}</span>
                </div>
              </section>
              <section className="reader" aria-label="Reading pane">
                {!message ? (
                  <div className="reader-empty">
                    <div className="envelope-art">
                      <Mail size={52} strokeWidth={1} />
                      <span />
                    </div>
                    <h2>A little room to focus.</h2>
                    <p>
                      Choose a message from your inbox.
                      <br />
                      We’ll keep the rest out of your way.
                    </p>
                    <span className="shortcut-hint">
                      <kbd>↑</kbd>
                      <kbd>↓</kbd> to browse · <kbd>R</kbd> to reply
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="reader-heading">
                      <h2>{cleanText(message.subject)}</h2>
                      <div className="reader-actions">
                        <Tool
                          title="Reply"
                          disabled={!detail || busy}
                          onClick={() => reply("reply")}
                        >
                          <Reply size={18} />
                        </Tool>
                        <Tool
                          title="Reply all"
                          disabled={!detail || busy}
                          onClick={() => reply("all")}
                        >
                          <ReplyAll size={18} />
                        </Tool>
                        <Tool
                          title="Forward"
                          disabled={!detail || busy}
                          onClick={() => reply("forward")}
                        >
                          <ArrowRight size={18} />
                        </Tool>
                        <Tool
                          title="View headers"
                          disabled={busy || bodyLoading}
                          onClick={() =>
                            void run(async () =>
                              setHeaders(
                                await call<string>({
                                  op: "headers",
                                  ...messageRef!,
                                  folderId: message.folderId,
                                  messageId: messageId(message),
                                }),
                              ),
                            )
                          }
                        >
                          <MoreHorizontal size={20} />
                        </Tool>
                      </div>
                    </div>
                    <div className="sender-card">
                      <span className="sender-avatar">
                        {initials(cleanText(message.sender))}
                      </span>
                      <div>
                        <strong>{cleanText(message.sender)}</strong>
                        <span>{message.from}</span>
                        <small>
                          To: {cleanText(message.to)}
                          {message.cc && " · Cc: " + cleanText(message.cc)}
                        </small>
                      </div>
                      <time>{time(message.time)}</time>
                    </div>
                    <div className="reader-scroll">
                      {bodyLoading ? (
                        <div className="body-loading">
                          <RefreshCw className="spinning" size={22} /> Opening
                          message…
                        </div>
                      ) : detail ? (
                        <>
                          <div className="message-document">
                            <iframe
                              title="Email content"
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
                                  key={a.id}
                                  className="attachment-card"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      const result = await call<string | null>({
                                        op: "saveAttachment",
                                        ...messageRef!,
                                        folderId: message.folderId,
                                        messageId: messageId(message),
                                        attachmentId: a.id,
                                        name: a.name,
                                      });
                                      if (result) setToast(result);
                                    })
                                  }
                                >
                                  <span>
                                    <FileText size={23} />
                                  </span>
                                  <div>
                                    <strong>{a.name}</strong>
                                    <small>
                                      {(a.size / 1024).toFixed(1)} KB
                                    </small>
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
                              {safe.links.map((l) => (
                                <button
                                  className="text-button"
                                  key={l.url}
                                  onClick={() =>
                                    void call({
                                      op: "openLink",
                                      url: l.url,
                                    }).catch(fail)
                                  }
                                >
                                  {l.label}
                                  <small>{l.url}</small>
                                  <ArrowUpRight size={14} />
                                </button>
                              ))}
                            </details>
                          )}
                          <div className="reply-buttons">
                            {folder?.type === "Drafts" ? (
                              <button
                                className="secondary"
                                onClick={() => reply("edit")}
                              >
                                <PenLine size={17} /> Edit as new message
                              </button>
                            ) : (
                              <>
                                <button
                                  className="secondary"
                                  onClick={() => reply("reply")}
                                >
                                  <Reply size={17} /> Reply
                                </button>
                                <button
                                  className="secondary"
                                  onClick={() => reply("all")}
                                >
                                  <ReplyAll size={17} /> Reply all
                                </button>
                                <button
                                  className="secondary"
                                  onClick={() => reply("forward")}
                                >
                                  <ArrowRight size={17} /> Forward
                                </button>
                              </>
                            )}
                          </div>
                          <p className="privacy-note">
                            <ShieldCheck size={13} /> Remote images and active
                            content are blocked.
                          </p>
                        </>
                      ) : (
                        <div className="empty-list">
                          <p>Message content could not be loaded.</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
          </main>
        )}
      </div>
      <footer className="app-status">
        <span className={"status-dot " + (connected ? "online" : "")} />
        {snapshot.demo
          ? "Offline demo — fictional messages, no network access"
          : connected
            ? prefs.automaticChecks
              ? `Connected · automatic checks every ${prefs.intervalSeconds}s`
              : "Connected · automatic checks paused"
            : "Ready · no account traffic"}
        <button
          className="status-end status-about"
          onClick={() => setAbout(true)}
        >
          {busy
            ? "Working…"
            : snapshot.demo
              ? `Fluent Mail ${APP_INFO.version} · Demo`
              : `Fluent Mail ${APP_INFO.version}`}
        </button>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {settings && (
        <Settings
          snapshot={snapshot}
          onUpdate={updateSnapshot}
          onClose={() => setSettings(false)}
          dark={dark}
          onTheme={() => setDark((d) => !d)}
          onConnected={(s, email) => {
            const a = s.accounts.find(
              (a) =>
                a.email.toLowerCase() === email.toLowerCase() ||
                a.aliases.some(
                  (alias) => alias.toLowerCase() === email.toLowerCase(),
                ),
            );
            if (a) setKey(accountKey(a));
            setToast(
              `Connected ${email}. Your inbox is loading and automatic checks are ready.`,
            );
          }}
        />
      )}
      {about && <About onClose={() => setAbout(false)} />}
      {senderChoice && (
        <Modal
          title="Send from which mailbox?"
          onClose={() => setSenderChoice(false)}
        >
          <div className="sender-choices">
            {availableAccounts.map((a) => (
              <button
                className="profile-card"
                aria-label={"Compose from " + a.email}
                key={accountKey(a)}
                onClick={() => composeFrom(a)}
              >
                <span className="account-orb">{initials(a.name)}</span>
                <div>
                  <strong>{a.email}</strong>
                  <small>{a.name}</small>
                </div>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {draftChoice && (
        <Modal title="Your saved drafts" onClose={() => setDraftChoice(null)}>
          <div className="sender-choices">
            <p className="muted">
              {draftChoice.account.email} · saved on this PC
            </p>
            <button
              className="primary"
              onClick={() => {
                setCompose({
                  account: draftChoice.account,
                  value: blankCompose(draftChoice.account.email),
                });
                setDraftChoice(null);
              }}
            >
              <Plus size={16} /> New message
            </button>
            {draftChoice.drafts.map((d) => (
              <div className="profile-card" key={d.id}>
                <button
                  className="text-button"
                  onClick={() => {
                    setCompose({ account: draftChoice.account, value: d });
                    setDraftChoice(null);
                  }}
                >
                  {d.subject || "(No subject)"}
                  <small>{d.to || "No recipient yet"}</small>
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {compose && (
        <Composer
          key={compose.value.id}
          account={compose.account}
          initial={compose.value}
          demo={snapshot.demo}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            setToast(
              snapshot.demo
                ? "Demo message sent. No email left this device."
                : "Zoho accepted the message.",
            );
            setRefresh((r) => r + 1);
          }}
        />
      )}
      {headers !== null && (
        <Modal title="Message headers" onClose={() => setHeaders(null)} wide>
          <textarea
            className="headers"
            aria-label="Message headers"
            readOnly
            value={headers}
          />
        </Modal>
      )}
      {help && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <div className="shortcuts">
            {[
              ["Ctrl + N", "Compose or resume draft"],
              ["Ctrl + K", "Search mail"],
              ["↑ / ↓", "Select a message"],
              ["R", "Reply to selected message"],
              ["F5", "Refresh current view"],
              ["Esc", "Clear selection or close dialog"],
            ].map(([key, value]) => (
              <div key={key}>
                <span>{value}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {manage && (
        <Modal
          title={
            manage === "label"
              ? "New label"
              : manage === "rename"
                ? "Rename folder"
                : "New folder"
          }
          onClose={() => {
            if (!busy) setManage("");
          }}
        >
          <form
            className="manage-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!ref) return;
                await call(
                  manage === "label"
                    ? { op: "createLabel", ...ref, name, color }
                    : manage === "rename"
                      ? { op: "renameFolder", ...ref, folderId: view, name }
                      : { op: "createFolder", ...ref, name },
                );
                setFolders(await call({ op: "folders", ...ref }));
                setLabels(await call({ op: "labels", ...ref }));
                setManage("");
                setToast("Saved.");
              });
            }}
          >
            <label>
              Name
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {manage === "label" ? (
              <label>
                Color
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            ) : (
              <p className="muted">Use letters and spaces.</p>
            )}
            {error && <p className="error-text">{error}</p>}
            <button className="primary" disabled={busy}>
              Save
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
