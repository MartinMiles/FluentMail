/** Development-only runner. Starting this against an owner's mailbox requires the
 * explicit approval in AGENTS.md; command arguments are never proof of approval.
 * No window, collector, notifications, outgoing mail or writes to the real vault.
 */
import { app, safeStorage } from "electron";
import path from "node:path";
import { Vault } from "./vault";
import { diagnoseMailbox } from "./diagnostic";
// Windows safeStorage uses the app's protected key from Local State. An isolated
// userData directory cannot decrypt the existing vault. Never copy/export that key.
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "SafetyFluent", "Fluent Mail"),
);
void app.whenReady().then(async () => {
  let phase = "argument validation";
  try {
    const email = process.argv[process.argv.indexOf("--mailbox") + 1];
    if (!process.argv.includes("--mailbox") || !email?.includes("@"))
      throw new Error("Specify exactly one --mailbox address.");
    const file = path.join(app.getPath("userData"), "settings.vault");
    phase = "opening protected local settings";
    const vault = new Vault(file, safeStorage);
    phase = "finding the selected saved connection";
    const secret = vault.data.profiles.find(
      (p) => p.email.toLowerCase() === email.toLowerCase(),
    );
    if (!secret)
      throw new Error(
        "The selected connection is not saved on this Windows profile. No request made.",
      );
    phase = "read-only API diagnostic";
    const subjectIndex = process.argv.indexOf("--image-subject");
    const recipientIndex = process.argv.indexOf("--image-recipient");
    const report = await diagnoseMailbox(
      secret,
      fetch,
      undefined,
      subjectIndex >= 0 ? process.argv[subjectIndex + 1] : undefined,
      recipientIndex >= 0 ? process.argv[recipientIndex + 1] : undefined,
    );
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    app.exit(report.failure ? 2 : 0);
  } catch {
    process.stdout.write(
      `Diagnostic stopped during ${phase}. No credential details were exported.\n`,
    );
    app.exit(3);
  }
});
