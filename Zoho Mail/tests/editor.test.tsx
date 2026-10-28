// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RichEditor } from "../src/RichEditor";
import { cleanEditorHtml } from "../src/sanitize";
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  HTMLElement.prototype.scrollIntoView = () => {};
  document.elementFromPoint = () => document.body;
});
afterEach(cleanup);
describe("WYSIWYG editor", () => {
  it("keeps all typed characters and serializes actual bold markup", async () => {
    const changed = vi.fn();
    render(
      <RichEditor
        value="<p></p>"
        onChange={changed}
        disabled={false}
        onNotice={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Bold (Ctrl+B)" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message body" }),
      "A fully formatted message",
    );
    await waitFor(() =>
      expect(changed.mock.lastCall?.[0]).toContain(
        "<strong>A fully formatted message</strong>",
      ),
    );
    expect(
      screen.getByRole("textbox", { name: "Message body" }).textContent,
    ).toBe("A fully formatted message");
  });
  it("rejects executable links while allowing a user-selected HTTPS link", async () => {
    const changed = vi.fn();
    render(
      <RichEditor
        value="<p></p>"
        onChange={changed}
        disabled={false}
        onNotice={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Insert link (Ctrl+K)" }),
    );
    await user.type(
      screen.getByLabelText("Link address"),
      "javascript:alert(1)",
    );
    await user.click(screen.getByRole("button", { name: "Apply link" }));
    expect(screen.getByRole("alert").textContent).toContain("https://");
    await user.clear(screen.getByLabelText("Link address"));
    await user.type(
      screen.getByLabelText("Link address"),
      "https://example.test",
    );
    await user.type(screen.getByLabelText("Text to display"), "Project");
    await user.click(screen.getByRole("button", { name: "Apply link" }));
    await waitFor(() =>
      expect(changed.mock.lastCall?.[0]).toContain(
        'href="https://example.test"',
      ),
    );
    expect(changed.mock.lastCall?.[0]).not.toContain("javascript:");
  });
  it("sanitizes pasted HTML while preserving normal formatting", () => {
    const html = cleanEditorHtml(
      '<p><strong>Keep</strong><img src="https://tracker.test"><a href="javascript:bad()">No action</a><span style="color:#123456; background-image:url(https://tracker.test)">Color</span></p>',
    );
    expect(html).toContain("<strong>Keep</strong>");
    expect(html).toContain("color: #123456");
    expect(html).not.toContain("tracker.test");
    expect(html).not.toContain("javascript:");
  });
});
