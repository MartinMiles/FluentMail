# Fluent Mail 1.1.0 — validation report

Date: 2026-10-28 (America/Los_Angeles). All assistant-run application tests used synthetic mail, injected responses, or isolated `--demo` launches. The owner's saved credential vault was not opened for testing. No live OAuth request, token renewal, private mail read, send, DNS change or account mutation was performed by the assistant.

Separately, the owner reported that v1.0 connected successfully and delivered a message with an attachment to an external mailbox. That supports the original connection/send path for the tested account; it does not establish production behavior for every new v1.1 feature. The original report is preserved in [TEST-REPORT-1.0.md](TEST-REPORT-1.0.md).

## Results

| Check                                   | Result                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TypeScript                              | Passed                                                                                                   |
| Automated suite                         | **88 tests passed in 8 files**                                                                           |
| Production build                        | Passed                                                                                                   |
| Full dependency audit                   | **0 vulnerabilities reported**                                                                           |
| Isolated development Electron smoke     | Passed                                                                                                   |
| Unpacked Windows executable smoke       | Passed                                                                                                   |
| Final portable Windows executable smoke | **Passed**                                                                                               |
| Shared renderer visual review           | Passed for rich editor, account selector, notification/check settings, automatic arrival merge and About |

Final executable:

```text
C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.1.0-Windows-x64.exe
```

Size: **113,530,401 bytes** (about 108.3 MiB). Windows x64, unsigned, portable. SHA-256:

```text
0D7948EC4A8A92B4A5DCD2F700928CC5EC2EF21E9CE3DE3700F434AE0CAC602E
```

Both packaged smoke launches returned:

```json
{
  "ok": true,
  "demo": true,
  "version": "1.1.0",
  "loaded": true,
  "protectedRoundtrip": true,
  "hiddenToTray": true,
  "notificationSupported": true,
  "nodeExposed": false,
  "bridgeReady": true,
  "eventsReady": true,
  "rendered": true,
  "quitFlushed": true
}
```

The smoke closes the actual Electron window, verifies that it remains alive/hidden with a tray icon, then requests explicit Exit and waits for the renderer's draft-save acknowledgment before quitting. Windows encryption uses a synthetic string. No real account transport is constructed in demo mode.

## New coverage

- **Connection feedback:** successful connection closes Settings and selects the mailbox; failure keeps a focused error visible and is not retried.
- **Polling:** quiet baseline, new unread arrivals, duplicate suppression, old/read-message suppression, multiple profiles, collision isolation, one sweep at a time, bounded catch-up, configured intervals, paused checks/manual check, stop/disconnect cancellation, fresh baseline after reconnect, and failure latching.
- **OAuth:** a healthy expiring session renews once across concurrent requests; failed renewal stops without retrying either authentication or mail requests. Startup remains disconnected.
- **Live-view events:** new arrivals merge into the unified Inbox while the current message and open composer remain intact. Reply and action source identity remain isolated.
- **Rich editing:** exact typed characters, bold HTML serialization, safe links, paste sanitation, old plaintext conversion, outgoing HTML format and main-process sanitizer. Existing reply/draft/threading/attachment contracts remain covered.
- **Exit:** an active rich draft is flushed before the Exit acknowledgment. Other local drafts are preserved.
- **Compatibility:** old v1.0 vaults without preferences load with defaults and do not reconnect.
- **About:** running package version, Martin Miles, SafetyFluent and martin@safetyfluent.com are displayed.

The v1.0 contracts/security tests also continue to cover large IDs, request construction, recipient validation, unauthorized From values, attachment isolation, pending-send protection, encrypted storage, sandboxed email HTML, stale body responses, folders/labels, search and Trash/restore.

## Important failures and fixes

1. Reflecting each editor update back through a controlled React value reset selection and dropped characters. Tiptap now owns keystrokes/selection; only deliberate external content changes reset the document. Regression tests assert exact text and formatted serialization.
2. Old tests expected plaintext textarea values and manual token expiration. They were updated to assert recipient chips/rich content and the newly requested healthy token-renewal behavior; rejection/no-retry tests remain in force.
3. Unexpected sync failures could otherwise repeat even if an adapter had not updated connection status. The sync engine now latches failed profiles and the service persists the pause. Explicit reconnection is required.
4. In-flight sync results could arrive after stop/disconnect/reconnect. Epoch invalidation now drops them and prevents subsequent mailbox reads in that sweep.
5. Closing a tray-resident app while a debounce was pending could lose the final edit. Explicit Exit now uses a draft-flush handshake, with a visible stay/exit choice if the renderer cannot acknowledge saving.

## Visual evidence

Only fictional `example.test` mail appears in the previews. About contains the creator information explicitly supplied by the owner.

- [Rich composer](screenshots/1.1/rich-compose.jpg)
- [Incoming mail while the original message stays open](screenshots/1.1/incoming.jpg)
- [Automatic check and notification settings](screenshots/1.1/settings.jpg)
- [About/version/creator](screenshots/1.1/about.jpg)

A browser automation keystroke sequence timed out partway through input; the tool reported an input-dispatch timeout. The incomplete fixture text was inspected and replaced explicitly. This was distinct from the editor integration bug above. Exact-character typing passes automated editor tests, and rich formatting/list behavior was also inspected through the browser UI.

## Limits of validation

- New live polling, healthy production token renewal, rich HTML delivery and native notifications for actual mail were not tested against owner accounts.
- `Notification.isSupported()` passed; it does not prove that Windows will display every toast. Do Not Disturb, notification permissions and platform policy can suppress them. Native test-notification and tray-balloon fallback paths are available for owner verification.
- Polling is not instant push. Default interval is 15 seconds after a completed sweep, plus request pacing/provider latency. Very large catch-up batches are bounded at 200 messages per sweep and marked as limited.
- The package is unsigned. It has not been exercised on other machines or Windows versions.
- The local renderer bundle is approximately 830 KB and triggers Vite's 500 KB advisory. It loads from the packaged filesystem; no hosted editor or network code-loading was introduced. Electron's existing synchronous safeStorage deprecation notice remains tracked in PROJECT_CONTEXT.md.

Future assistant-led live tests require the owner's named-account/client approval and bounded scope. Disable automatic checks for a connection-only test. Background tests need an explicit duration/check count and stop conditions. A successful offline smoke is not production authentication evidence.
