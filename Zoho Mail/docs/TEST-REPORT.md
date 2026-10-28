# Validation report

Date: 2026-10-27 (America/Los_Angeles). All application testing used synthetic data and mocked API responses. Public documentation was researched separately. No production OAuth exchange, token refresh, private mailbox read, outgoing email, DNS change or account mutation occurred during application development.

## Automated checks

| Check                                                                   | Result                                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`npm run check`)                                            | Passed                                                                                                                 |
| Vitest (`npm test`)                                                     | **61 tests passed in 5 files**                                                                                         |
| Production renderer and desktop bundle (`npm run build`)                | Passed                                                                                                                 |
| Dependency audit (`npm audit`, development and production dependencies) | **0 vulnerabilities reported**                                                                                         |
| Development Electron smoke (`--demo --smoke-test`)                      | Passed                                                                                                                 |
| Packaged `win-unpacked/Fluent Mail.exe` smoke                           | Passed                                                                                                                 |
| Final portable executable smoke                                         | **Passed** — the delivered portable `.exe` extracted, rendered the demo, passed isolation/encryption checks and exited |

The Windows smoke result confirmed `demo=true`, `loaded=true`, `rendered=true`, `bridgeReady=true`, `nodeExposed=false`, and `protectedRoundtrip=true`. The last field is a real Windows safeStorage encryption/decryption round trip using an offline fixture string. Tests do not load a real credential vault or create a live Zoho transport in demo mode.

Final artifact: `release/Fluent-Mail-1.0.0-Windows-x64.exe`, 112,188,737 bytes (approximately 107 MiB), unsigned Windows x64 portable build. SHA-256: `51470834D4F410EFD0EA95A5051F394E25DFD67647667234EA4D6F784FD348F3`.

## What was exercised

- Exact long-ID preservation beyond JavaScript integer precision; JSON envelope parsing and numeric/text read/flag normalization.
- Regional hosts, headers and paths; 1-based pagination; encoded search syntax; inclusion/exclusion of archived messages; recent-search timestamp.
- Explicit OAuth code exchange with mocked responses; no startup request; no automatic refresh after expiration; account identity mismatch behavior.
- HTTP/API authentication denial, permission rejection, 429 throttling, server/HTML responses, network uncertainty, and queued request cancellation. No retry after a blocked connection.
- Conservative request pacing below the published limit.
- Send review, recipient validation, From authorization and header-injection rejection.
- Pending-send persistence across restart; repeated sends refused; local drafts retained after failure.
- Scoped opaque attachment handles; RAW upload descriptors; binary JSON downloads; no arbitrary renderer-selected filesystem paths.
- Vault behavior with a test cipher: encrypted persistence, no plaintext fallback, profile/mailbox isolation, multiple drafts and targeted removal. Real Windows encryption separately tested by desktop smoke.
- Sender/source isolation for multiple mailboxes and independent profiles with deliberately colliding account IDs.
- Unified Inbox replies use the original authorization and mailbox; new compose explicitly selects the sending account.
- Reply-To handling, reply-all recipient construction, RFC threading headers for saved reply drafts.
- Stale message-body response ignored after switching mailboxes.
- Complete React UI workflows: compose/send, send failure, reply, search/empty results, account switching, Trash and restore, folder/label creation, typing focus, and local drafts.
- Malicious message HTML: scripts, event handlers, frames, forms, styles, image pixels and unsafe links removed. Paragraph/list boundaries preserved in quoted plain text.

## Visual checks

The actual React interface was inspected through the loopback-only browser demo. Verified the three-pane layout, reading view, attachments, unified Inbox, account badges, source-specific reply composer, corrected quote formatting, and light/dark appearances. Captures contain fictional example.test mail only:

- [Inbox, light theme](screenshots/inbox-light.jpg)
- [Unified Inbox, dark theme](screenshots/unified-dark.jpg)
- [Reply composer](screenshots/compose.jpg)

Screenshots validate the shared renderer, not live Zoho operation. Packaged desktop smoke validates that the same renderer loads through Electron's custom protocol and preload.

## Failures fixed during validation

1. Dialog focus reset on each rerender interrupted typing. Fixed effect lifetime with a current callback ref; typing regression test added.
2. The desktop network policy blocked its own custom-protocol asset loading through `net.fetch(file:)`. Assets now come directly from vetted local files; remote-request blocking remains enabled.
3. Smoke exited before renderer startup IPC finished. It now waits for message rows and ignores IPC from destroyed windows.
4. An attachment containing JSON was misclassified as a provider envelope. Successful attachment payloads are now bytes unless they match a recognized API error envelope.
5. A single local draft slot could overwrite another draft. Draft IDs now persist separately, with a resume/new chooser and targeted discard.
6. HTML-to-plain-text quotation collapsed list boundaries. Added a safe block-aware conversion and regression test.
7. Initial jsdom engine requirements exceeded installed Node 24.0.0. The test dependency is pinned to compatible jsdom 26.1.0.
8. A low-severity build-tool advisory was removed by updating esbuild. Final audit is clean.
9. Electron Builder hit a temporary-directory rename EPERM during extraction. Its built-in copy fallback completed; no unrelated paths or permissions were changed.

## Not established by these tests

- API entitlement or response compatibility for the owner's specific free Zoho accounts.
- Live OAuth authorization, renewal, private-message retrieval, attachment delivery, scheduling, and actual send/receive outcomes.
- Other Windows versions/devices, enterprise endpoint policies, signing reputation, or unattended installation.
- Production performance with large mailboxes. Paging is bounded, the unified view is a recent-mail overview, and requests are paced conservatively.

The first live check needs the owner's explicit bounded approval under PLAN.md and PROJECT_CONTEXT.md. Offline tests and a successful executable launch do not substitute for that approval or prove account access.
