import { Mail, ShieldCheck } from "lucide-react";
import { APP_INFO } from "./version";
import { Modal } from "./Modal";
export function About({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About Fluent Mail" onClose={onClose}>
      <div className="about-body">
        <div className="welcome-icon">
          <Mail size={38} />
        </div>
        <h1>{APP_INFO.name}</h1>
        <span className="version-badge">
          Version {APP_INFO.version} · Windows
        </span>
        <p>A calmer place for all your Zoho mailboxes.</p>
        <dl>
          <dt>Created by</dt>
          <dd>{APP_INFO.creator}</dd>
          <dt>Organization</dt>
          <dd>{APP_INFO.organization}</dd>
          <dt>Contact</dt>
          <dd>{APP_INFO.email}</dd>
        </dl>
        <p className="secure-note">
          <ShieldCheck size={17} /> Your credentials and local drafts are
          protected with Windows encryption.
        </p>
        <p className="fine-print">
          Independent software by SafetyFluent. Not affiliated with Zoho. Built
          with Electron, React and the open-source Tiptap editor.
        </p>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
