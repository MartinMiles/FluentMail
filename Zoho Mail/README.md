# Fluent Mail

A standalone Windows client for Zoho Mail, built for a familiar three-pane workflow. Independent software, not an official Zoho application.

## Run

Open **`release/Fluent-Mail-1.0.0-Windows-x64.exe`**. The portable package includes its runtime; Node.js is not required on the receiving computer. The unpacked alternative is `release/win-unpacked/Fluent Mail.exe` (keep that entire directory together).

The app starts disconnected. **Explore with sample mail** opens a completely offline demo. The demo uses fictional `example.test` mailboxes; it cannot send real email. Close and restart normally to leave demo mode.

The build is unsigned. No certificate or auto-update service has been configured. Source, tests, lockfile and build scripts are provided for reproducibility.

## Multiple mailboxes and businesses

- Add each independent Zoho authorization in **Settings → Add a Zoho account**. All mailbox accounts returned by that authorization are listed.
- A Zoho organization administrator is not automatically authorized to read each employee's mailbox. Separate login identities require separate owner-authorized OAuth grants, even when they share a domain.
- Different businesses, domains, free accounts and supported Zoho data centers can coexist in the same application. The credential and mailbox identities remain separate.
- The mailbox picker opens an individual mailbox or **All inboxes**. The unified view shows up to the latest 40 messages from each connected Inbox, sorted together. Open an individual mailbox for complete pagination and folder/label management. Searches in the unified view query each connected mailbox.
- Every unified message identifies its source mailbox. Reply/reply-all use that mailbox automatically, honor Reply-To, and preserve the original message reference. New messages ask which mailbox to send from. Only aliases returned for that mailbox are offered as From addresses.
- Bulk selection is restricted to one source mailbox at a time. This prevents ambiguous cross-business folder and label operations.

## Connect a mailbox

Use the official [Zoho Self Client instructions](https://www.zoho.com/developer/oauth/self-client/overview.html). This is a one-time personal application setup, not an IMAP/SMTP workaround or a mailbox-password login.

1. Sign in yourself to your region's Zoho API Console, using the identity that owns the mailbox.
2. Create a **Self Client**. Keep its Client ID and Client Secret private.
3. Generate a fresh authorization code with the scopes displayed below and in the application's connection instructions. Select a validity period that gives you time to complete the form.
4. In Fluent Mail Settings, enter the expected mailbox address, data center, Client ID, Client Secret and code. Select **Connect new account** once.
5. The application exchanges that code and checks that the authenticated mailbox matches the address entered. It then loads the selected mailbox's folders, labels and first message page. Other identities must be connected individually.

```text
ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.folders.CREATE,ZohoMail.folders.UPDATE,ZohoMail.tags.READ,ZohoMail.tags.CREATE,ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.messages.UPDATE
```

These are mailbox scopes, not organization-administrator scopes. Alias addresses do not create separate inboxes.

**Production access has not been tested.** Official API contracts and offline fixtures were used to implement the integration. API entitlement on a particular free account must be confirmed with an owner-approved connection. Do not assume successful demo behavior proves live authorization or mail delivery.

## Everyday use

- Search accepts Zoho search syntax, for example `subject:proposal` or `from:someone@example.com`. Press Enter to search; typing does not issue requests.
- Opening a message reads its content; use the toolbar to explicitly mark it read/unread.
- Archive, flags, spam/not-spam, labels and moves operate on the selected messages. Trash is a move, not permanent deletion. Permanent delete/empty-folder commands are intentionally absent.
- Compose supports plain text, To/Cc/Bcc, authorized From addresses, reply/reply-all, forwarding, file attachments, signatures converted to text, and Zoho's 1/2/4-hour delayed-send presets.
- **Review & send** shows the sender, recipients, subject, timing and attachment count before the final send. A successful response means Zoho accepted the operation, not that every recipient received it.
- Local drafts are encrypted and stored separately per authorization/mailbox/draft. Compose lets you resume saved drafts or start another. Closing a composer preserves it; Discard removes only that local draft.
- **Save copy to Zoho Drafts** creates a new cloud draft. It does not silently overwrite an existing server draft. Opening a cloud draft uses **Edit as new message**; the original stays in Zoho.
- Attachments stay local until send/cloud-save. The client caps uploads at 20 MB total and downloads at 30 MB. Files must be reattached after restarting. Forwarding and editing-as-new do not automatically copy the original attachments; download and reattach the ones you want.
- Remote images, embedded forms, scripts, unsafe URLs and active content are removed from displayed messages. Safe web links are listed separately and require confirmation before opening in your browser. This also means inline images and complex email styling are not reproduced.
- Manual refresh only. There is no background collector, tray auto-start, telemetry, or automatic reconnect. Sessions expire after Zoho's access token expires; reconnect explicitly in Settings.

## Keyboard shortcuts

| Shortcut  | Action                             |
| --------- | ---------------------------------- |
| Ctrl+N    | Choose a sending mailbox / compose |
| Ctrl+K    | Focus search                       |
| Up / Down | Browse the message list            |
| R         | Reply                              |
| F5        | Refresh the current view           |
| Escape    | Clear selection or close a dialog  |

## Data and account safety

OAuth credentials and local drafts are stored in `%APPDATA%\SafetyFluent\Fluent Mail\settings.vault`, encrypted using Electron `safeStorage` and Windows user protection. There is no plaintext fallback. Access tokens never reach the renderer. Saved accounts remain disconnected on startup. Demo launches with `--demo` use isolated storage and never instantiate the live service.

Network, authentication, permission, rate-limit and unexpected-response failures stop the affected connection. There is no automatic retry. Sends are recorded as pending before the final request; uncertain sends cannot be repeated from the same draft, even after a restart. Check Zoho's Sent folder before deliberately creating another message. Review any account restriction with the owner before reconnecting.

For an assistant-led live check, follow `PLAN.md`: explicit owner approval for one named mailbox, this Windows client/device, a bounded connection attempt and owner availability. Mail sending requires a separately specified recipient and content. A previous login or saved token is not testing authorization.

## Develop and test

```powershell
npm ci
npm run check
npm test
npm run build
npm run demo
npm run package
```

`npm run dev` serves a **demo-only** renderer at `http://127.0.0.1:5187`. It has no live backend or credentials. `npm run smoke` launches the desktop shell hidden in isolated demo mode, checks that the renderer/preload work and Node is not exposed, then exits. To write its small non-sensitive result, set `FLUENT_SMOKE_RESULT` to a local output path before running it.

See [API coverage](docs/API-COVERAGE.md), [test report](docs/TEST-REPORT.md), and [project context](PROJECT_CONTEXT.md). Read `PROJECT_CONTEXT.md` first on every future visit to this project.
