# Changelog

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
