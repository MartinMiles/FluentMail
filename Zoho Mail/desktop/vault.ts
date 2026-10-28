import fs from "node:fs";
import path from "node:path";
import {
  type Compose,
  type Preferences,
  preferencesSchema,
} from "../src/shared";
import type { Secret, SecretStore } from "./transport";
import { rememberRecipients } from "../src/recipientHistory";
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(bytes: Buffer): string;
}
type Data = {
  version: 1;
  profiles: Secret[];
  drafts: Record<string, Compose>;
  submitted: Record<string, "pending" | "sent">;
  preferences?: Preferences;
  recipientHistory?: Record<string, string[]>;
};
export class Vault implements SecretStore {
  data: Data = { version: 1, profiles: [], drafts: {}, submitted: {} };
  constructor(
    private file: string,
    private cipher: Cipher,
  ) {
    if (fs.existsSync(file)) {
      if (!cipher.isEncryptionAvailable())
        throw new Error("Windows credential protection is unavailable.");
      const data = JSON.parse(cipher.decryptString(fs.readFileSync(file)));
      if (
        data.version !== 1 ||
        !Array.isArray(data.profiles) ||
        !data.drafts ||
        !data.submitted
      )
        throw new Error("The protected settings file could not be read.");
      this.data = data;
    }
  }
  preferences() {
    return preferencesSchema.parse(this.data.preferences || {});
  }
  recipients(key: string) {
    return this.data.recipientHistory?.[key] || [];
  }
  remember(key: string, fields: string[]) {
    this.data.recipientHistory ||= {};
    this.data.recipientHistory[key] = rememberRecipients(
      this.recipients(key),
      fields,
    );
  }
  persist() {
    if (!this.cipher.isEncryptionAvailable())
      throw new Error(
        "Windows credential protection is unavailable. Nothing was stored in plaintext.",
      );
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const bytes = this.cipher.encryptString(JSON.stringify(this.data));
    const temp = this.file + ".tmp";
    fs.writeFileSync(temp, bytes, { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  save(secret: Secret) {
    const i = this.data.profiles.findIndex((p) => p.id === secret.id);
    if (i < 0) this.data.profiles.push(secret);
    else this.data.profiles[i] = secret;
    this.persist();
  }
  forget(id: string) {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    for (const key of Object.keys(this.data.drafts))
      if (key.startsWith(id + ":")) delete this.data.drafts[key];
    for (const key of Object.keys(this.data.recipientHistory || {}))
      if (key.startsWith(id + ":")) delete this.data.recipientHistory![key];
    this.persist();
  }
}
