import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Send,
  Save,
  X,
  FileText,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Modal } from "./Modal";
import { call } from "./api";
import { mailPlainText, cleanEditorHtml } from "./sanitize";
import { textToHtml } from "./htmlPolicy";
import { RichEditor } from "./RichEditor";
import { Recipients } from "./Recipients";
import { registerDraftFlush } from "./draftFlush";
import { SendDelay } from "./sendDelay";
import {
  type Account,
  type Compose,
  type LocalFile,
  type Signature,
  validateRecipients,
  INLINE_DELIVERY_UNAVAILABLE,
  type PasteResult,
} from "./shared";
export function Composer({
  account,
  initial,
  demo,
  onClose,
  onSent,
}: {
  account: Account;
  initial: Compose;
  demo: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [c, setC] = useState<Compose>(() => ({
    ...initial,
    format: "html",
    body:
      initial.format === "html"
        ? cleanEditorHtml(initial.body)
        : textToHtml(initial.body),
  }));
  const [expanded, setExpanded] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [showCc, setShowCc] = useState(!!initial.cc);
  const [showBcc, setShowBcc] = useState(!!initial.bcc);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const delay = useRef(new SendDelay());
  const preparing = useRef(false);
  const alive = useRef(true);
  const preparationGeneration = useRef(0);
  const [pasting, setPasting] = useState(false);
  const [focusRevision, setFocusRevision] = useState(0);
  const [discard, setDiscard] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [recipientHistory, setRecipientHistory] = useState<string[]>([]);
  const sending = useRef(false);
  const latest = useRef(c);
  latest.current = c;
  const ref = { profileId: account.profileId, accountId: account.id };
  const locked = busy || countdown !== null || pasting;
  useEffect(() => {
    let active = true;
    void call<string[]>({ op: "recipientHistory", ...ref })
      .then((history) => {
        if (active) setRecipientHistory(history);
      })
      .catch(() => {
        if (active)
          setStatus(
            "Recipient suggestions unavailable. You can still enter addresses manually.",
          );
      });
    return () => {
      active = false;
    };
  }, [account.id, account.profileId]);
  useEffect(
    () => () => {
      alive.current = false;
      preparationGeneration.current++;
      delay.current.cancel();
    },
    [],
  );
  const patch = (data: Partial<Compose>) => {
    setC((old) => ({ ...old, ...data }));
  };
  const hasContent = (draft: Compose) =>
    !!(
      draft.to.trim() ||
      draft.cc.trim() ||
      draft.bcc.trim() ||
      draft.subject.trim() ||
      mailPlainText(draft.body).trim() ||
      /<img\b/i.test(draft.body) ||
      draft.attachments.length
    );
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sending.current || !hasContent(c)) return;
      void call({ op: "saveLocalDraft", ...ref, compose: c })
        .then(() =>
          setStatus(
            demo ? "Draft saved in this demo" : "Draft saved on this PC",
          ),
        )
        .catch((e) => setError(e.message));
    }, 600);
    return () => clearTimeout(timer);
  }, [c]);
  useEffect(
    () =>
      registerDraftFlush(async () => {
        preparationGeneration.current++;
        delay.current.cancel();
        if (sending.current)
          throw new Error(
            "Wait for the current message operation before exiting.",
          );
        if (hasContent(latest.current))
          await call({ op: "saveLocalDraft", ...ref, compose: latest.current });
      }),
    [account.id, account.profileId],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const close = async () => {
    if (busy || pasting) return;
    preparationGeneration.current++;
    delay.current.cancel();
    try {
      if (hasContent(latest.current))
        await call({ op: "saveLocalDraft", ...ref, compose: latest.current });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const submit = async (draft: boolean, message: Compose = c) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      validateRecipients(message, account.aliases);
      if (!demo && /<img\b/i.test(message.body)) {
        await call({ op: "saveLocalDraft", ...ref, compose: message });
        throw new Error(INLINE_DELIVERY_UNAVAILABLE);
      }
      if (draft) {
        await call({ op: "saveCloudDraft", ...ref, compose: message });
        setStatus("A new copy was saved in Zoho Drafts.");
      } else {
        await call({ op: "send", ...ref, compose: message, confirmed: true });
        await call({
          op: "saveLocalDraft",
          ...ref,
          compose: null,
          draftId: message.id,
        });
        onSent();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const attach = async () => {
    setError("");
    try {
      const files = await call<LocalFile[]>({ op: "pickFiles", ...ref });
      patch({ attachments: [...c.attachments, ...files] });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const requestSend = async () => {
    if (
      sending.current ||
      preparing.current ||
      delay.current.pending ||
      pasting
    )
      return;
    preparing.current = true;
    const generation = preparationGeneration.current;
    try {
      validateRecipients(c, account.aliases);
      setError("");
      setDiscard(false);
      const message = structuredClone(c);
      await call({ op: "saveLocalDraft", ...ref, compose: message });
      if (!demo && /<img\b/i.test(message.body))
        throw new Error(INLINE_DELIVERY_UNAVAILABLE);
      if (!alive.current || generation !== preparationGeneration.current)
        return;
      delay.current.start(() => void submit(false, message), setCountdown);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      preparing.current = false;
    }
  };
  const pasteMedia = async (files: File[]): Promise<PasteResult> => {
    if (locked) throw new Error("Cancel the pending send before pasting.");
    setPasting(true);
    setError("");
    setStatus("Pasting clipboard media…");
    try {
      let result: PasteResult = { attachments: [], images: [] };
      if (window.mail)
        result = await call<PasteResult>({ op: "pasteClipboard", ...ref });
      if (!result.attachments.length && !result.images.length && files.length) {
        const assets = [];
        let total = 0;
        for (const file of files) {
          total += file.size;
          if (total > 20 * 1024 * 1024)
            throw new Error("Pasted files must total less than 20 MB.");
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = () =>
              reject(new Error("The clipboard file could not be read."));
            reader.readAsDataURL(file);
          });
          assets.push({
            name: file.name || "Pasted file",
            mime: file.type || "application/octet-stream",
            base64,
            inline: file.type.startsWith("image/"),
          });
        }
        result = await call<PasteResult>({ op: "importPaste", ...ref, assets });
      }
      if (result.attachments.length)
        setC((old) => ({
          ...old,
          attachments: [...old.attachments, ...result.attachments],
        }));
      setStatus(
        result.images.length
          ? "Image inserted in the message."
          : result.attachments.length
            ? "Clipboard files attached."
            : "",
      );
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setPasting(false);
    }
  };
  return (
    <Modal
      title={
        c.replyId
          ? "Reply"
          : c.subject.startsWith("Fwd:")
            ? "Forward message"
            : "New message"
      }
      wide
      maximized={expanded}
      headerActions={
        <button
          className="icon-button"
          aria-label={expanded ? "Restore composer size" : "Maximize composer"}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      }
      onClose={() => void close()}
    >
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          void requestSend();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (!locked) void requestSend();
          }
        }}
      >
        <div className="compose-fields">
          <label className="inline-field">
            <span>From</span>
            <select
              value={c.from}
              disabled={locked}
              onChange={(e) => patch({ from: e.target.value })}
            >
              {account.aliases.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="recipient-toggles">
            <button
              type="button"
              className="text-button"
              onClick={() => setShowCc((v) => !v)}
            >
              Cc
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowBcc((v) => !v)}
            >
              Bcc
            </button>
          </div>
          {(
            [
              "to",
              ...(showCc || c.cc ? ["cc" as const] : []),
              ...(showBcc || c.bcc ? ["bcc" as const] : []),
            ] as const
          ).map((field) => (
            <label className="inline-field" key={field}>
              <span>
                {field === "to" ? "To" : field === "cc" ? "Cc" : "Bcc"}
              </span>
              <Recipients
                label={
                  field === "to"
                    ? "To recipients"
                    : field === "cc"
                      ? "Cc recipients"
                      : "Bcc recipients"
                }
                disabled={locked}
                history={recipientHistory}
                value={c[field]}
                onChange={(value) => patch({ [field]: value })}
              />
            </label>
          ))}
          <label className="inline-field">
            <span>Subject</span>
            <input
              aria-label="Subject"
              disabled={locked}
              value={c.subject}
              onChange={(e) => patch({ subject: e.target.value })}
            />
          </label>
        </div>
        <RichEditor
          disabled={locked}
          value={c.body}
          externalRevision={editorRevision}
          onChange={(body) => patch({ body, format: "html" })}
          onNotice={setStatus}
          onPasteMedia={pasteMedia}
          focusRevision={focusRevision}
        />
        <div className="compose-attachments">
          {c.attachments.map((a, i) => (
            <span className="attachment-chip" key={a.id + ":" + i}>
              <FileText size={15} />
              {a.name}
              <button
                type="button"
                aria-label={"Remove " + a.name}
                disabled={locked}
                onClick={() =>
                  patch({
                    attachments: c.attachments.filter(
                      (_, index) => index !== i,
                    ),
                  })
                }
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        {discard && (
          <div className="send-review">
            <strong>Discard this local draft?</strong>
            <p>
              This removes only this draft from this PC. Any copies already
              saved in Zoho remain there.
            </p>
            <button
              type="button"
              className="secondary danger"
              disabled={locked}
              onClick={() => {
                sending.current = true;
                setBusy(true);
                void call({
                  op: "saveLocalDraft",
                  ...ref,
                  compose: null,
                  draftId: c.id,
                })
                  .then(onClose)
                  .catch((e) => {
                    setError(e.message);
                    setBusy(false);
                    sending.current = false;
                  });
              }}
            >
              Discard draft
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setDiscard(false)}
            >
              Keep editing
            </button>
          </div>
        )}
        {countdown !== null && (
          <div className="send-countdown" role="status">
            <div>
              <strong>
                {c.schedule === "now" ? "Sending" : "Scheduling"} in {countdown}{" "}
                second{countdown === 1 ? "" : "s"}…
              </strong>
              <span>
                {c.to} · {c.attachments.length} attachment(s)
              </span>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => delay.current.sendNow()}
            >
              Send now
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                delay.current.cancel();
                setFocusRevision((r) => r + 1);
              }}
            >
              Cancel send
            </button>
            <div className="countdown-track">
              <span style={{ width: (countdown / 5) * 100 + "%" }} />
            </div>
          </div>
        )}
        <footer className="compose-footer">
          <div className="compose-buttons">
            <button className="primary" disabled={locked}>
              <Send size={16} /> Send
            </button>
            <select
              aria-label="Send time"
              value={c.schedule}
              disabled={locked}
              onChange={(e) =>
                patch({ schedule: e.target.value as Compose["schedule"] })
              }
            >
              <option value="now">Send now</option>
              <option value="1">In 1 hour</option>
              <option value="2">In 2 hours</option>
              <option value="3">In 4 hours</option>
            </select>
            <button
              type="button"
              className="icon-button"
              title={demo ? "Attach sample file" : "Attach files"}
              aria-label="Attach files"
              disabled={locked}
              onClick={() => void attach()}
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Save a new copy to Zoho Drafts"
              aria-label="Save copy to Zoho Drafts"
              disabled={locked}
              onClick={() => void submit(true)}
            >
              <Save size={18} />
            </button>
          </div>
          <div className="signature-tools">
            <button
              type="button"
              className="text-button"
              disabled={locked}
              onClick={() =>
                void call<Signature[]>({ op: "signatures", ...ref })
                  .then(setSignatures)
                  .catch((e) => setError(e.message))
              }
            >
              Signatures
            </button>
            {signatures.length > 0 && (
              <select
                aria-label="Insert signature"
                defaultValue=""
                onChange={(e) => {
                  const s = signatures.find((s) => s.id === e.target.value);
                  if (s) {
                    patch({
                      body: c.body + "<p></p>" + cleanEditorHtml(s.content),
                    });
                    setEditorRevision((r) => r + 1);
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Insert…</option>
                {signatures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </footer>
        <div className="compose-status">
          {busy
            ? "Working…"
            : status || "Rich-text message · Ctrl+Enter to send"}
          <span>
            {c.attachments.length
              ? `${(c.attachments.reduce((n, a) => n + a.size, 0) / 1024 / 1024).toFixed(1)} MB of 20 MB · `
              : ""}
            Files upload on send or cloud-save.
          </span>
          <button
            type="button"
            className="discard-link"
            disabled={locked}
            onClick={() => {
              setDiscard(true);
              delay.current.cancel();
            }}
          >
            Discard
          </button>
        </div>
      </form>
    </Modal>
  );
}
