# Fluent Mail 1.7.0 validation

228 tests pass in 19 files. TypeScript and production build pass. Dependency audit reports zero vulnerabilities. Automated tests and UI preview use synthetic mail and injected provider responses; no live Zoho authentication, mail sending, DNS or subscription changes were performed.

The audit and fixes are documented in [REVIEW-1.7.md](REVIEW-1.7.md). Regression cases include late failures/token responses after Forget, stale polling after reconnect, queued access expiry before first dispatch, zero-dispatch send ledgers, draft clearing/migration/write failure, attachment ownership/actual size/preflight/restoration/cleanup, recipient editing, link-editor Enter/Escape, pending-media exit protection, signature countdown locking, mailbox routing, notification folder selection, timestamps, bulk selection cleanup, malformed provider lists and streamed download bounds.

The browser preview uses the same renderer as the Windows package. Visual checks confirmed conversation context, two separately committed recipient chips, rich-text composition, a sample attachment and saved-draft feedback. Screenshots in docs/screenshots/1.7 contain fictional example.test messages only. The existing real client was left running and was not used for testing.

Final executable path: C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.7.0-Windows-x64.exe.

Final unpacked and portable smoke checks passed for version 1.7.0: rendering, custom protocol, IPC/events bridge, renderer Node isolation, Windows encryption round trip, close-to-tray and draft-flush Exit. The final portable is 113750763 bytes with SHA-256 3a671576aa865bb08f898f2abf3e70bf2fcb821d6a7c461a96754c4c17cfbb81. Publication and public-download verification are in progress. Source and release publishing use the established contribution-fork PR and owner-browser workflow; real settings, credentials, mail, contact history and private diagnostics remain excluded.
