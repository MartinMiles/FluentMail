import type { Compose } from "./shared";
import { mailPlainText } from "./sanitize";
export const hasDraftContent = (draft: Compose) =>
  !!(
    draft.to.trim() ||
    draft.cc.trim() ||
    draft.bcc.trim() ||
    draft.subject.trim() ||
    mailPlainText(draft.body).trim() ||
    /<img\b/i.test(draft.body) ||
    draft.attachments.length
  );
/** Distinct edits are serialized; a late autosave cannot resurrect a cleared or
 * discarded draft. A failed write is surfaced, never automatically retried. */
export class DraftPersistence {
  private tail: Promise<unknown> = Promise.resolve();
  private revision = 0;
  private mayExist: boolean;
  constructor(
    private write: (draft: Compose | null, id: string) => Promise<unknown>,
    initial: Compose,
  ) {
    this.mayExist = hasDraftContent(initial);
  }
  save(draft: Compose) {
    const content = hasDraftContent(draft);
    if (!content && !this.mayExist) return this.tail;
    return this.enqueue(content ? structuredClone(draft) : null, draft.id);
  }
  remove(id: string) {
    return this.enqueue(null, id);
  }
  private enqueue(draft: Compose | null, id: string) {
    const version = ++this.revision;
    if (draft) this.mayExist = true;
    const task = this.tail.catch(() => {}).then(() => this.write(draft, id));
    this.tail = task;
    return task.then((value) => {
      if (version === this.revision) this.mayExist = !!draft;
      return value;
    });
  }
}
