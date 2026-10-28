# Fluent Mail — implementation plan

This is the historical v1.0 plan. The owner's 2026-10-28 request supersedes manual-refresh/plain-text-only/tray-exit decisions for v1.1; read `docs/PLAN-1.1.md` and the current `PROJECT_CONTEXT.md` first. Development/testing still must stay offline unless separately authorized.

Standalone Windows mail client for Zoho Mail. Requested 2026-10-27.

## Decisions

- Electron desktop shell, TypeScript, React; no hosted service, database server, or subscription. A portable Windows executable and an unpacked application will be produced.
- Familiar three-pane inbox: account/folder navigation, messages, reading pane. Plain-text compose with To/Cc/Bcc, reply/reply-all/forward, attachments, cloud draft copies, and documented delayed-send presets.
- Zoho remains the mail store and delivery service. Existing domain, catch-all, mailboxes and DNS are untouched.
- Every account uses its own OAuth authorization. Knowing an administrator account does not imply permission to read other people's mailboxes.
- Scope is a mail client, not a reproduction of the Zoho admin suite. The API coverage map explains included and deliberately excluded families. No unsupported feature buttons.

## Stages / acceptance criteria

1. Read the official API index and endpoint contracts; document capabilities, authentication and limits.
2. Implement a typed transport, exact-ID JSON parsing, request pacing, account isolation, error handling, protected credentials, and a fully isolated demo backend.
3. Implement the inbox, safe message rendering, compose, folder/label actions and settings. Preserve drafts on failure; never automatically resend.
4. Offline tests: exact API requests, malformed responses, large IDs, rate limits, authentication rejection, duplicate-send prevention, attachments, HTML safety, state races and UI interactions.
5. Build and smoke-test the Windows package in isolated demo mode. Visually inspect the same renderer through a loopback-only demo preview. Report actual results and remaining live verification honestly.

## Account-affecting work plan

Affected service: Zoho Mail; eventual accounts chosen by the owner (info, david, martin). Development, preview and automated tests use synthetic example.test addresses only. No saved cookies, passwords or browser profiles are used. No Zoho API authentication or live mail action is authorized by the implementation request.

Default startup is disconnected. Demo mode is a different data directory and has no live transport. Saved accounts do not start collectors or connect at launch. Live sessions require an explicit Connect action. An authentication failure, unexpected response, rate limit, or ambiguous network result stops that connection and persists a pause. There is no automatic retry or automatic reconnect. Explicitly resume only after reviewing the failure; security restrictions require owner-confirmed recovery.

Potential live effects: OAuth access grant; reading private mail; changing read state, folders or labels; uploading attachments; saving cloud drafts; sending mail. Sending is irreversible; all send operations require a concrete recipient/content review in the application. Destructive permanent deletion is excluded; Trash moves are reversible. No SMTP/IMAP login testing.

Future live verification requires owner approval identifying one account, this Windows application/device, one bounded connection attempt and owner availability. Start read-only. Sending a test message requires separate specific recipient/content authorization. Stop on the first challenge/rejection/unexplained result and preserve only redacted diagnostics.

## Constraints

API availability on this particular free organization remains unverified until approved live verification. Offline tests establish implementation behavior, not production entitlement or email delivery. The unsigned Electron package includes its runtime, so it is larger than a native single-binary utility. Avoid claiming that it is a tiny download.

## Execution result

All five implementation/offline-validation stages completed. Multi-authorization unified Inbox and source-scoped replies were added following owner steering. Multiple local drafts and safe plain-text quotation were added after validation found potential data loss/readability issues. Final checks: 61 passing tests, clean type check/build/audit, and successful unpacked plus portable Windows smoke tests. See docs/TEST-REPORT.md for evidence, and PROJECT_CONTEXT.md for decisions and fixes. Live API validation remains a separately authorized future step.
