import { describe, it, expect } from "vitest";
import { sanitizeOutgoingHtml } from "../desktop/html";
import { textToHtml, validMailLink } from "../src/htmlPolicy";
describe("outgoing rich email boundary", () => {
  it("preserves literal query separators only for vetted Zoho inline-image references", () => {
    const local = "data:image/png;base64,AAAA";
    const remote =
      "https://mail.zoho.com/zm/ImageSignature?fileName=fixture.png&accountId=900&storeName=fixture&frm=c";
    const clean = sanitizeOutgoingHtml(
      '<p><img src="' +
        local +
        '" onerror="bad()"></p><a href="https://example.test/?x=1&amp;accountId=900">link</a>',
      new Map([[local, remote]]),
    );
    expect(clean).toContain('src="' + remote + '"');
    expect(clean).not.toContain("onerror");
    expect(clean).toContain(
      'href="https://example.test/?x=1&amp;accountId=900"',
    );
  });
  it("preserves supported rich formatting for Zoho HTML messages", () => {
    const clean = sanitizeOutgoingHtml(
      '<p style="text-align: center"><strong>Hello</strong> <u>team</u></p><ol><li>Review</li></ol><span style="color: #123456; font-size: 18px; background-color: #fff1a6">Update</span>',
    );
    expect(clean).toContain("<strong>Hello</strong>");
    expect(clean).toContain("text-align:center");
    expect(clean).toContain("<ol>");
    expect(clean).toContain("color:#123456");
  });
  it("removes active content, image beacons and dangerous CSS even from forged IPC HTML", () => {
    const clean = sanitizeOutgoingHtml(
      '<script>bad()</script><img src="https://track.test"><iframe src="https://evil.test"></iframe><p onclick="bad()" style="background-image:url(https://track.test); position:fixed; color:#123456">safe</p><a href="javascript:bad()">bad link</a>',
    );
    for (const value of [
      "script",
      "track.test",
      "iframe",
      "onclick",
      "background-image",
      "position",
      "javascript:",
    ])
      expect(clean).not.toContain(value);
    expect(clean).toContain("safe");
    expect(clean).toContain("color:#123456");
  });
  it("does not interpret old plaintext drafts as HTML", () => {
    expect(textToHtml("<img src=x>\nHello")).toBe(
      "<p>&lt;img src=x&gt;<br>Hello</p>",
    );
  });
  it("validates links without allowing credentials or executable schemes", () => {
    expect(validMailLink("https://example.test")).toBe(true);
    expect(validMailLink("mailto:person@example.test")).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "file:///x",
      "https://user:pass@example.test",
      "//example.test",
    ])
      expect(validMailLink(url)).toBe(false);
  });
});
