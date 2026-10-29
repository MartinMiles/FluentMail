// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DraftPersistence } from "../src/draftPersistence";
import { blankCompose, type Compose } from "../src/shared";
const draft = () => ({
  ...blankCompose("alex@example.test"),
  body: "<p>Saved content</p>",
  format: "html" as const,
});
describe("draft write ordering and clearing", () => {
  it("deletes an emptied saved draft after any older pending autosave", async () => {
    const initial = draft();
    let release!: () => void;
    let stored: Compose | null = null;
    const write = vi.fn(async (c: Compose | null) => {
      if (c)
        await new Promise<void>((r) => {
          release = r;
        });
      stored = c;
    });
    const queue = new DraftPersistence(write, blankCompose(initial.from));
    const first = queue.save(initial);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const cleared = queue.save({
      ...initial,
      to: "",
      subject: "",
      body: "<p></p>",
    });
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, cleared]);
    expect(stored).toBeNull();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("does not let an autosave finish after an explicit discard", async () => {
    const initial = draft();
    const operations: (Compose | null)[] = [];
    const queue = new DraftPersistence(async (c) => {
      operations.push(c);
    }, initial);
    await Promise.all([queue.save(initial), queue.remove(initial.id)]);
    expect(operations.at(-1)).toBeNull();
  });
  it("does not automatically retry a failed write and allows a distinct later edit", async () => {
    const initial = draft();
    const write = vi
      .fn()
      .mockRejectedValueOnce(Error("Disk unavailable"))
      .mockResolvedValue(true);
    const queue = new DraftPersistence(write, initial);
    await expect(queue.save(initial)).rejects.toThrow("Disk unavailable");
    expect(write).toHaveBeenCalledTimes(1);
    await queue.save({ ...initial, subject: "New edit" });
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("does not create storage for an untouched blank composer", async () => {
    const initial = blankCompose("alex@example.test"),
      write = vi.fn();
    const queue = new DraftPersistence(write, initial);
    await queue.save(initial);
    expect(write).not.toHaveBeenCalled();
  });
});
