# Changelog

## 1.7.0 — 2026-10-28

- Prevent late mailbox failures/token responses from restoring credentials after Forget; cancel stale transport sessions without saving their old state.

- Fix cleared/legacy drafts, serialize local writes, and preserve prior settings when protected storage fails.
- Validate actual attachment ownership/size and all files before upload; reject oversized selections early, flag restored files needing reattachment, and release unused handles.
- Prevent reconnect/disconnect/forget from interrupting submissions. Ignore obsolete polling failures and renew healthy queued sessions before dispatch without retrying mail operations.
- Preserve the uncertain-send guard while allowing correction of operations proven never submitted.
- Repair recipient chip entry and link-editor keyboard behavior; lock signature changes during countdown and protect exit during pending media operations.
- Bind messages, replies, notifications and check times to their source mailbox; clear completed bulk selections and normalize invalid dates.
- Bound streamed downloads, validate provider identifiers, allow legitimate dotted query values and avoid unnecessary metadata requests for blocked remote images.
- Memoize safe reading content and add File → Exit Fluent Mail / Ctrl+Shift+Q using the existing draft-flush safeguard.
- Document the code and UX audit in docs/REVIEW-1.7.md.

## 1.6.0 — 2026-10-28

- Make conversation chronology explicit: newest first by default, a remembered oldest-first option, independent Latest/Earlier/Unread labels, meaningful timestamps and chronological sequence numbers when full history is available.
- Add a sticky reading context, Go to latest and Collapse earlier messages. Reversing order retains cached bodies and the current reply target without provider requests.
- Open the latest cross-folder reply initially and preserve an earlier message being read when new replies arrive. Request summary pages explicitly by descending date.
- Prefer per-message provider metadata over the list row's aggregate state, so an earlier unread message does not incorrectly make the latest card unread.
- Document comparative research across Gmail, Outlook, Zoho, Apple Mail, Thunderbird, Fastmail and Proton Mail. Add public screenshots containing only fictional mail.

## 1.5.0 ? 2026-10-28

- Display received embedded raster images through authenticated, message-scoped Zoho downloads. Match MIME CIDs to provider metadata and show images inside the sandbox; remote tracking images remain blocked.
- Add conversation rows with circular message counts and chronological, expandable original/reply cards spanning Inbox and Sent. Load older history explicitly and reply/forward from the chosen message.
- Preserve mailbox isolation and row selection as replies arrive. Fetch expanded bodies lazily, deduplicate image downloads, bound image memory and show unsupported-image warnings.
- Owner reports v1.4 SMTP inline delivery to Gmail succeeded; receiving images and conversation display were separate missing client features.

## 1.4.0 — 2026-10-28

- Add owner-approved Zoho SMTP sending for messages with pasted images, retaining API receiving and ordinary API sends. Generate standard matching inline CID/MIME parts exactly once, without public hosting or duplicate ordinary image files.
- Add per-mailbox encrypted SMTP/app-password setup and explicit connection verification. Snapshots contain status only; source-mailbox changes clear password inputs. Standard/pro server selection does not change the subscription.
- Fixed TLS 465 with certificate/SNI checks, no automatic retry or pooling. SMTP failures are isolated from API receiving; uncertain sends remain protected by the persistent submission ledger.
- Preserve aliases, Bcc privacy and RFC reply threading; record accepted recipients only and report partial delivery or post-acceptance local cleanup failures honestly.
- Lock edits during draft preparation. Inline-image scheduling/cloud-copy controls explain the supported local-draft/send-now behavior. Remove unsupported ghost image nodes from quoted replies.
- Retain all v1.3 recipient suggestions, Send now, Del-to-Trash, compact rows and account-state fixes. Live SMTP sign-in requires the actual mailbox/app password; offline MIME validation alone does not establish account eligibility.

## 1.3.0 — 2026-10-28

- Suggest previously emailed recipients after two characters, with mailbox-scoped encrypted history, keyboard/mouse selection and a bounded recent-Sent seed.
- Add Send now to the left of Cancel in the five-second countdown; submit exactly once.
- Delete selected messages with Del, including checked rows and unified inbox routing; keep text editing shortcuts intact.
- Use single-line message rows without preview/metadata lines; show recipients in Sent.
- Show persisted account pauses and the failed operation, clear stale loading on mailbox switches, and isolate other connected accounts. Reconnection invalidates the previous client's queued work and refreshes recipient history.
- Correct Sent listing's independent exclusion flag and the unsupported inline-upload account-ID equality assumption.
- **Inline delivery remains unresolved:** live tests did not produce working MIME inline images. Retain pasted images in local drafts and block live send/cloud-save before upload, with an explicit error. Do not silently convert them to ordinary attachments. See docs/INLINE-IMAGES.md.
- Strengthen source-control exclusions for protected settings/backups, private recipient history and diagnostic outputs. Record the owner's standing project authorization in AGENTS.md and PROJECT_CONTEXT.md.

## 1.2.0 — 2026-10-28

- Replace the second send-confirmation step with one Send click and a five-second cancellation countdown. Cancel returns to editing; close/Exit also cancels pending submission and keeps the draft. Uploads start only after the grace period.
- Paste screenshots/raster images into the WYSIWYG body and copied Windows Explorer files as attachments. Preserve normal text/HTML paste, enforce local paths/size limits, and avoid reading clipboard text when looking for media.
- Keep pasted inline images local in the encrypted draft. Validate raster signatures, upload with Zoho's documented inline flag, and use the returned account/region-validated image URL in outgoing HTML. No guessed CID scheme. External inline rendering remains unverified.
- Keep prior executable versions and the existing encrypted account store. Add cancellation/timing, clipboard format/import, HTML source rewriting and complete UI tests.

## 1.1.0 — 2026-10-28

- Successful connection closes Settings, selects the new mailbox, and shows confirmation. Failed connections keep a focused validation message visible; no automatic retry.
- Automatic Inbox checks, default 15-second interval after each sweep, with 15/30/60/120-second controls. All accounts share the global rate limiter. Initial mail loads are quiet; new arrivals are deduplicated per mailbox.
- Inbox updates preserve the selected message and open composer. New-mail notifications restore the originating mailbox. Tray icon indicates arrivals while the window is hidden.
- Closing/minimizing hides to the Windows system tray. Right-click → Exit Fluent Mail explicitly saves the active draft and quits. Tray menu also offers Open, Check now, Pause/resume checks, and About.
- Healthy connected sessions renew OAuth access without hourly manual reconnection. Failure still pauses the affected account; no retry loop or automatic startup login.
- WYSIWYG HTML composition: bold, italic, underline, strikethrough, fonts/sizes, color/highlight, bullet/numbered lists, alignment, quotes, links, emoji, undo/redo and clear formatting. Rich signatures and quoted replies retain supported formatting.
- Recipient chips, optional Cc/Bcc, maximize/restore composer, Ctrl+Enter review, empty-subject/attachment reminders, and attachment totals.
- Sanitize pasted and outgoing HTML. Preserve v1.0 encrypted profiles and plain-text drafts. Images are attached as files; inline image uploads are not fabricated.
- About in the app, Help menu and tray, with package version and creator **Martin Miles · SafetyFluent · martin@safetyfluent.com**.
- Owner reported v1.0 connection and external attachment-delivery success. v1.1 development tests remain offline.

## 1.0.0 — 2026-10-27

Initial standalone Windows client: multi-account/unified inbox, OAuth Self Client connections, folders/labels/search, safe reader, plain-text compose/reply, attachments, encrypted local drafts, and isolated demo mode. See `docs/TEST-REPORT-1.0.md` for the original validation record.
