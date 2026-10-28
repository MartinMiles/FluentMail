import { contextBridge, ipcRenderer } from "electron";
import type { Command } from "../src/shared";
contextBridge.exposeInMainWorld("mail", {
  invoke: (command: Command) => ipcRenderer.invoke("mail:command", command),
});
