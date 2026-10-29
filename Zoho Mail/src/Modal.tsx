import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
const dialogs: HTMLDivElement[] = [];
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  maximized = false,
  headerActions,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  maximized?: boolean;
  headerActions?: ReactNode;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const disabledRef = useRef(closeDisabled);
  disabledRef.current = closeDisabled;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const root = ref.current;
    if (root) dialogs.push(root);
    root?.focus();
    const handler = (e: KeyboardEvent) => {
      const top = dialogs.reduce(
        (last, item) =>
          !last ||
          last.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING
            ? item
            : last,
        undefined as HTMLDivElement | undefined,
      );
      if (top !== root || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!disabledRef.current) closeRef.current();
      }
      if (e.key === "Tab" && root) {
        const items = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"],a[href],[contenteditable="true"]',
          ),
        ].filter((el) => el.offsetParent !== null);
        const first = items[0],
          last = items.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === root)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === root)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (root) {
        const index = dialogs.indexOf(root);
        if (index >= 0) dialogs.splice(index, 1);
      }
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-scrim">
      <div
        className={
          "modal " + (wide ? "wide " : "") + (maximized ? "maximized" : "")
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2>{title}</h2>
          {headerActions}
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
