import { DemoMail } from "./demo";
import type { Bridge, Command, AppEvent } from "./shared";
// Browser previews are always synthetic. There is no HTTP proxy to Zoho.
export const bridge: Bridge = window.mail || new DemoMail();
export function subscribe(listener: (event: AppEvent) => void) {
  return bridge.onEvent?.(listener) || (() => {});
}
export async function call<T>(command: Command): Promise<T> {
  const result = await bridge.invoke(command);
  if (!result.ok) throw new Error(result.error);
  return result.value as T;
}
