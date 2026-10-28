import { useState, useRef, useEffect } from "react";
import { ShieldCheck, Plug, Unplug, Trash2, ExternalLink } from "lucide-react";
import { Modal } from "./Modal";
import { call } from "./api";
import { SmtpSettings } from "./SmtpSettings";
import {
  REGIONS,
  SCOPES,
  DEFAULT_PREFERENCES,
  type Region,
  type Snapshot,
  type Preferences,
} from "./shared";
export function Settings({
  snapshot,
  onUpdate,
  onClose,
  dark,
  onTheme,
  onConnected,
  smtpAccountKey,
}: {
  snapshot: Snapshot;
  onUpdate: (s: Snapshot) => void;
  onClose: () => void;
  dark: boolean;
  onTheme: () => void;
  onConnected?: (snapshot: Snapshot, email: string) => void;
  smtpAccountKey?: string;
}) {
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState<Region>("US");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState("");
  const [remove, setRemove] = useState("");
  const [feedback, setFeedback] = useState("");
  const active = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const prefs = snapshot.preferences || DEFAULT_PREFERENCES;
  useEffect(() => {
    let active = true;
    void call<Snapshot>({ op: "snapshot" })
      .then((s) => {
        if (active) onUpdate(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView?.({ block: "nearest" });
      errorRef.current?.focus();
    }
  }, [error]);
  const run = async (
    fn: () => Promise<Snapshot>,
    connectedEmail?: string,
    successMessage?: string,
  ) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const next = await fn();
      onUpdate(next);
      setReview("");
      setRemove("");
      if (successMessage) setFeedback(successMessage);
      if (connectedEmail) {
        onConnected?.(next, connectedEmail);
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
      try {
        onUpdate(await call<Snapshot>({ op: "snapshot" }));
      } catch {
        /* Keep the original validation error visible. */
      }
    } finally {
      setBusy(false);
      setCode("");
      setClientSecret("");
      active.current = false;
    }
  };
  const changePreference = (patch: Partial<Preferences>) =>
    void run(() =>
      call({ op: "preferences", preferences: { ...prefs, ...patch } }),
    );
  return (
    <Modal
      title="Settings & accounts"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="settings-body">
        {busy && (
          <div className="connection-progress" role="status">
            Working…{" "}
            {clientId
              ? "Validating your Zoho connection. This can take a few seconds."
              : "Applying your change."}
          </div>
        )}
        {error && (
          <div ref={errorRef} tabIndex={-1} role="alert" className="error-box">
            <strong>Could not complete this action</strong>
            <p>{error}</p>
          </div>
        )}
        {feedback && (
          <div role="status" className="notice">
            {feedback}
          </div>
        )}
        <div className="setting-row">
          <div>
            <strong>Appearance</strong>
            <p>Make yourself at home.</p>
          </div>
          <button className="secondary" onClick={onTheme}>
            {dark ? "Use light theme" : "Use dark theme"}
          </button>
        </div>
        <h3>Mail checks & notifications</h3>
        <div className="setting-row">
          <div>
            <strong>Check for new mail automatically</strong>
            <p>While connected, including when the window is hidden.</p>
          </div>
          <input
            type="checkbox"
            aria-label="Automatic mail checks"
            checked={prefs.automaticChecks}
            disabled={busy}
            onChange={(e) =>
              changePreference({ automaticChecks: e.target.checked })
            }
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Check interval</strong>
            <p>
              Accounts share Zoho’s request limit; busy sweeps may take longer.
            </p>
          </div>
          <select
            aria-label="Mail check interval"
            value={prefs.intervalSeconds}
            disabled={busy}
            onChange={(e) =>
              changePreference({
                intervalSeconds: Number(
                  e.target.value,
                ) as Preferences["intervalSeconds"],
              })
            }
          >
            {[15, 30, 60, 120].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>Desktop notifications</strong>
            <p>New mail alerts while you’re working elsewhere.</p>
          </div>
          <input
            type="checkbox"
            aria-label="Desktop notifications"
            checked={prefs.notifications}
            disabled={busy}
            onChange={(e) =>
              changePreference({ notifications: e.target.checked })
            }
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Show sender and subject</strong>
            <p>Turn off to show just the mailbox and message count.</p>
          </div>
          <input
            type="checkbox"
            aria-label="Notification previews"
            checked={prefs.notificationPreviews}
            disabled={busy}
            onChange={(e) =>
              changePreference({ notificationPreviews: e.target.checked })
            }
          />
        </div>
        <div className="setting-row">
          <strong>Notification sound</strong>
          <input
            type="checkbox"
            aria-label="Notification sound"
            checked={prefs.notificationSound}
            disabled={busy}
            onChange={(e) =>
              changePreference({ notificationSound: e.target.checked })
            }
          />
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void call<string>({ op: "testNotification" })
              .then((result) =>
                setFeedback(
                  typeof result === "string"
                    ? result
                    : "Test notification requested.",
                ),
              )
              .catch((e) => setError(e.message))
          }
        >
          Test notification
        </button>
        {snapshot.demo && (
          <button
            className="text-button"
            onClick={() =>
              void call({ op: "demoArrival" })
                .then(() =>
                  setFeedback(
                    "A fictional message arrived in the Studio mailbox.",
                  ),
                )
                .catch((e) => setError(e.message))
            }
          >
            Simulate new mail
          </button>
        )}
        <p className="muted">
          Closing or minimizing the Windows app keeps it in the system tray.
          Right-click its icon and choose Exit Fluent Mail to quit.
        </p>
        <h3>Your accounts</h3>
        {snapshot.demo ? (
          <p className="notice">
            This is an offline demo with fictional mail. Restart the Windows app
            normally to connect your own account.
          </p>
        ) : snapshot.profiles.length === 0 ? (
          <p className="muted">No accounts connected yet.</p>
        ) : (
          snapshot.profiles.map((p) => (
            <div className="profile-card" key={p.id}>
              <div>
                <strong>{p.email}</strong>
                <small>
                  {REGIONS[p.region].name} ·{" "}
                  {p.connected ? "Connected" : "Disconnected"}
                </small>
                {p.paused && <p className="error-text">{p.paused}</p>}
              </div>
              <div className="profile-actions">
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() =>
                    p.connected
                      ? void run(() =>
                          call({ op: "disconnect", profileId: p.id }),
                        )
                      : setReview(p.id)
                  }
                >
                  {p.connected ? <Unplug size={15} /> : <Plug size={15} />}{" "}
                  {p.connected ? "Disconnect" : "Connect"}
                </button>
                <button
                  disabled={busy}
                  className="icon-button"
                  title="Forget local account"
                  aria-label={"Forget " + p.email}
                  onClick={() => setRemove(p.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
        {review && (
          <div className="notice">
            <strong>
              Connect to {snapshot.profiles.find((p) => p.id === review)?.email}
              ?
            </strong>
            <p>
              This refreshes access and loads account details. Continue only
              after reviewing any previous error and completing any required
              account recovery.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    call({ op: "resume", profileId: review, reviewed: true }),
                  snapshot.profiles.find((p) => p.id === review)?.email,
                )
              }
            >
              Connect this account
            </button>
            <button className="text-button" onClick={() => setReview("")}>
              Cancel
            </button>
          </div>
        )}
        {remove && (
          <div className="notice">
            <strong>Forget this connection on this PC?</strong>
            <p>
              This removes its saved credentials and local draft. It does not
              delete the mailbox or revoke Zoho’s OAuth grant.
            </p>
            <button
              className="secondary danger"
              disabled={busy}
              onClick={() =>
                void run(() => call({ op: "forget", profileId: remove }))
              }
            >
              Forget local connection
            </button>
            <button className="text-button" onClick={() => setRemove("")}>
              Cancel
            </button>
          </div>
        )}
        <SmtpSettings
          snapshot={snapshot}
          busy={busy}
          preferredAccountKey={smtpAccountKey}
          run={(fn, message) => run(fn, undefined, message)}
        />
        {!snapshot.demo && (
          <>
            <h3>Add a Zoho account</h3>
            <p className="muted">
              Use your own OAuth Self Client for the API connection. Optional
              inline-image sending has a separate SMTP/app password above.
            </p>
            <details className="setup-guide">
              <summary>One-time connection instructions</summary>
              <ol>
                <li>
                  In the Zoho API Console for your account’s region, create a{" "}
                  <strong>Self Client</strong>.
                </li>
                <li>
                  Generate a code with the scopes below. Choose a validity
                  period long enough to finish this form.
                </li>
                <li>
                  Copy your Client ID, Client Secret and fresh code into this
                  window. Each person authorizes their own mailbox.
                </li>
              </ol>
              <label>
                Required scopes
                <textarea readOnly value={SCOPES} rows={4} />
              </label>
              <p>
                API access for a particular free account is subject to Zoho’s
                permissions. A rejected connection is stopped without retrying.
              </p>
              <button
                className="text-button"
                onClick={() =>
                  void call({
                    op: "openLink",
                    url: "https://www.zoho.com/developer/oauth/self-client/overview.html",
                  })
                }
              >
                Official setup guide <ExternalLink size={14} />
              </button>
            </details>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    call({
                      op: "connect",
                      email,
                      region,
                      clientId,
                      clientSecret,
                      code,
                    }),
                  email,
                );
              }}
            >
              <div className="form-grid">
                <label>
                  Mailbox email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourdomain.com"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Data center
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value as Region)}
                  >
                    {Object.entries(REGIONS).map(([key, r]) => (
                      <option key={key} value={key}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Client ID
                <input
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div className="form-grid">
                <label>
                  Client secret
                  <input
                    type="password"
                    required
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Fresh authorization code
                  <input
                    type="password"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
              <p className="secure-note">
                <ShieldCheck size={16} /> Stored with Windows encryption on this
                PC. Connections start only when you choose.
              </p>
              <button className="primary" disabled={busy}>
                {busy ? "Connecting…" : "Connect new account"}
              </button>
            </form>
          </>
        )}
        <p className="fine-print">
          Fluent Mail · Independent client for Zoho Mail · Automatic checks
          start after you connect
        </p>
      </div>
    </Modal>
  );
}
