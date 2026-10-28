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
  Tray,
  Notification,
  powerMonitor,
  nativeImage,
} from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Vault } from "./vault";
import { MailService } from "./service";
import { DemoMail } from "../src/demo";
import { InboxSync } from "./sync";
import { APP_INFO } from "../src/version";
import {
  commandSchema,
  type AppEvent,
  type InboxUpdate,
  type Snapshot,
} from "../src/shared";

const demo = process.argv.includes("--demo");
const smoke = process.argv.includes("--smoke-test");
if (smoke && !demo) throw new Error("Smoke tests must use isolated demo mode.");
app.setPath(
  "userData",
  demo
    ? path.join(os.tmpdir(), "fluent-mail-offline-demo")
    : path.join(app.getPath("appData"), "SafetyFluent", "Fluent Mail"),
);
const appId = demo ? "com.safetyfluent.mail.demo" : "com.safetyfluent.mail";
if (process.platform === "win32") {
  app.setAppUserModelId(appId);
  app.setToastActivatorCLSID(
    demo
      ? "{90C87E9D-D190-4793-8C1B-5F107C0848F8}"
      : "{04384C78-3560-4C61-BDA8-738A872C6F7A}",
  );
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "fluent",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let win: BrowserWindow;
  let tray: Tray | undefined;
  let backend: DemoMail | MailService;
  let sync: InboxSync | undefined;
  let quitting = false;
  let quitRequest = "";
  let quitTimer: ReturnType<typeof setTimeout> | undefined;
  let latestNotification: InboxUpdate | undefined;
  let unsubscribeDemo: (() => void) | undefined;
  let smokeReport: Record<string, unknown> | undefined;
  const notices = new Set<Notification>();
  let pendingArrivals = 0;
  const icon = path.join(__dirname, "../resources/app.ico");
  const sendEvent = (event: AppEvent) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
      win.webContents.send("mail:event", event);
  };
  const restore = () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.setSkipTaskbar(false);
    win.focus();
  };
  const hide = () => {
    if (!win || win.isDestroyed()) return;
    win.hide();
    win.setSkipTaskbar(true);
  };
  const snapshot = async () => {
    const r = await backend.invoke({ op: "snapshot" });
    if (!r.ok) throw new Error("Local account status is unavailable.");
    return r.value as Snapshot;
  };
  const preferences = () =>
    backend instanceof MailService
      ? backend.snapshot().preferences
      : backend.preferences;
  const openNotification = (update: InboxUpdate) => {
    restore();
    const message = update.fresh[0] || update.messages[0];
    if (message)
      sendEvent({ type: "open-message", account: update.account, message });
  };
  const notify = (update: InboxUpdate, test = false) => {
    const prefs = preferences();
    if (!prefs.notifications && !test) return;
    if (!test && win.isVisible() && !win.isMinimized() && win.isFocused())
      return;
    const first = update.fresh[0];
    if (!first && !test) return;
    const title = test
      ? "Fluent Mail notification test"
      : `${update.fresh.length} new message${update.fresh.length === 1 ? "" : "s"} · ${update.account.email}`;
    const body = test
      ? "Notifications are ready. Click to return to Fluent Mail."
      : prefs.notificationPreviews
        ? `${first.sender}\n${first.subject}`
        : "Open Fluent Mail to read your new mail.";
    latestNotification = update;
    const fallback = () =>
      tray?.displayBalloon({
        title: title.slice(0, 200),
        content: body.slice(0, 250),
        iconType: "info",
        noSound: !prefs.notificationSound,
      });
    if (!Notification.isSupported()) {
      fallback();
      return;
    }
    const notification = new Notification({
      title: title.slice(0, 200),
      body: body.slice(0, 500),
      icon,
      silent: !prefs.notificationSound,
      timeoutType: "default",
    });
    notices.add(notification);
    notification.on("click", () =>
      test ? restore() : openNotification(update),
    );
    notification.on("failed", () => {
      notices.delete(notification);
      fallback();
    });
    notification.on("close", () => notices.delete(notification));
    notification.show();
  };
  const refreshTray = () => {
    if (!tray) return;
    const prefs = preferences();
    const count = backend.connectedAccounts().length;
    tray.setToolTip(
      `Fluent Mail ${APP_INFO.version} · ${pendingArrivals ? pendingArrivals + " new arrivals · " : ""}${count} mailbox${count === 1 ? "" : "es"} · ${prefs.automaticChecks ? "Automatic checks" : "Checks paused"}`,
    );
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Fluent Mail", click: restore },
        {
          label: "Check mail now",
          enabled: count > 0,
          click: () => void sync?.checkNow(),
        },
        {
          label: prefs.automaticChecks
            ? "Pause automatic checks"
            : "Resume automatic checks",
          click: async () => {
            await backend.invoke({
              op: "preferences",
              preferences: {
                ...prefs,
                automaticChecks: !prefs.automaticChecks,
              },
            });
            refreshTray();
            sync?.wake();
            sendEvent({ type: "connection", snapshot: await snapshot() });
          },
        },
        { type: "separator" },
        {
          label: "About Fluent Mail",
          click: () => {
            restore();
            sendEvent({ type: "about" });
          },
        },
        { label: "Exit Fluent Mail", click: () => void requestQuit() },
      ]),
    );
  };
  const finishQuit = () => {
    quitting = true;
    sync?.stop();
    if (backend instanceof MailService) backend.stopAll();
    unsubscribeDemo?.();
    if (quitTimer) clearTimeout(quitTimer);
    for (const n of notices) n.close();
    tray?.destroy();
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  };
  const requestQuit = async () => {
    if (quitting || quitRequest) return;
    if (backend?.isBusy()) {
      restore();
      sendEvent({
        type: "notice",
        message:
          "An account operation is still in progress. Wait for its result before exiting.",
      });
      return;
    }
    quitRequest = randomUUID();
    sendEvent({ type: "prepare-exit", requestId: quitRequest });
    quitTimer = setTimeout(async () => {
      if (smoke) {
        app.exit(1);
        return;
      }
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        message: "The editor has not confirmed saving your draft.",
        detail: "Stay to save your work, or exit anyway.",
        buttons: ["Stay", "Exit anyway"],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response === 1) finishQuit();
      else {
        quitRequest = "";
        restore();
      }
    }, 8000);
  };
  const setupSync = () => {
    sync?.stop();
    unsubscribeDemo?.();
    if (backend instanceof DemoMail)
      unsubscribeDemo = backend.onEvent(sendEvent);
    sync = new InboxSync(
      backend,
      preferences,
      (update) => {
        sendEvent({ type: "inbox", update });
        if (update.fresh.length) {
          notify(update);
          if (!win.isFocused()) {
            pendingArrivals += update.fresh.length;
            tray?.setImage(
              nativeImage.createFromPath(
                path.join(__dirname, "../resources/app-unread.ico"),
              ),
            );
            refreshTray();
            win.flashFrame(true);
          }
        }
      },
      (account, error) => {
        const message =
          backend instanceof MailService
            ? backend.pauseAfterSyncError(account.profileId)
            : error instanceof Error
              ? error.message
              : "Mail checks stopped.";
        refreshTray();
        void snapshot().then((s) =>
          sendEvent({ type: "connection", snapshot: s, error: message }),
        );
      },
    );
    sync.start();
    refreshTray();
  };
  app.on("second-instance", restore);
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      void requestQuit();
    }
  });
  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
  app
    .whenReady()
    .then(async () => {
      protocol.handle("fluent", (request) => {
        const url = new URL(request.url),
          root = path.resolve(__dirname, "../dist");
        const file = path.resolve(
          root,
          "." +
            decodeURIComponent(
              url.pathname === "/" ? "/index.html" : url.pathname,
            ),
        );
        if (url.host !== "app" || !file.startsWith(root + path.sep))
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
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel:
            !details.url.startsWith("fluent://app/") &&
            !details.url.startsWith("devtools:"),
        }),
      );
      win = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1000,
        minHeight: 680,
        title: "Fluent Mail",
        icon,
        backgroundColor: "#f5f7fa",
        show: !smoke,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          devTools: !app.isPackaged,
          backgroundThrottling: false,
          spellcheck: true,
        },
      });
      win.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          hide();
        }
      });
      win.on("minimize", () => {
        if (!quitting) hide();
      });
      win.on("focus", () => {
        win.flashFrame(false);
        pendingArrivals = 0;
        tray?.setImage(nativeImage.createFromPath(icon));
        if (backend) refreshTray();
      });
      win.on("query-session-end", () => {
        quitting = true;
        sync?.stop();
        if (backend instanceof MailService) backend.stopAll();
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, url) => {
        if (url !== "fluent://app/") event.preventDefault();
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "File",
            submenu: [
              {
                label: "Hide to system tray",
                accelerator: "Alt+F4",
                click: hide,
              },
            ],
          },
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
          {
            label: "Help",
            submenu: [
              {
                label: "About Fluent Mail",
                click: () => sendEvent({ type: "about" }),
              },
            ],
          },
        ]),
      );
      try {
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
        if (!smoke)
          dialog.showErrorBox(
            "Protected settings unavailable",
            "Fluent Mail could not open its Windows-protected settings. No network connection was attempted.",
          );
        quitting = true;
        app.quit();
        return;
      }
      tray = new Tray(nativeImage.createFromPath(icon));
      tray.on("click", restore);
      tray.on("double-click", restore);
      tray.on("balloon-click", () => {
        if (latestNotification) openNotification(latestNotification);
        else restore();
      });
      // Portable binaries need an identity/shortcut for Windows notifications. Demo never registers one.
      if (process.platform === "win32" && !demo && app.isPackaged) {
        try {
          const persistentIcon = path.join(app.getPath("userData"), "app.ico");
          fs.mkdirSync(app.getPath("userData"), { recursive: true });
          fs.copyFileSync(icon, persistentIcon);
          const target =
            process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
          shell.writeShortcutLink(
            path.join(
              app.getPath("appData"),
              "Microsoft",
              "Windows",
              "Start Menu",
              "Programs",
              "Fluent Mail.lnk",
            ),
            {
              target,
              description: "Fluent Mail by Martin Miles · SafetyFluent",
              icon: persistentIcon,
              iconIndex: 0,
              appUserModelId: appId,
              toastActivatorClsid: app.toastActivatorCLSID,
            },
          );
        } catch {
          /* Native notification failure falls back to a tray balloon; no security settings are changed. */
        }
      }
      ipcMain.handle("mail:command", async (event, input) => {
        if (
          win.isDestroyed() ||
          event.sender.isDestroyed() ||
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          event.senderFrame.url !== "fluent://app/"
        )
          return { ok: false, error: "Untrusted request source." };
        const parsed = commandSchema.safeParse(input);
        if (!parsed.success)
          return {
            ok: false,
            error: "Invalid request. Check the fields and try again.",
          };
        const c = parsed.data;
        if (c.op === "quitReady") {
          if (c.requestId !== quitRequest)
            return { ok: false, error: "Expired exit request." };
          if (quitTimer) clearTimeout(quitTimer);
          if (c.error) {
            quitRequest = "";
            restore();
            sendEvent({
              type: "notice",
              message: "Your draft could not be saved. The app will stay open.",
            });
            return { ok: false, error: "Draft save failed." };
          }
          if (smokeReport && process.env.FLUENT_SMOKE_RESULT)
            fs.writeFileSync(
              process.env.FLUENT_SMOKE_RESULT,
              JSON.stringify({ ...smokeReport, quitFlushed: true }),
            );
          setTimeout(finishQuit, 50);
          return { ok: true, value: true };
        }
        if (c.op === "checkNow") {
          await sync?.checkNow();
          return { ok: true, value: true };
        }
        if (c.op === "testNotification") {
          const a = backend.connectedAccounts()[0] || {
            id: "fixture",
            profileId: "fixture",
            email: "Fluent Mail",
            name: "Fluent Mail",
            aliases: [],
          };
          notify(
            {
              account: a,
              messages: [],
              fresh: [],
              hasMore: false,
              checkedAt: Date.now(),
              catchUpLimited: false,
            },
            true,
          );
          return {
            ok: true,
            value:
              "A test notification was requested. Windows Do Not Disturb may silence it.",
          };
        }
        if (c.op === "demo" && !(backend instanceof DemoMail)) {
          if (backend.connectedAccounts().length)
            return {
              ok: false,
              error:
                "Disconnect real accounts before entering the offline demo.",
            };
          backend = new DemoMail();
          setupSync();
        }
        const result = await backend.invoke(c);
        if (["connect", "resume", "disconnect", "forget"].includes(c.op)) {
          if ("profileId" in c) sync?.resetProfile(c.profileId);
          refreshTray();
          sync?.wake();
        }
        if (c.op === "preferences") {
          refreshTray();
          sync?.wake();
          sendEvent({ type: "connection", snapshot: await snapshot() });
        }
        return result;
      });
      await win.loadURL("fluent://app/");
      setupSync();
      powerMonitor.on("suspend", () => sync?.stop());
      powerMonitor.on("resume", () => sync?.start());
      if (smoke) {
        for (let i = 0; i < 70; i++) {
          if (
            await win.webContents.executeJavaScript(
              'document.querySelectorAll(".message-row").length>=8',
            )
          )
            break;
          await new Promise((r) => setTimeout(r, 100));
        }
        const renderer = await win.webContents.executeJavaScript(
          '({nodeExposed:typeof window.require!=="undefined",bridgeReady:typeof window.mail?.invoke==="function",eventsReady:typeof window.mail?.onEvent==="function",rendered:document.querySelectorAll(".message-row").length>=8})',
        );
        const protectedRoundtrip =
          safeStorage.isEncryptionAvailable() &&
          safeStorage.decryptString(
            safeStorage.encryptString("offline fixture"),
          ) === "offline fixture";
        win.close();
        const hiddenToTray =
          !win.isDestroyed() &&
          !win.isVisible() &&
          !!tray &&
          !tray.isDestroyed();
        smokeReport = {
          ok:
            renderer.rendered &&
            !renderer.nodeExposed &&
            renderer.bridgeReady &&
            renderer.eventsReady &&
            protectedRoundtrip &&
            hiddenToTray,
          demo: true,
          version: APP_INFO.version,
          loaded: win.webContents.getURL() === "fluent://app/",
          protectedRoundtrip,
          hiddenToTray,
          notificationSupported: Notification.isSupported(),
          ...renderer,
        };
        if (!smokeReport?.ok) {
          if (process.env.FLUENT_SMOKE_RESULT)
            fs.writeFileSync(
              process.env.FLUENT_SMOKE_RESULT,
              JSON.stringify(smokeReport),
            );
          app.exit(1);
          return;
        }
        await requestQuit();
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
}
