import { useEffect, useState } from "react";
import { call } from "./api";
import { REGIONS, type Snapshot, type SmtpServer } from "./shared";

export function SmtpSettings({
  snapshot,
  busy,
  run,
  preferredAccountKey,
}: {
  snapshot: Snapshot;
  busy: boolean;
  run: (action: () => Promise<Snapshot>, message: string) => Promise<void>;
  preferredAccountKey?: string;
}) {
  const accounts = snapshot.accounts.filter((a) =>
    snapshot.profiles.some((p) => p.id === a.profileId && p.connected),
  );
  const keyOf = (a: (typeof accounts)[number]) => a.profileId + ":" + a.id;
  const [key, setKey] = useState(
    preferredAccountKey || (accounts[0] ? keyOf(accounts[0]) : ""),
  );
  const [password, setPassword] = useState("");
  const [server, setServer] = useState<SmtpServer>(
    snapshot.smtp?.[key]?.server || "standard",
  );
  const account = accounts.find((a) => keyOf(a) === key);
  const accountSignature = accounts.map(keyOf).join("|");
  useEffect(() => {
    if (!accounts.some((a) => keyOf(a) === key)) {
      setPassword("");
      setKey(accounts[0] ? keyOf(accounts[0]) : "");
    }
  }, [accountSignature, key]);
  const selectedKey = account ? keyOf(account) : "";
  const status = snapshot.smtp?.[selectedKey];
  const unsaved = !!password || server !== (status?.server || "standard");
  useEffect(() => {
    setPassword("");
    setServer(snapshot.smtp?.[selectedKey]?.server || "standard");
  }, [selectedKey]);
  if (snapshot.demo)
    return (
      <section>
        <h3>Inline images</h3>
        <p className="muted">
          The demo keeps fictional images on this PC. SMTP setup is available in
          the Windows client with your connected mailbox.
        </p>
      </section>
    );
  if (!account)
    return (
      <section>
        <h3>Inline images</h3>
        <p className="muted">
          Connect a saved mailbox to set up inline-image sending.
        </p>
      </section>
    );
  const ref = { profileId: account.profileId, accountId: account.id };
  const profile = snapshot.profiles.find((p) => p.id === account.profileId)!;
  const host =
    (server === "pro" ? "smtppro." : "smtp.") +
    new URL(REGIONS[profile.region].mail).hostname.replace(/^mail\./, "");
  return (
    <section
      className="smtp-settings"
      aria-label="Inline image sending settings"
    >
      <h3>Inline images (SMTP)</h3>
      <p className="muted">
        Send pasted images inside the message without extra image-file copies.
        Receiving and ordinary sends keep using your existing API connection.
      </p>
      <label>
        Mailbox
        <select
          aria-label="Mailbox for inline images"
          value={selectedKey}
          disabled={busy}
          onChange={(e) => {
            setPassword("");
            setKey(e.target.value);
            setServer(snapshot.smtp?.[e.target.value]?.server || "standard");
          }}
        >
          {accounts.map((a) => (
            <option key={keyOf(a)} value={keyOf(a)}>
              {a.email}
            </option>
          ))}
        </select>
      </label>
      <p className="fine-print">
        SMTP sign-in: {account.email} ·{" "}
        {status?.paused
          ? "Paused"
          : status?.verifiedAt
            ? "Verified"
            : status?.configured
              ? "Password saved"
              : "Setup required"}
      </p>
      {status?.paused && <p className="error-text">{status.paused}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!password || busy) return;
          void run(
            () =>
              call<Snapshot>({ op: "configureSmtp", ...ref, password, server }),
            "SMTP password saved securely on this PC. Check the connection or send your image message.",
          ).finally(() => setPassword(""));
        }}
      >
        <label>
          Zoho SMTP server
          <select
            aria-label="Zoho SMTP server"
            value={server}
            disabled={busy}
            onChange={(e) => setServer(e.target.value as SmtpServer)}
          >
            <option value="standard">Standard / free organization</option>
            <option value="pro">Existing paid organization</option>
          </select>
        </label>
        <p className="fine-print">
          {host} · encrypted connection on port 465. Use the server class shown
          in your Zoho account; this does not change your subscription.
        </p>
        <label>
          SMTP/app password
          <input
            aria-label="SMTP/app password"
            type="password"
            autoComplete="off"
            value={password}
            disabled={busy}
            autoFocus={!!preferredAccountKey}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="fine-print">
          Use a Zoho app password if two-factor authentication is on; otherwise
          use the mailbox password. This is separate from the OAuth client
          secret. It stays in the Windows-encrypted settings vault.
        </p>
        <div className="smtp-buttons">
          <button className="primary" disabled={busy || !password}>
            Save SMTP password
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !status?.configured || !!status.paused || unsaved}
            onClick={() =>
              void run(
                () => call<Snapshot>({ op: "testSmtp", ...ref }),
                "SMTP sign-in verified. No email was sent.",
              )
            }
          >
            Check SMTP connection
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !status?.configured}
            onClick={() =>
              void run(
                () => call<Snapshot>({ op: "removeSmtp", ...ref }),
                "SMTP password removed from this PC. The API connection is retained.",
              ).finally(() => setPassword(""))
            }
          >
            Remove SMTP password
          </button>
        </div>
      </form>
      <p className="fine-print">
        Inline-image messages send now; image drafts stay on this PC. Zoho
        normally saves SMTP messages in Sent. SMTP access depends on your
        account; failures stop for review without a retry.
      </p>
    </section>
  );
}
