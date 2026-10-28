# Fluent Mail 1.6.0 validation

183 automated tests pass in 16 files. TypeScript and the production build pass. New interaction coverage verifies both reading orders, persisted preference, independent Latest/Unread indicators, chronology labels, missing timestamps, partial pagination, cross-folder latest selection, older-message reply targets, cached Go to latest, and new replies arriving while an older message is being read. Existing security, inline images, SMTP, send countdown, recipient history and source-isolation checks also pass.

Research and UX decisions: [CONVERSATION-UX.md](CONVERSATION-UX.md). Seven vendor documentation sets were compared; documented behaviors and our design choices are distinguished.

Visual review uses the actual renderer with fictional example.test mail. Both order choices show distinct Latest/Earlier labels and chronological sequence numbers. The synthetic inline PNG decoded at 720 x 150 pixels. Screenshots in docs/screenshots/1.6 contain no private messages or real mailbox data. The Electron demo window rendered successfully; its native input did not reliably select a message, so interactive layout review and exported screenshots used the same renderer in the isolated loopback preview. Do not claim a successful native click that produced no change.

Final unpacked and portable Windows --demo --smoke-test runs passed: version 1.6.0, custom protocol, renderer Node isolation, IPC/events, Windows encryption round trip, close-to-tray and draft-flush Exit. Portable size: 113,743,779 bytes. SHA-256: 48A50A0CC011B1CB233D6BD74CE21547DBBC372A4CABAE95B610BB6998D7923A. Dependency audit: zero findings. GitHub source/release verification is in progress. A standard contribution-fork PR provides the source route; binary/checksum assets will be on the creator's GitHub fork, clearly linked by the primary repository's release. No Zoho account access, mail sending, DNS or subscription change is needed for this UX release. Earlier owner confirmation of live images/conversations applies to v1.5.

Expected executable: C:\Projects\SafetyFluent\Zoho Mail\release\Fluent-Mail-1.6.0-Windows-x64.exe.
