import { useState } from "react";
import { ShieldCheck, Plug, Unplug, Trash2, ExternalLink } from "lucide-react";
import { Modal } from "./Modal";
import { call } from "./api";
import { REGIONS, SCOPES, type Region, type Snapshot } from "./shared";
export function Settings({
  snapshot,
  onUpdate,
  onClose,
  dark,
  onTheme,
}: {
  snapshot: Snapshot;
  onUpdate: (s: Snapshot) => void;
  onClose: () => void;
  dark: boolean;
  onTheme: () => void;
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
  const run = async (fn: () => Promise<Snapshot>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onUpdate(await fn());
      setReview("");
      setRemove("");
    } catch (e) {
      setError((e as Error).message);
      onUpdate(await call<Snapshot>({ op: "snapshot" }));
    } finally {
      setBusy(false);
      setCode("");
      setClientSecret("");
    }
  };
  return (
    <Modal
      title="Settings & accounts"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="settings-body">
        <div className="setting-row">
          <div>
            <strong>Appearance</strong>
            <p>Make yourself at home.</p>
          </div>
          <button className="secondary" onClick={onTheme}>
            {dark ? "Use light theme" : "Use dark theme"}
          </button>
        </div>
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
                void run(() =>
                  call({ op: "resume", profileId: review, reviewed: true }),
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
        {!snapshot.demo && (
          <>
            <h3>Add a Zoho account</h3>
            <p className="muted">
              Use your own OAuth Self Client. Mailbox passwords are never
              requested.
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
                void run(() =>
                  call({
                    op: "connect",
                    email,
                    region,
                    clientId,
                    clientSecret,
                    code,
                  }),
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
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <p className="fine-print">
          Fluent Mail · Independent client for Zoho Mail · No automatic mail
          polling
        </p>
      </div>
    </Modal>
  );
}
