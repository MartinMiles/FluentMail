# Fluent Mail

A standalone Windows client for Zoho Mail by Martin Miles / SafetyFluent. The application source is in **[Zoho Mail](Zoho%20Mail/README.md)**.

Before contributing, read [AGENTS.md](AGENTS.md) and [PROJECT_CONTEXT.md](Zoho%20Mail/PROJECT_CONTEXT.md). The context file records design decisions, tested behavior, investigations and unresolved limitations so work can resume without repeating the research.

## Develop on Windows

```powershell
cd "Zoho Mail"
npm ci
npm run check
npm test
npm run build
npm run demo
```

`npm run demo` is isolated and uses fictional mailboxes. `npm run package` builds the portable Windows executable. See the application README for OAuth setup, multiple mailboxes and tray behavior.

The repository contains source, documentation, synthetic tests and design assets. Real credentials, mail, recipient history and drafts remain in the Windows-encrypted settings vault outside the repository; generated packages and diagnostic outputs are ignored.

**Current limitation:** pasted images can be edited and saved locally, but live inline-image sending is blocked pending a verified Zoho API MIME association method. Tested upload-preview URLs, HTML data URIs and filename/path CID references did not produce working inline images at Gmail. See [the investigation](Zoho%20Mail/docs/INLINE-IMAGES.md). Ordinary text, rich text and file attachments remain supported.
