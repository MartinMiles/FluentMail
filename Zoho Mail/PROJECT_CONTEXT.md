# Fluent Mail — persistent project context

**Read this file first every time this project is resumed.** Required by the owner on 2026-10-27 and enforced by both workspace and project AGENTS.md files. Keep this file in ordinary source control. Update it with material decisions, evidence, blockers, resolutions and reasons. Never put secrets, private messages, tokens, cookies, phone numbers or unrelated account information here.

## Current release: 1.1.0 — owner steering on 2026-10-28

The owner **personally reports** that v1.0 successfully connected a Zoho mailbox and sent an attachment to an external mailbox. The exact tested mailbox/recipient was not specified. This is owner-reported evidence, not an assistant-run/observed live test; do not extrapolate it to every API, account or the new background/HTML features.

The owner requested successful connection feedback (close the dialog), visible validation errors, automatic receiving/notifications, system-tray residency until explicit right-click Exit, Gmail-style WYSIWYG editing, and About/version/creator information. Creator is **Martin Miles, SafetyFluent, martin@safetyfluent.com**. This explicitly supersedes v1.0's manual-refresh and plaintext-only product decisions. It authorizes implementing normal connected-session polling/token renewal, not assistant-led testing against saved live credentials.

### v1.1 decisions and reasons

- **Automatic checks:** main-process `desktop/sync.ts`, 15 seconds after each completed sweep by default; choices 15/30/60/120 or paused. Global 2.6-second pacer remains shared with foreground actions and OAuth renewal. Sweeps never overlap. No promise of instantaneous push: network/provider latency, mailbox count and rate pacing add delay.
- **Why polling:** [Zoho outgoing webhooks](https://www.zoho.com/mail/help/dev-platform/webhook.html) send HTTP events to a reachable receiver. A hosted relay adds infrastructure/cost and is unnecessary for this standalone app. Preserve the documented [30/minute limit](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html).
- **New-mail detection:** quiet initial baseline, source-scoped IDs, bounded in-memory seen set, no notifications for old moved/read messages, at most five pages/200 messages per catch-up. A large catch-up is reported as limited, with remaining history accessible in the mailbox. Reconnect resets the baseline. Disconnect/stop invalidates in-flight results. Any unexpected sync failure latches the profile; no repeated checks of a failed account.
- **Token renewal:** healthy connected sessions refresh once before expiry, through the same pacer, with a shared in-flight renewal promise. A rejected grant, 401/403/429 or uncertain result pauses that profile. Renewal is not a retry of failed authentication. Startup remains disconnected and no Windows login auto-start is installed.
- **Tray lifecycle:** close/minimize hide the window; persistent tray menu offers Open, Check now, Pause/resume checks, About and Exit. Explicit Exit flushes the active draft through an IPC handshake; operations in progress must finish. The renderer stays alive while hidden, so drafts and selections remain intact. Sleep suspends checks; resume restarts the scheduler without overlapping sweeps.
- **Windows notifications:** Electron native Notification with a tray-balloon fallback. First sync is silent; later new unread arrivals group by mailbox. Click opens the source account/message. Tray badge/tooltip indicates new arrivals since focus. Previews/sound are configurable; Windows Do Not Disturb may suppress alerts. Packaged normal launch creates/updates only Fluent Mail's Start Menu shortcut with stable AppUserModelID/ToastActivatorCLSID and a persistent icon, required for Windows notifications. Demo never registers this shortcut. Sources: [Electron notifications](https://www.electronjs.org/docs/latest/tutorial/notifications), [Tray](https://www.electronjs.org/docs/latest/api/tray), and the installed Electron 45.1.0 API declarations.
- **Connection UX:** successful connect/resume closes Settings, selects the connected mailbox and shows confirmation. Rejection keeps a focused error visible. Requests have a re-entrancy guard; no automatic re-submission of a grant code.
- **Rich editor:** local, open-source Tiptap 3 (`StarterKit`, `TextStyleKit`, `TextAlign`, `Placeholder`); no paid editor or hosted service. Supports formatting, fonts/sizes, color/highlight, lists/indentation, alignment, quotes, validated links, emoji and undo/redo. Recipient chips, optional Cc/Bcc, maximize, Ctrl+Enter review, attachment totals and missing-subject/attachment reminders improve daily composition. Sources: [React integration](https://tiptap.dev/docs/editor/getting-started/install/react), [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit), [TextStyleKit](https://tiptap.dev/docs/editor/extensions/functionality/text-style-kit).
- **HTML boundary:** the existing Zoho send/reply/draft APIs support `mailFormat: html`; scopes are unchanged. Paste/render sanitization uses DOMPurify; the main process independently sanitizes outbound HTML with sanitize-html. A shared small tag/style/link policy preserves ordinary formatting while removing scripts, forms, remote image beacons, unsafe URLs and arbitrary CSS. No invented inline-image upload behavior.
- **Compatibility:** preserve the encrypted v1.0 vault path and version. New preferences default safely when absent. Compose's optional `format` field preserves old plaintext drafts; opening them escapes/converts them to HTML. Old v1.0 executable remains available. All new tests use fixtures/--demo, never the saved real vault.
- **About/version:** package.json is the single version source (`src/version.ts`). About appears in-app, native Help menu and tray. Native executable copyright/author metadata also identifies Martin Miles / SafetyFluent.

### New source files / fixes / verification

Read `docs/PLAN-1.1.md`, CHANGELOG.md and the current test report. New key files: `desktop/sync.ts`, `desktop/html.ts`, `src/RichEditor.tsx`, `src/Recipients.tsx`, `src/htmlPolicy.ts`, `src/inboxUpdates.ts`, `src/draftFlush.ts`, `src/About.tsx`, `src/version.ts`.

Validation found a real editor integration bug: reflecting every HTML change back through React could reset selection and drop characters. The editor now owns typing/selection; content resets occur only for explicit external insertion (for example a signature). Tests type a complete message and verify its exact text and bold serialization. The v1.0 explicit-expiry test was intentionally replaced with healthy-renewal and rejected-renewal tests to reflect the new requested behavior. No safeguards against retries on rejection were removed.

Current automated result: **88 tests passing in 8 files**, clean type check, and zero reported dependency vulnerabilities. The isolated native smoke confirms version 1.1.0, renderer/preload/event bridge, absence of renderer Node, real Windows encryption, close-to-tray behavior, and the draft-flush Exit handshake. `Notification.isSupported()` is true on the build machine; actual production toast visibility still depends on Windows settings and has not been observed against real mail. Final package validation is recorded in docs/TEST-REPORT.md.

### Required precautions for future live testing

Do not launch the credential-bearing app for inspection. Use `--demo` for every assistant-run development/smoke session. For a separately approved connection-only live test, turn automatic checks off before connecting and explicitly disconnect afterward. Background validation needs an approved mailbox, bounded duration/check count and stop condition, with owner availability. Never treat a prior owner success, the UI's Connect action, an environment flag, or a test name as agent testing authorization. No new live account requests were made during v1.1 development.

Latest executable path to give the owner in full: **`C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.1.0-Windows-x64.exe`**. Exit the old process before launching the new build, then use the tray Exit action for v1.1. The sections below retain the original research and v1.0 history; where behavior differs, this v1.1 section takes precedence.

Final delivery: both unpacked and portable v1.1 Windows smoke tests passed, including hidden-to-tray and draft-flush Exit. Release source/documentation was committed as `f64fa85`. The owner then explicitly requested “run the exe”; the normal v1.1 executable was launched and its visible window's executable version was confirmed as 1.1.0.0. The assistant did not click Connect or perform live account testing. This launch authorization does not authorize future authentication tests. The demo development server was stopped.

## Objective and accepted scope

The owner dislikes Zoho's webmail interface and wants a standalone Windows client with a familiar mix of Outlook and Gmail conventions, without another mail subscription. They explicitly chose the documented-API approach, requested the `Zoho Mail` subdirectory, asked for careful planning and testing, and prohibited unnecessary complexity or invented unsupported features.

The owner subsequently made multi-mailbox support explicit: `info@safetyfluent.com`, `martin@safetyfluent.com`, and `martin@deloran.us` should coexist, even if the latter belongs to another business and another free Zoho organization. These are desired future connections, not testing accounts. Separate identities need separate OAuth authorizations. One authorization may return multiple mailbox accounts; aliases are not separate mailboxes.

The historical SafetyFluent setup in this conversation established three Zoho Mail Free users (`info`, `david`, `martin`) and a catch-all at `info`. Cloudflare MX/SPF/DKIM and domain verification were confirmed in Zoho on October 25. The unintended `david.jefferson` alias was removed, preserving `david`. That setup is background context only; this application development did not re-check or change those live settings. Credentials from the conversation must not be reused for app development/testing.

## Workspace and source control

- Workspace: `C:\Projects\SafetyFluent`.
- Application: `C:\Projects\SafetyFluent\Zoho Mail`.
- `Legacy/` contains the old project and its own Git repository. It is excluded from the new workspace repository and was not modified.
- The new workspace Git repository tracks root AGENTS.md/.gitignore plus the mail-client source and documentation. Generated packages, node_modules, test outputs and credential files are ignored. No remote publication is authorized or configured by this task.
- Root AGENTS.md directs future agents here. Nested AGENTS.md adds app-specific development rules. This is intentional so the context is found even when the session starts in the parent directory.

## Research conclusions — do not repeat the broad search

1. Zoho's free hosted-domain plan excludes standard IMAP/POP/ActiveSync. Installing Outlook does not remove that restriction. Changing the interface through the documented Mail API is a separate approach.
2. The [official MCP documentation](https://www.zoho.com/mail/help/mcp/getting-started.html) explicitly mentions free and paid accounts. The [Mail API guide](https://www.zoho.com/mail/help/api/getting-started-with-api.html) documents OAuth and regional endpoints. This is evidence for pursuing the integration, **not proof that the exact production free mailboxes have all required API entitlements**. That remains a live-validation blocker.
3. The [API index](https://www.zoho.com/mail/help/api/) includes core mail operations and a much wider administration/collaboration suite. Implemented endpoints, scopes, request casing and sources are recorded in [docs/API-COVERAGE.md](docs/API-COVERAGE.md). Read that file instead of searching again for every endpoint.
4. The [Self Client flow](https://www.zoho.com/developer/oauth/self-client/overview.html) suits owner-controlled mailbox connections: enter a Client ID/Secret and fresh grant code; exchange once; store a refresh token. No mailbox password, browser cookie scraping, private endpoint or SMTP login is needed.
5. The [published API policy](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html) specifies 30 requests/minute. A single application-wide pacer spaces requests by 2.6 seconds across profiles. We chose manual refresh rather than a background poller to limit traffic and comply with the owner's precautions.
6. Zoho IDs can exceed JavaScript's safe integer range, including numeric IDs returned without quotes. `json-bigint` preserves them as strings before normalization; URL/body routing never converts them to Number.
7. Reply uses `POST messages/{messageId}` with `action: reply`. Reply-all is recipient calculation, not a different endpoint. Forward is a new message with quoted text, not an invented API action. Reply-To is obtained from message headers. Reply drafts use RFC Message-ID/References, not numeric Zoho message IDs.
8. Uploads use the documented RAW attachment endpoint, then send the returned store descriptors. Plaintext messages, cloud draft copies and 1/2/4-hour scheduling presets are directly documented. The API docs did not justify inventing an overwrite-draft operation.
9. Earlier alternative research found free Cloudflare forwarding, conditional SMTP possibilities, iCloud+ if already subscribed, and a third-party API/IMAP bridge. The owner chose the direct API client instead. The bridge's one-way sync and missing outgoing attachments made it unsuitable as a finished solution. None of those alternative routes was implemented.

## Architecture and reasons

- **Electron + TypeScript + React/Vite.** Produces a standalone Windows app with one UI codebase and a testable local preview. No hosted backend, mail server, database server, subscription or auto-update service. Tradeoff: bundling Chromium makes the package larger than a native utility. The app is branded Fluent Mail, independent of Zoho.
- **Mailbox model:** profile (authorization/region) → account (mailbox returned by Zoho) → aliases. All routing, drafts and attachment handles are keyed by authorization and mailbox, never email domain alone. The synthetic fixtures intentionally collide account IDs across profiles to expose isolation bugs.
- **Unified Inbox:** up to the newest 40 messages from every connected Inbox, sorted together and tagged with the originating mailbox. Individual views provide full pagination, folders, labels and search. This bounded overview avoids eagerly crawling every mailbox. Search queries each connected mailbox. Actions are limited to one source mailbox at a time.
- **Sending identity:** Compose first selects the mailbox; From choices are only that mailbox's confirmed addresses. Replies automatically bind to the receiving mailbox and original message. No administrator-token impersonation of employee inboxes.
- **Desktop boundary:** typed, Zod-validated IPC commands; main-frame origin checks; renderer has no Node or token access; context isolation and sandbox enabled. Only bundled `fluent://app/` assets load in the renderer. External web links require native confirmation.
- **Mail rendering:** DOMPurify allowlist, sandboxed iframe with restrictive CSP, no remote images/scripts/forms/embedded frames or active inline links. Vetted links are exposed separately. Plain-text quotation preserves paragraphs, headings and list boundaries. Complex HTML design and inline-image rendering are intentionally not reproduced.
- **Storage:** a Windows-protected vault under `%APPDATA%\SafetyFluent\Fluent Mail\settings.vault` holds OAuth details, local drafts and submission state. No plaintext fallback. No automatic persistent cache of mailbox contents. Multiple local drafts are isolated by profile/account/draft ID; Compose can resume or create another.
- **Startup:** normal launch reads local metadata only and remains disconnected. Explicit Connect is needed on each launch and after token expiry. No timer refresh, background collector, tray startup or repeated authentication. Demo never calls the live service; browser preview is always demo-only.
- **Failure behavior:** rejected authentication, HTTP/API 401/403/429, server errors, unexpected bodies and unknown network outcomes pause the affected profile. Queued work checks the pause. No automatic retry. Error payloads are not echoed, as they may contain secrets or mail data.
- **Send safety:** explicit recipient/content review; a pending submission is persisted before the final POST. A pending or completed draft ID cannot be sent again, including after a restart. This deliberately favors avoiding duplicates over automatic recovery. Check Zoho Sent before deliberately creating another copy after uncertainty.
- **Attachments:** native file picker returns opaque, mailbox-scoped handles rather than accepting renderer-supplied filesystem paths. Upload only on send/cloud-save. Limit is 20 MB total upload and 30 MB download. Downloads use a native Save dialog; never auto-open files. Reattach files after restart.

## Source map

- `src/App.tsx`: inbox state, account/unified routing, actions, compose initiation and reply routing.
- `src/Composer.tsx`, `src/Settings.tsx`, `src/Modal.tsx`: composition, account setup, accessible dialogs.
- `src/shared.ts`: domain types, regional hosts, OAuth scopes, IPC schemas, address validation.
- `src/sanitize.ts`: safe reading documents and readable plain-text conversion.
- `src/demo.ts`: fictional offline provider, multiple mailboxes and independent profiles.
- `desktop/transport.ts`: paced OAuth/API transport, large-number parsing and stop conditions.
- `desktop/zoho.ts`: documented endpoint mapping and normalization.
- `desktop/service.ts`: mailbox authorization boundary, attachments, drafts and submission ledger.
- `desktop/vault.ts`: Windows-encrypted persistence; `desktop/main.ts`/`preload.ts`: Electron shell.
- `tests/`: transport, adapter, application-boundary, rendering-security and complete UI workflow tests.
- `docs/API-COVERAGE.md`: source-linked capability inventory and deliberate exclusions.
- `docs/TEST-REPORT.md`: final validation evidence and limits. `docs/screenshots/` contains synthetic mail only.

## Important implementation failures and resolutions

| Finding                                                                                    | Resolution and reason                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial packaged shell could not load; its network filter blocked its own file fetch       | The custom protocol now serves vetted local assets directly with `fs` and MIME types. Keep the network restrictions; do not loosen them to fix asset loading. |
| Initial smoke exited while renderer IPC was still starting                                 | Wait for actual message rows, verify preload and absence of renderer Node, guard destroyed windows, then exit.                                                |
| Dialogs lost typing focus when rerendered                                                  | Keep the close handler in a ref; install the focus trap once per modal mount. A regression test types a complete subject and checks focus.                    |
| JSON attachment content could be mistaken for a JSON API error                             | Successful attachment responses remain bytes; only recognized error envelopes trigger a stop.                                                                 |
| Long API IDs risked rounding                                                               | Parse before normalization with json-bigint; exact-ID tests cover values larger than 2^53.                                                                    |
| Multiple business accounts could collide on local IDs or reply identity                    | Namespace visible message IDs and drafts with profile/account; route each operation back to its source. Tests use an intentional collision.                   |
| A single saved draft slot would overwrite another reply                                    | Drafts now have independent IDs per mailbox and a resume/new chooser. Discard targets one local draft only.                                                   |
| Plain-text replies collapsed HTML list items                                               | A dedicated sanitized HTML-to-text conversion inserts block/list separators; regression-tested.                                                               |
| Newest jsdom required a newer Node patch than the installed Node 24.0.0                    | Pin jsdom 26.1.0 for the test environment. Production Electron is independent of the development Node runtime.                                                |
| Dependency audit reported a low esbuild advisory                                           | Upgrade the build-only esbuild dependency to the fixed current version. Audit subsequently reported zero vulnerabilities.                                     |
| Windows packaging occasionally could not rename its temporary extraction directory (EPERM) | Electron Builder's normal fallback copied the extracted files and completed. No unrelated directories were deleted or permissions changed.                    |

Electron 45.1.0 currently warns that synchronous safeStorage methods are deprecated. They work and passed an actual Windows encryption/decryption round trip. Before a future Electron major upgrade, migrate vault I/O deliberately to the async API and re-test; do not change encryption silently or add plaintext fallback.

Final preview cleanup exposed another development-only issue: Vite watched generated release HTML files and refreshed the demo during packaging. Generated release/dist/desktop-dist/test-results directories are now excluded from its watcher. This does not change the packaged runtime. The preview server was stopped after verification; no development server or live collector was left running.

## Validation and current production blocker

Final delivery validation on 2026-10-27: TypeScript and production build passed; **61 tests passed in 5 files**; full dependency audit reported **0 vulnerabilities**. Both the unpacked Windows application and the final portable executable passed isolated demo smoke tests (UI rendered, bridge ready, renderer Node absent, Windows encryption round trip successful). Final portable size is 112,188,737 bytes (~107 MiB). Artifact SHA-256 and detailed coverage are in the test report. Generated binaries are local build artifacts and are not committed to Git.

Offline implementation and packaging validation are recorded in `docs/TEST-REPORT.md`. Source tests cover exact API requests, large IDs, error envelopes, throttling, redirect rejection, uncertain sends, encrypted storage, account isolation, HTML attacks, sender selection, Reply-To, stale response races, drafts, search and mailbox actions. The Windows smoke uses only demo data and checks the renderer/preload boundary and real Windows encryption.

**No real Zoho OAuth/API connection, token refresh, private mail read, send or mailbox mutation was performed during development.** Browser-based setup from the earlier conversation is not evidence of API authentication. The live API entitlement and end-to-end mail flows remain unverified.

Before a future assistant-led live check, get explicit owner approval naming one mailbox, this Windows application/device, one bounded connection attempt and owner availability. Initial connect performs token exchange, account discovery, folder/label listing and one message page (five requests), with no mutation. Open a message only if included in the approved read scope. A test send needs separate exact recipient/content approval. Stop at the first unexplained rejection, challenge, rate limit, suspension or unknown result. No retries, alternate clients, cookie clearing, password resets or recovery actions. A UI confirmation or test flag is not a substitute for owner approval.

## Known scope limits / next decisions

- Free-plan API entitlement remains the only prerequisite not testable without live authorization. Different organizations may expose different permissions.
- Composition is plain text. Signatures are inserted as text. Original attachments are not automatically copied into forwards or edited cloud drafts.
- Saving to Zoho creates a **new cloud draft copy**; editing a server draft creates a new message while preserving the original.
- No offline mailbox cache, push sync, automatic background token refresh, contact/calendar integration, thread folding, permanent deletion, or administrator suite. These are deliberate scope boundaries, not claims that all such APIs are unavailable.
- The portable build is unsigned; no signing certificate or release-hosting service was supplied. Keep deployment local unless the owner asks to publish.
- The unified view is a bounded recent-mail overview; individual views retain paging for older mail.

## Resume checklist

### Setup clarification recorded 2026-10-28

The owner found “Fresh authorization code” unclear. It means the code created in **API Console → existing Self Client → Generate Code**, not Client Secret. The official [authorization-code flow](https://www.zoho.com/developer/oauth/self-client/authorization-code-flow.html) specifies: enter comma-separated scopes, select code expiry (default 3 minutes), provide a description, click CREATE; if prompted select the app/portal and click CREATE again. Copy the displayed code directly into Fluent Mail and connect within that expiry period. Fluent Mail performs the token exchange; the owner should not manually call token endpoints or paste credentials into chat. Future setup help should provide these exact navigation steps instead of merely saying “generate a fresh code.” No live authentication was attempted for this clarification.

The owner also requires the full executable path whenever delivering or identifying the executable: `C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.0.0-Windows-x64.exe`.

1. Read this file, then AGENTS.md and the current test report. Check Git status before editing.
2. Use the source map and API coverage record to answer known questions. Research only a material gap/change, and record the result here.
3. Run `npm ci` if needed; `npm run check`, `npm test`, `npm run build` for relevant changes. `npm run dev` is a loopback-only synthetic preview. `npm run demo` launches a separate offline desktop mode. `npm run smoke` is hidden, bounded and offline.
4. Build with `npm run package`; smoke-test the actual packaged executable with `--demo --smoke-test`. Use a new result filename to avoid mistaking stale output for success.
5. Document changes, failures, decisions and remaining uncertainty in this file and the test report, then commit source/documentation without secrets or generated binaries.
