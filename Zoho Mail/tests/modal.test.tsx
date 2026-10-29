// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "../src/Modal";
afterEach(cleanup);
describe("dialog keyboard isolation", () => {
  it("closes only the top nested dialog on Escape", () => {
    const parent = vi.fn(),
      child = vi.fn();
    render(
      <Modal title="Parent" onClose={parent}>
        <Modal title="Child" onClose={child}>
          Child content
        </Modal>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Child" }), {
      key: "Escape",
    });
    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
  it("does not close a disabled dialog during a pending operation", () => {
    const close = vi.fn();
    render(
      <Modal title="Busy" onClose={close} closeDisabled>
        Pending
      </Modal>,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Close dialog",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });
});
