# Fluent Mail 1.3.0 validation — 2026-10-28

## Automated results

- 130 tests passed in 13 files; TypeScript and production build passed.
- Full dependency audit: zero reported vulnerabilities (dependencies unchanged after the audit).
- Both unpacked and final portable Windows executables passed isolated --demo --smoke-test runs for version 1.3.0.
- Smoke checks: UI rendered, bridge/events ready, renderer Node absent, Windows protected-storage round trip, close-to-tray residency and draft-flush Exit handshake.
- No live credentials or private mail were used in automated tests. Live investigations below were separate owner-authorized actions.

## Executable

Full path: C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.3.0-Windows-x64.exe

Size: 113539032 bytes. SHA-256: B11AB057388E92AA519CDE5E736E1CBD56ACBEA67A9DB2B01B6BD491AB98BE5C.

Unsigned Windows x64 portable package. Exit any older running version through its tray Exit before starting this executable, then check About for 1.3.0. Existing encrypted accounts/drafts are retained; normal startup remains disconnected.

## Feature verification

Recipient suggestions: two-character prefix, case-insensitive matches, keyboard/mouse selection, multiple recipients, deduplication and bounded history; encrypted persistence, profile/mailbox isolation, Forget cleanup, successful-send-only recording, bounded Sent import and fresh import after explicit reconnect.

Send: exact five-second grace period, cancel at the last millisecond, Send now exactly once, old-timer invalidation, draft preservation and existing uncertain-send ledger. Full UI workflows cover accepted sends, failures, cancellation and pasted-image serialization.

Inbox: Del-to-Trash on selected/checked messages, no interception in search/editor fields, source mailbox routing in unified view, and single-line rows without previews/metadata. Persisted rejection is visible on the selected mailbox; a paused profile cancels stale loading while another connected profile remains usable.

Security: regional inline-upload URL checks reject foreign hosts, HTTP, credentials and wrong paths; historical internal account-ID equality assumption removed. Production inline-image sending is blocked before any upload/submission because delivery tests failed. The local image draft is retained, with a clear error and no automatic file-attachment fallback.

## Separate live evidence and limits

The owner-approved Martin connection diagnostic succeeded through refresh, account discovery, folders, labels and one Inbox listing. The encrypted vault hash was unchanged. This demonstrates working access at that time; it does not establish the cause of the historical v1.2 API 400 whose provider payload was discarded.

The owner identified one failing image message. Two earlier lookups using a misidentified subject stopped before opening any email. A separately approved corrected lookup inspected only the selected message's original MIME and found no image elements or parts. A Sent-filter bug was found and corrected during this work.

Synthetic delivery probes established that relative/absolute upload-preview URLs plus ordinary descriptors produce ordinary attachments, body-reference-only HTML leaves private URLs, direct data URI HTML does not create MIME inline parts, and filename/path CID references remain unmatched. The owner confirmed attachment-only delivery for the first probe. A Gmail browser check confirmed broken-image placeholders for the direct-data-URI test. One experimental descriptor-flag submission has an unconfirmed outcome because its initial one-off error reporter omitted detail; it was not resent. Another guessed association field was rejected HTTP/API 404. Neither guessed field is shipped.

Inline images are therefore NOT fixed and are not advertised as working. See INLINE-IMAGES.md for evidence, supported-contract requirements and next work. No production email content, MIME, tokens, IDs, recipient history or settings files are in this report or source control.

The owner subsequently gave standing authorization for routine Fluent Mail account access and email testing, including when absent. Root/app AGENTS.md and PROJECT_CONTEXT.md record that override. All one-off experiment code/results remain under ignored test-results. No account recovery, password reset, subscription change or security bypass was performed.

Prior evidence is archived in TEST-REPORT-1.2.md and TEST-REPORT-1.1.md.
