# Inline image delivery investigation

## v1.5: received images, separate from delivery

The owner reports v1.4 SMTP inline-image delivery to Gmail succeeded. Gmail replies displayed the image in Zoho webmail, but v1.4 Fluent Mail stripped img elements and blocked all images in its reader CSP. v1.5 resolves server-confirmed inline MIME parts through Zoho's authenticated inline-download API and renders safe raster data inside the sandbox. It does not enable remote tracking URLs. Conversation history includes original Sent and incoming replies, with per-message expansion.

No private message contents or images are committed. Tests use synthetic fixtures. Current live verification and packaging status are recorded in PROJECT_CONTEXT.md and TEST-REPORT.md; historical API-only failures below do not describe the new SMTP route.

## v1.4 resolution: Zoho SMTP for image messages

The owner explicitly approved SMTP sending for inline images while retaining API receiving. `desktop/smtp.ts` uses Nodemailer to produce matching CID references and MIME parts marked inline, with each image attached only once. Normal file attachments remain separate only when explicitly added. SMTP/app passwords are mailbox-scoped and Windows-encrypted; no public image hosting, external relay or subscription change is introduced. Normal sends remain on the API.

Offline application-service and MIME tests verify two real inline parts, zero ordinary image copies, matching CIDs, image deduplication, Bcc privacy, aliases/replies, account isolation, safe errors and duplicate-send protection. A public TLS/EHLO check reached smtp.zoho.com with valid TLS 1.3 and LOGIN/PLAIN support, without AUTH or mail commands. Actual SMTP sign-in/delivery still requires a valid configured account credential and must be reported separately from those tests.

Setup is in Settings → Inline images (SMTP). Image messages send now; image drafts remain local. Zoho documents normal automatic SMTP Sent copies, so the client does not append another copy. Sources: [Zoho SMTP](https://www.zoho.com/mail/help/zoho-smtp.html), [Nodemailer embedded images](https://nodemailer.com/message/embedded-images), [SMTP transport](https://nodemailer.com/smtp).

The historical API-only findings below explain why the owner chose this route; their temporary v1.3 delivery block is superseded when SMTP is configured.

Status: unresolved; sending local inline images is blocked in v1.3 to preserve the draft and prevent silent broken delivery. This is not a completed Gmail-style inline feature.

**Later partial success:** literal `&` query separators in vetted upload URLs, together with ordinary file descriptors, produced two matching inline CID parts. Gmail loaded both 32px squares in the body. The earlier sanitizer had changed those separators to `&amp;`, preventing conversion. However two ordinary duplicate file attachments remained, visible as attachment cards in Gmail. Thus rendering has a verified workaround; the owner's no-duplicate-file requirement is still unresolved.

After the separator fix, removing descriptors or sending `attachments: []` left preview URLs with no image MIME parts. An empty-filename experiment returned a server error at submission, with an unknown outcome and no retry. Those experiments are not shipped. Production still retains the image draft and blocks sending while a complete no-duplicate method is unresolved. Optional SMTP sending, while retaining API receiving, is a pending product/scope decision.

The editor imports PNG/JPEG/GIF/WebP clipboard images into local HTML and preserves them in the encrypted local draft. Offline regression covers paste through the captured send payload, including simultaneous ordinary file attachments. The upload API exposes `isInline=true` and a compose-preview URL; this does not establish that the send API will produce MIME inline parts.

## Evidence — 2026-10-28

Live checks used only the owner's specifically identified message and synthetic color-square messages to the owner-designated diagnostic destination. No private MIME, addresses, IDs, tokens or real attachments are included here.

| Tested form                                                                              | Result in the sent MIME / receiving client                                                                                                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner-identified earlier message                                                         | No HTML image elements or image MIME parts.                                                                                                                          |
| Returned relative preview URL and expanded regional HTTPS URL, with ordinary descriptors | Two unchanged preview references, two ordinary image attachments, zero inline image parts, no multipart/related. Owner confirmed attachments only in Gmail.          |
| Same uploaded references without descriptors                                             | Two preview references, zero image parts.                                                                                                                            |
| Direct data URI images in HTML                                                           | Two data references, zero image MIME parts. Gmail browser inspection showed broken-image placeholders.                                                               |
| `cid:` references based on returned filename/path with ordinary descriptors              | Two CID references, two ordinary image parts, zero inline image parts and two unmatched Content-IDs.                                                                 |
| Experimental descriptor flag                                                             | No confirmed send result; the initial probe discarded the failure detail, so treat its outcome as uncertain. No automatic resend. This guessed field is not shipped. |
| Experimental inline association field                                                    | Rejected at message submission with HTTP/API 404; no retry of that request. This guessed field is not shipped.                                                       |

These observations establish failures of the tested forms, not a proof that every possible Zoho API method is unsupported. Do not declare a provider-wide impossibility or expand to private endpoints, a different subscription, SMTP passwords or another sending service without a concrete supported design.

The prototype's assumption that a normally sanitized upload-preview URL becomes a MIME inline part was incorrect. Normalizing that URL or changing its account-ID validation alone does not solve delivery. Literal separators enable conversion when descriptors are present, but ordinary duplicates still violate the requested behavior. The region/path safety check remains useful for the upload primitive, and the production service blocks image delivery before uploading or posting a message. There is no silent fallback to ordinary attachments, because the owner explicitly requires images in the body without separate file copies.

## Required resolution

Obtain a supported complete upload/send example specifying how the JSON send endpoint binds each HTML image to a MIME Content-ID and marks the image part inline. Verify the generated MIME and the actual receiving client before removing the delivery block. Preserve ordinary attachment behavior, multiple inline-image positions, sender identity, local draft retention and duplicate-send protection.

Useful provider question: after `isInline=true` upload, which exact supported fields in `POST /api/accounts/{accountId}/messages` associate the returned file descriptor with an HTML image so the resulting email has matching Content-ID references and inline MIME parts? The current published send-with-attachments example only lists the three ordinary attachment descriptor fields.

Sources: [Upload attachment](https://www.zoho.com/mail/help/api/post-upload-attachments.html), [send with attachments](https://www.zoho.com/mail/help/api/post-send-email-attachment.html), [get original MIME](https://www.zoho.com/mail/help/api/get-original-message.html), [older unresolved Zoho forum discussion](https://help.zoho.com/portal/en/community/topic/cannot-add-inline-attachment-via-mail-api). The forum is firsthand evidence of similar problems, not an API contract.
