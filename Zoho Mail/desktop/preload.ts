import { contextBridge, ipcRenderer } from "electron";
import type { Command, AppEvent } from "../src/shared";
contextBridge.exposeInMainWorld("mail", {
  invoke: (command: Command) => ipcRenderer.invoke("mail:command", command),
  onEvent: (listener: (event: AppEvent) => void) => {
    const handler = (_event: unknown, payload: AppEvent) => listener(payload);
    ipcRenderer.on("mail:event", handler);
    return () => ipcRenderer.removeListener("mail:event", handler);
  },
});
