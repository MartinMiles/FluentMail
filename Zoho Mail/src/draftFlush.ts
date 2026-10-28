let active: (() => Promise<void>) | undefined;
export function registerDraftFlush(fn: () => Promise<void>) {
  active = fn;
  return () => {
    if (active === fn) active = undefined;
  };
}
export async function flushActiveDraft() {
  await active?.();
}
