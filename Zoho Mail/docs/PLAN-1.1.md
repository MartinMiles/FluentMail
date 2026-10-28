# Fluent Mail 1.1 implementation plan — 2026-10-28

## Owner feedback and authorization

The owner reports that v1.0 connected to a real mailbox and successfully delivered an email with an attachment to an external mailbox. These are owner-reported successes, not assistant-observed tests. The remaining API operations are not thereby verified.

Requested changes: clear connection success/failure feedback; automatic incoming mail checks and Windows notifications while minimized; closing the window keeps the app in the system tray; explicit tray Exit; a Gmail-style WYSIWYG editor and familiar mail UX; About with version, creator Martin Miles, SafetyFluent, martin@safetyfluent.com.

The request authorizes implementing background checks and normal OAuth renewal while an account is connected. It supersedes v1.0's manual-refresh/session-expiry design for normal application use. It does **not** authorize assistant-led live authentication or testing against saved accounts. All development launches/tests use --demo or injected fixtures, with a separate data directory. Do not open or export the owner's credential vault.

## Decisions

1. Main-process polling, default 15 seconds after the previous sweep completes. Options: 15/30/60/120 seconds or paused. Share the existing 2.6-second global request pacer; never overlap sweeps. Actual delivery latency includes Zoho availability, request pacing, and number of mailboxes. No promise of instantaneous push.
2. [Zoho outgoing webhooks](https://www.zoho.com/mail/help/dev-platform/webhook.html) need a reachable external receiver and separate configuration. A hosted relay would add infrastructure and potential cost, so it is outside this standalone release. [Published API limit](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html): 30/minute.
3. Initial snapshot establishes a silent baseline. Subsequent previously unseen, newly received unread messages trigger one grouped notification per mailbox. IDs are scoped by authorization/mailbox, bounded in memory, and deduplicated. Check multiple pages only when necessary, with a bounded catch-up limit. Reconnecting establishes a fresh baseline instead of notifying about old mail.
4. Healthy connected sessions renew expiring OAuth tokens once, through the shared pacer. Authentication rejection, 429, unexpected response or unknown network result pauses the profile, cancels queued checks and never triggers automatic retries. Startup stays disconnected; the owner explicitly connects saved accounts. Tray residency preserves that connected session without repeated login.
5. UI receives events with refreshed Inbox snapshots; it merges them without resetting selection or a composer. Notification click restores the app and navigates to the correct source mailbox/message. Windows notification settings may suppress native toasts; provide a local test notification and tray fallback. No remote notification service.
6. Close/minimize hides to a persistent tray icon. Tray offers Open, Check now, Pause/resume automatic checks, About, Exit. Explicit Exit flushes the active draft; pending sends/connections finish first. No loss of edits from the 600ms autosave debounce. Shutdown/logoff is not blocked.
7. Use Tiptap's open-source editor with local extensions: formatting, fonts/sizes, color/highlight, lists, alignment, quotes, links, undo/redo, clear formatting, keyboard shortcuts. No cloud editor/service. HTML is sanitized both at paste/editor boundaries and in the main process before API submission. Zoho already documents mailFormat=html for send/reply/draft; no new scopes required. Preserve v1.0 plaintext drafts with a backward-compatible optional format field.
8. Keep the working source-scoped mail model, secure attachment handles and duplicate-send ledger. Improve composer with recipient chips, optional Cc/Bcc, attachment total, subject/attachment reminders, a maximize option and Ctrl+Enter review. Inline image upload is not invented; attachments remain ordinary file attachments.
9. Version comes from package.json (1.1.0). About exists in-app, native Help menu and tray; creator identity is exactly owner-supplied. Keep v1.0 executable available. Reuse the existing encrypted credential/draft location without reading it during development.

## Validation

- Unit/contract: polling baseline, notification deduplication, multiple profiles, no overlapping sweeps, pause/disconnect/quit, catch-up bounds, OAuth renewal serialization/failure, migration of old drafts/preferences, safe rich HTML, exact HTML API payloads.
- UI: successful connection closes modal and selects mailbox; failure stays visible; automatic refresh preserves selected message and draft; rich formatting/paste/link/recipient validation; About version/creator.
- Native isolated smoke: renderer and encryption, tray close/restore/explicit exit lifecycle, main-process event delivery, synthetic notification support. No real account activity. Portable build smoke after packaging.
- Update README, API coverage, test report, changelog and PROJECT_CONTEXT; commit normal source/documentation. Always deliver the full .exe path.
