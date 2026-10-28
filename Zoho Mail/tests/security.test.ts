// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  safeMail,
  cleanText,
  mailPlainText,
  cleanEditorHtml,
} from "../src/sanitize";
import {
  addresses,
  blankCompose,
  commandSchema,
  validateRecipients,
} from "../src/shared";
describe("untrusted email rendering", () => {
  it("allows embedded raster data in a sandbox without enabling remote images", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const safe = safeMail(
      `<p>Image<img src="${png}" onerror="bad()"><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="https://tracker.test/img"></p>`,
    );
    expect(safe.document).toContain(png);
    expect(safe.document).toContain("img-src data:");
    expect(safe.document).not.toMatch(/onerror|image\/svg|tracker.test/);
  });
  it("does not leave ghost server images in quoted replies while retaining valid local images", () => {
    const local =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kXAAAAAASUVORK5CYII=";
    const clean = cleanEditorHtml(
      '<p>Reply<img src="cid:server-image"><img src="https://tracker.test/pixel"><img src="' +
        local +
        '"></p>',
    );
    expect(clean).not.toMatch(/cid:|tracker.test/);
    expect((clean.match(/<img\b/g) || []).length).toBe(1);
    expect(clean).toContain(local);
  });
  it("keeps paragraphs and list boundaries readable in replies", () => {
    const text = mailPlainText(
      "<h3>Next steps</h3><ul><li>Review</li><li>Reply</li></ul><p>Thanks<br>Alex</p><script>malicious()</script>",
    );
    expect(text).toContain("Next steps\n\n• Review\n\n• Reply");
    expect(text).toContain("Thanks\nAlex");
    expect(text).not.toContain("malicious");
  });
  it("removes scripts, forms, frames, event handlers, CSS and tracking pixels", () => {
    const safe = safeMail(
      '<script>alert(1)</script><img src="https://tracker.test/pixel"><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form><p onclick="evil()" style="background:url(https://tracker.test)">Hello</p><svg onload="evil()"></svg>',
    );
    const body = safe.document.split("<body>")[1];
    expect(body).toContain("Hello");
    for (const marker of [
      "<script",
      "<img",
      "<iframe",
      "<form",
      "onclick",
      "tracker.test",
      "<svg",
      "style=",
    ])
      expect(body).not.toContain(marker);
    expect(safe.document).toContain("default-src 'none'");
  });
  it("preserves readable formatting but strips active links and exposes vetted destinations separately", () => {
    const safe = safeMail(
      '<h3>Hello</h3><a href="javascript:alert(1)">bad</a><a href="https://example.test/report">Report</a><a href="https://user:pass@evil.test">credential URL</a>',
    );
    expect(safe.links).toEqual([
      { label: "Report", url: "https://example.test/report" },
    ]);
    expect(safe.document.split("<body>")[1]).not.toContain("href=");
    expect(safe.document).toContain("<h3>Hello</h3>");
  });
  it("decodes HTML-encoded recipients and de-duplicates reply-all addresses", () => {
    expect(
      addresses(
        "&quot;Alex&quot;&lt;Alex@example.test&gt;, alex@example.test, Jamie &lt;jamie@example.test&gt;",
      ),
    ).toEqual(["alex@example.test", "jamie@example.test"]);
  });
  it("rejects header injection and unauthorized From addresses", () => {
    const c = {
      ...blankCompose("alex@example.test"),
      to: "jamie@example.test",
      subject: "ok\r\nBcc: hidden@example.test",
    };
    expect(() => validateRecipients(c, ["alex@example.test"])).toThrow(
      "subject",
    );
    expect(
      commandSchema.safeParse({ op: "request", url: "https://evil.test" })
        .success,
    ).toBe(false);
  });
});
