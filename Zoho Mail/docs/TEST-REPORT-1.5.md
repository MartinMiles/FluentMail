# Fluent Mail 1.5.0 validation ? 2026-10-28

## Automated results

174 tests passed in 16 files. TypeScript and production build passed. Dependency audit: zero reported vulnerabilities. Automated tests and native demo use synthetic mailboxes, never real saved credentials.

New coverage: metadata-confirmed CID image downloads for inline-only messages, regional reference validation, no arbitrary remote requests, raster validation/size and count limits, visible unsupported-image feedback, first-failure stop; account-scoped conversation grouping/counts, stable selection, cross-folder chronological cards, lazy body loading/cache, older-page loading, exact-member reply routing and stale response discard. Existing attachment sending, countdown/Send now, recipient history, Delete, account settings and SMTP tests also pass.

## Package

C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.5.0-Windows-x64.exe

Final size: 113,731,259 bytes. SHA-256: F2A6E39460D392931E62D8477E3FDA4658E30CD18A2C4A235EB8896C5F73BE64.

Both unpacked and final portable Windows --demo --smoke-test runs passed for 1.5.0: custom protocol loading, renderer Node isolation, IPC/events bridge, Windows protected-storage round trip, close-to-tray residency and draft-flush Exit. These runs use separate demo storage. The production app was left running without a forced restart.

A synthetic browser visual check confirmed chronological original/reply cards, circular count 2 and a successfully decoded embedded raster image inside the sandbox.

## Live evidence and limits

The owner personally reports successful v1.4 SMTP inline-image delivery to Gmail. Browser inspection of the owner-selected reply conversation confirmed loaded embedded images and both original/reply in Zoho webmail. This establishes that the image reached Zoho; it does not independently prove Fluent Mail rendering.

Bounded read-only checks authenticated successfully, found the owner-selected two-message conversation across Inbox and Sent, and downloaded a valid PNG. Production-adapter validation returned one embedded PNG, zero ordinary attachments and no image warning, with unchanged vault hashes. Initial local profile lookup stopped before networking because of case-sensitive email matching in the one-off helper. Intermediate checks found and corrected an empty unscoped count query and a mismatched display-path assumption; these were not authentication failures. No sending, message mutations, polling or persistent settings writes occurred. The assistant has not yet visually inspected this real image inside the rebuilt app; renderer isolation/display is tested with synthetic images.

Zoho returned threadCount=0 for a real conversation. Count badges derive from bounded Inbox/Sent/current-folder summaries, with + for a lower bound until complete conversation history is read. They never infer identity from a subject. Ordinary lists omit the threadedMails filter so standalone mail remains visible.

## Source/privacy

Real settings, passwords, OAuth credentials, messages, images, recipient history and diagnostic outputs stay excluded. The encrypted vault is outside the source tree. Publish reviewed source and documentation only. Previous v1.3 report is archived as TEST-REPORT-1.3.md.

## Publication status

The full reviewed source is committed locally. GitHub remains the earlier partial 68-file snapshot: the Chrome extension blocks programmatic uploads and the native fallback was stopped because Computer Use could not verify Chrome?s current URL confidently enough. All browser/native UI interaction stopped. Existing CLI identities have read-only repository access; the owner has no registered GitHub SSH keys. No access credentials or browser security settings were changed. The remote was fetched and its initial history preserved locally; no completed push is claimed.
