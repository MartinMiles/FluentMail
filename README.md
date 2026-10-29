# Fluent Mail

A standalone Windows client for Zoho Mail by Martin Miles / SafetyFluent. The application source is in **[Zoho Mail](Zoho%20Mail/README.md)**.

**[Download the Windows application](https://github.com/safetyfluent/FluentMail/releases/latest)** · **[Setup and everyday use](Zoho%20Mail/README.md)**

Version 1.7 improves draft integrity, attachment checks, recipient editing and connection reliability. [Read the implementation and UX review](Zoho%20Mail/docs/REVIEW-1.7.md).

![Fluent Mail: conversation history, an explicit Latest message, and an inline image](Zoho%20Mail/docs/screenshots/1.7/conversation.jpg)

*The actual application interface with fictional sample mail. This screenshot shows the optional oldest-first view; the default is newest first. Latest and Earlier labels stay clear in either order.*

- Read multiple Zoho mailboxes and businesses in one application.
- Follow conversation chains with explicit Latest/Earlier labels, sequence numbers and a quick return to the latest reply.
- Compose rich text, paste images, attach files and use the five-second cancellable Send countdown.
- Keep incoming checks and notifications active in the Windows system tray.
- Keep account credentials, recipient history and drafts protected by Windows encryption on this PC.

[See recipient editing and attachments](Zoho%20Mail/docs/screenshots/1.7/composer.jpg) and [the research behind conversation ordering](Zoho%20Mail/docs/CONVERSATION-UX.md).

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

**Inline images:** v1.4 uses Zoho SMTP to send proper MIME inline images without ordinary image-file copies. Receiving and ordinary sending remain on the API. Configure each mailbox under Settings → Inline images (SMTP); the SMTP/app password is encrypted in the existing vault. Image messages send now and image drafts stay local. See [the investigation and resolution](Zoho%20Mail/docs/INLINE-IMAGES.md). Live SMTP account access requires a valid mailbox/app password; no subscription change is made.

**Conversations and received images:** v1.5 adds expandable original/reply chains and circular message-count badges, plus authenticated embedded-image display. Remote tracking images remain blocked. See the application README for count limits and supported image formats.
