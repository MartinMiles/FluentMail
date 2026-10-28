import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  protocol,
  session,
  Menu,
} from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { Vault } from "./vault";
import { MailService } from "./service";
import { DemoMail } from "../src/demo";

const demo = process.argv.includes("--demo");
const smoke = process.argv.includes("--smoke-test");
if (smoke && !demo)
  throw new Error("Smoke tests must run in isolated demo mode.");
if (demo)
  app.setPath("userData", path.join(os.tmpdir(), "fluent-mail-offline-demo"));
else
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "SafetyFluent", "Fluent Mail"),
  );
protocol.registerSchemesAsPrivileged([
  {
    scheme: "fluent",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win: BrowserWindow;
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      protocol.handle("fluent", (request) => {
        const url = new URL(request.url);
        const root = path.resolve(__dirname, "../dist");
        const relative = decodeURIComponent(
          url.pathname === "/" ? "/index.html" : url.pathname,
        );
        const file = path.resolve(root, "." + relative);
        if (
          url.host !== "app" ||
          (!file.startsWith(root + path.sep) && file !== root)
        )
          return new Response("Forbidden", { status: 403 });
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".ico": "image/x-icon",
        };
        try {
          return new Response(new Uint8Array(fs.readFileSync(file)), {
            headers: {
              "Content-Type":
                mime[path.extname(file)] || "application/octet-stream",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const allowed =
          details.url.startsWith("fluent://app/") ||
          details.url.startsWith("devtools:");
        callback({ cancel: !allowed });
      });
      win = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1000,
        minHeight: 680,
        backgroundColor: "#f5f7fa",
        title: "Fluent Mail",
        icon: path.join(__dirname, "../resources/app.ico"),
        show: !smoke,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          devTools: !app.isPackaged,
        },
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { label: "File", submenu: [{ role: "quit" }] },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
        ]),
      );
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (url !== "fluent://app/") event.preventDefault();
      });
      let backend: DemoMail | MailService;
      try {
        // The demo branch never constructs a vault, transport, or live provider.
        backend = demo
          ? new DemoMail()
          : new MailService(
              new Vault(
                path.join(app.getPath("userData"), "settings.vault"),
                safeStorage,
              ),
              {
                pick: async () => {
                  const r = await dialog.showOpenDialog(win, {
                    title: "Attach files",
                    properties: ["openFile", "multiSelections"],
                  });
                  return r.canceled ? [] : r.filePaths;
                },
                save: async (name) => {
                  const r = await dialog.showSaveDialog(win, {
                    defaultPath: name,
                    title: "Save attachment",
                  });
                  return r.canceled ? null : r.filePath || null;
                },
                open: async (url) => {
                  const r = await dialog.showMessageBox(win, {
                    type: "question",
                    title: "Open external link",
                    message: "Open this address in your browser?",
                    detail: url,
                    buttons: ["Cancel", "Open"],
                    defaultId: 0,
                    cancelId: 0,
                  });
                  if (r.response === 1) {
                    await shell.openExternal(url);
                    return true;
                  }
                  return false;
                },
              },
            );
      } catch {
        dialog.showErrorBox(
          "Protected settings unavailable",
          "Fluent Mail could not open its Windows-protected settings. No network connection was attempted.",
        );
        app.quit();
        return;
      }
      ipcMain.handle("mail:command", async (event, command) => {
        if (
          win.isDestroyed() ||
          event.sender.isDestroyed() ||
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          event.senderFrame.url !== "fluent://app/"
        )
          return { ok: false, error: "Untrusted request source." };
        if (command?.op === "demo" && !(backend instanceof DemoMail)) {
          if (backend.snapshot().profiles.some((p) => p.connected))
            return {
              ok: false,
              error:
                "Disconnect real accounts before entering the offline demo.",
            };
          backend = new DemoMail();
        }
        return backend.invoke(command);
      });
      win.webContents.on("will-prevent-unload", (event) => {
        const choice = dialog.showMessageBoxSync(win, {
          type: "question",
          message: "Close Fluent Mail?",
          detail:
            "A draft or operation is still open. Stay to save it or review the result.",
          buttons: ["Stay", "Close"],
          defaultId: 0,
          cancelId: 0,
        });
        if (choice === 1) event.preventDefault();
      });
      await win.loadURL("fluent://app/");
      if (smoke) {
        for (let i = 0; i < 50; i++) {
          if (
            await win.webContents.executeJavaScript(
              'document.querySelectorAll(".message-row").length >= 8',
            )
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const result = await backend.invoke({ op: "snapshot" });
        const good = result.ok && (result.value as any).demo === true;
        const file = process.env.FLUENT_SMOKE_RESULT;
        const renderer = await win.webContents.executeJavaScript(
          '({nodeExposed:typeof window.require!=="undefined",bridgeReady:typeof window.mail?.invoke==="function",rendered:document.querySelectorAll(".message-row").length>=8})',
        );
        const protectedRoundtrip =
          safeStorage.isEncryptionAvailable() &&
          safeStorage.decryptString(
            safeStorage.encryptString("offline fixture"),
          ) === "offline fixture";
        if (file)
          fs.writeFileSync(
            file,
            JSON.stringify({
              ok:
                good &&
                renderer.rendered &&
                !renderer.nodeExposed &&
                renderer.bridgeReady &&
                protectedRoundtrip,
              demo: true,
              loaded: win.webContents.getURL() === "fluent://app/",
              protectedRoundtrip,
              ...renderer,
            }),
          );
        app.exit(
          good &&
            renderer.rendered &&
            !renderer.nodeExposed &&
            renderer.bridgeReady
            ? 0
            : 1,
        );
      }
    })
    .catch(() => {
      if (!smoke)
        dialog.showErrorBox(
          "Fluent Mail could not start",
          "The local application failed to load. No automatic connection retry was attempted.",
        );
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
}
