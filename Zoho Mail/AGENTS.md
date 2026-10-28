# Project safeguards

**On every return, read PROJECT_CONTEXT.md first**, followed by PLAN.md before account work. Do this before re-researching, implementing, testing, or making account changes. PROJECT_CONTEXT.md is the durable project memory and must remain tracked in Git. Update it after important decisions, findings, blockers, fixes, tests, or user steering; include the reasoning. Do not store credentials or private mail in it.

Follow the owner's standing account precautions. Existing research is indexed in docs/API-COVERAGE.md; revisit only the exact source needed for a changed or unresolved question.

- All tests and previews are offline/synthetic. Never run a credential-bearing app to inspect it.
- `--demo` uses separate storage and must never construct the live provider.
- Do not connect to Zoho, mint credentials, refresh a live token, or test mail delivery without the owner's bounded explicit approval.
- No secrets, private messages, contact information, or real attachments in fixtures, screenshots, git, or logs.
- Keep documented endpoint citations in docs/API-COVERAGE.md. Do not infer nonexistent operations from UI conventions.
- Run npm run check, npm test, npm run build and the isolated packaged smoke test after substantive changes. User-facing functionality must have meaningful offline coverage.
