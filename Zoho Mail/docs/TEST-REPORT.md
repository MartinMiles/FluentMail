# Fluent Mail 1.2.0 validation — 2026-10-28

## Results

- **101 automated tests passed in 10 files.**
- TypeScript and production build passed.
- Full dependency audit: **0 vulnerabilities** reported.
- Unpacked and final portable Windows executables passed isolated `--demo --smoke-test` launches.
- No owner clipboard content, credential vault, live OAuth account, or private mailbox was used in these tests.

Executable:

```text
C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.2.0-Windows-x64.exe
```

Size: 113,540,442 bytes (about 108.3 MiB), unsigned Windows x64 portable package.

SHA-256:

```text
A0DFCDE809F82A54F3FA94F8DAA7E8005BA3AA446210A6F2353EE0D9CA9C6BC7
```

Final portable smoke returned:

```json
{
  "ok": true,
  "demo": true,
  "version": "1.2.0",
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

## Send flow

Pure timer tests establish no submission before 5000ms, exactly one submission after expiry, cancellation at 4999ms, and invalidation of an older timer. Full React workflows use the real five-second delay, verify no second confirmation step, and test successful sends and send failures through the mock backend. UI Cancel returns to an editable message with its contents preserved and no send call. Existing pending-send, failed-authentication, source-mailbox and draft-flush tests remain green.

The composer also cancels pending timers on close/unmount/Exit, and guards against late local-save completion arming a timer after closure. During countdown only local draft saving occurs; file uploads and Zoho submission start afterward.

## Clipboard and inline media

- Synthetic Unicode CF_HDROP file-list decoding, malformed data rejection, local-path restrictions and thumbnail/file precedence.
- Clipboard text is not read when enumerating media. Tests inject mock ClipboardItem/Blob values; they never query the owner's clipboard.
- UI paste inserts a fixture PNG image into the rich body, waits for paste completion, then attaches a fixture PDF file. Neither operation sends email.
- Opaque attachment-handle import prevents renderer-selected filesystem paths.
- PNG/JPEG/GIF/WebP signatures, remote-image rejection, size limits and deduplication.
- Exact API contract: `isInline=true`, returned URL restricted to the current region/account, corresponding HTML source replacement, and preservation of upload descriptors. No guessed CID.
- Outbound sanitization removes scripts, event handlers and unrelated remote images while keeping only the registered inline source.

During test adaptation, user-event with React fake timers stalled at click completion; the integration tests now use the real grace period while pure timer tests retain exact virtual-clock assertions. Tiptap inserts source-less separator img elements in its editing DOM; the paste assertion correctly targets `img[src]`. These separators are not serialized email images.

## Limits

External recipient rendering of Zoho's inline-upload URL has **not** been live-verified. The implementation follows the documented inline flag and returned URL contract; it does not claim a successful production send or particular external-client rendering result. Owner-reported v1.0 attachment delivery does not establish inline-image delivery.

Regular clipboard files are session attachment handles and need reattachment after restarting. Inline images persist locally in encrypted HTML drafts. Older executables should not edit these new image drafts, because their editors strip image content. The reader still blocks remote images.

Native clipboard formats and media were validated with fixtures, not live clipboard inspection. Windows notification support is detected, but OS toast visibility remains subject to Windows settings. The existing local renderer chunk-size advisory and synchronous safeStorage deprecation remain documented in PROJECT_CONTEXT.md.

Historical reports: [v1.1](TEST-REPORT-1.1.md), [v1.0](TEST-REPORT-1.0.md). Any future assistant-led live check still requires a named account/client, bounded scope and owner availability under the standing safeguards.
