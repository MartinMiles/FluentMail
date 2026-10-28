# SafetyFluent workspace

For any work on the Windows mail application, **read `Zoho Mail/PROJECT_CONTEXT.md` first on every return**, then `Zoho Mail/AGENTS.md`. The context file is maintained in source control; update it after meaningful decisions, research, fixes, validation, or changes to blockers. Do not repeat completed research without a specific unresolved question or evidence that it has changed.

The active application is in `Zoho Mail/`. `Legacy/` is a separate pre-existing project/repository; leave it alone unless the user explicitly requests work there.

Apply the owner's standing account safeguards: plan live account work; use fixtures and mocks by default; never treat a saved password/cookie or implementation permission as approval for production authentication testing. Obtain explicit bounded approval naming the account and client/device before a live authentication test, with the owner available. Stop at the first unexplained rejection, challenge, rate limit, suspension or unknown result; do not retry or switch clients to diagnose it. Security restrictions require owner-confirmed recovery. Do not perform password resets, recovery, subscription changes or private transmissions without explicit authorization. Keep credentials, private messages and unrelated account data out of logs, exports, screenshots and source control.
