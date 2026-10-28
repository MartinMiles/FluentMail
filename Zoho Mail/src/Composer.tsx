import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Save, X, FileText } from "lucide-react";
import { Modal } from "./Modal";
import { call } from "./api";
import { mailPlainText } from "./sanitize";
import {
  type Account,
  type Compose,
  type LocalFile,
  type Signature,
  validateRecipients,
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
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const sending = useRef(false);
  const latest = useRef(c);
  latest.current = c;
  const ref = { profileId: account.profileId, accountId: account.id };
  const patch = (data: Partial<Compose>) => {
    setC((old) => ({ ...old, ...data }));
    setReview(false);
  };
  const hasContent = (draft: Compose) =>
    !!(
      draft.to.trim() ||
      draft.cc.trim() ||
      draft.bcc.trim() ||
      draft.subject.trim() ||
      draft.body.trim() ||
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
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const close = async () => {
    if (busy) return;
    try {
      if (hasContent(latest.current))
        await call({ op: "saveLocalDraft", ...ref, compose: latest.current });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const submit = async (draft: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      validateRecipients(c, account.aliases);
      if (draft) {
        await call({ op: "saveCloudDraft", ...ref, compose: c });
        setStatus("A new copy was saved in Zoho Drafts.");
        setReview(false);
      } else {
        await call({ op: "send", ...ref, compose: c, confirmed: true });
        await call({
          op: "saveLocalDraft",
          ...ref,
          compose: null,
          draftId: c.id,
        });
        onSent();
      }
    } catch (e) {
      setError((e as Error).message);
      setReview(false);
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
      onClose={() => void close()}
    >
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validateRecipients(c, account.aliases);
            setError("");
            setReview(true);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="compose-fields">
          <label className="inline-field">
            <span>From</span>
            <select
              value={c.from}
              disabled={busy}
              onChange={(e) => patch({ from: e.target.value })}
            >
              {account.aliases.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          {(["to", "cc", "bcc"] as const).map((field) => (
            <label className="inline-field" key={field}>
              <span>
                {field === "to" ? "To" : field === "cc" ? "Cc" : "Bcc"}
              </span>
              <input
                aria-label={
                  field === "to"
                    ? "To recipients"
                    : field === "cc"
                      ? "Cc recipients"
                      : "Bcc recipients"
                }
                disabled={busy}
                value={c[field]}
                onChange={(e) => patch({ [field]: e.target.value })}
                placeholder={
                  field === "to" ? "Email addresses, separated by commas" : ""
                }
              />
            </label>
          ))}
          <label className="inline-field">
            <span>Subject</span>
            <input
              aria-label="Subject"
              disabled={busy}
              value={c.subject}
              onChange={(e) => patch({ subject: e.target.value })}
            />
          </label>
        </div>
        <textarea
          className="compose-body"
          aria-label="Message body"
          placeholder="Write your message…"
          disabled={busy}
          value={c.body}
          onChange={(e) => patch({ body: e.target.value })}
        />
        <div className="compose-attachments">
          {c.attachments.map((a, i) => (
            <span className="attachment-chip" key={a.id + ":" + i}>
              <FileText size={15} />
              {a.name}
              <button
                type="button"
                aria-label={"Remove " + a.name}
                disabled={busy}
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
              disabled={busy}
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
        {review && (
          <div className="send-review">
            <strong>
              {demo ? "Simulate sending" : "Send this message"}
              {c.schedule !== "now" ? " later" : ""}?
            </strong>
            <p>
              From {c.from}
              <br />
              To {c.to}
              {c.cc && (
                <>
                  <br />
                  Cc {c.cc}
                </>
              )}
              {c.bcc && (
                <>
                  <br />
                  Bcc {c.bcc}
                </>
              )}
            </p>
            <p>
              {c.subject || "(No subject)"} · {c.attachments.length}{" "}
              attachment(s)
              {c.schedule !== "now"
                ? " · in " +
                  { "1": "1 hour", "2": "2 hours", "3": "4 hours" }[c.schedule]
                : ""}
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void submit(false)}
            >
              {busy
                ? "Submitting…"
                : demo
                  ? "Confirm demo send"
                  : "Confirm send"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Keep editing
            </button>
          </div>
        )}
        <footer className="compose-footer">
          <div className="compose-buttons">
            <button className="primary" disabled={busy || review}>
              <Send size={16} /> Review & send
            </button>
            <select
              aria-label="Send time"
              value={c.schedule}
              disabled={busy}
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
              disabled={busy}
              onClick={() => void attach()}
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Save a new copy to Zoho Drafts"
              aria-label="Save copy to Zoho Drafts"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              <Save size={18} />
            </button>
          </div>
          <div className="signature-tools">
            <button
              type="button"
              className="text-button"
              disabled={busy}
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
                  if (s)
                    patch({
                      body: c.body + "\n\n" + mailPlainText(s.content),
                    });
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
          {busy ? "Working…" : status || "Plain-text message"}
          <span>Attachments upload only when sending or saving to Zoho.</span>
          <button
            type="button"
            className="discard-link"
            disabled={busy}
            onClick={() => {
              setDiscard(true);
              setReview(false);
            }}
          >
            Discard
          </button>
        </div>
      </form>
    </Modal>
  );
}
