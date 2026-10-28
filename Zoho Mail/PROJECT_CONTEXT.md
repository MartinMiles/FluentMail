# Fluent Mail — persistent project context

**Read this file first every time this project is resumed.** Required by the owner on 2026-10-27 and enforced by both workspace and project AGENTS.md files. Keep this file in ordinary source control. Update it with material decisions, evidence, blockers, resolutions and reasons. Never put secrets, private messages, tokens, cookies, phone numbers or unrelated account information here.

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

1. Read this file, then AGENTS.md and the current test report. Check Git status before editing.
2. Use the source map and API coverage record to answer known questions. Research only a material gap/change, and record the result here.
3. Run `npm ci` if needed; `npm run check`, `npm test`, `npm run build` for relevant changes. `npm run dev` is a loopback-only synthetic preview. `npm run demo` launches a separate offline desktop mode. `npm run smoke` is hidden, bounded and offline.
4. Build with `npm run package`; smoke-test the actual packaged executable with `--demo --smoke-test`. Use a new result filename to avoid mistaking stale output for success.
5. Document changes, failures, decisions and remaining uncertainty in this file and the test report, then commit source/documentation without secrets or generated binaries.
