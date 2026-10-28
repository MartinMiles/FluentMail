import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  Undo2,
  Redo2,
  RemoveFormatting,
  AlignLeft,
  AlignCenter,
  AlignRight,
  IndentIncrease,
  IndentDecrease,
} from "lucide-react";
import { cleanEditorHtml } from "./sanitize";
import { validMailLink } from "./htmlPolicy";

export function RichEditor({
  value,
  onChange,
  disabled,
  onNotice,
  externalRevision = 0,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled: boolean;
  onNotice: (message: string) => void;
  externalRevision?: number;
}) {
  const [link, setLink] = useState<{
    from: number;
    to: number;
    url: string;
    text: string;
  } | null>(null);
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          defaultProtocol: "https",
          isAllowedUri: (url) => validMailLink(url),
        },
        heading: { levels: [1, 2, 3] },
      }),
      TextStyleKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Write your message…" }),
    ],
    content: cleanEditorHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Message body",
        "aria-multiline": "true",
        spellcheck: "true",
        class: "rich-document",
      },
      transformPastedHTML: cleanEditorHtml,
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) {
          onNotice(
            "Use Attach files for images and documents. Text and formatting can be pasted here.",
          );
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files.length) {
          onNotice("Use Attach files to add documents or images.");
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            font: e.getAttributes("textStyle").fontFamily || "",
            size: e.getAttributes("textStyle").fontSize || "14px",
          }
        : null,
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  // The editor owns keystrokes/selection. Reset content only for an explicit external insert,
  // never by reflecting each asynchronous React state update back into ProseMirror.
  useEffect(() => {
    if (editor && externalRevision > 0) {
      editor.commands.setContent(cleanEditorHtml(value), { emitUpdate: false });
      editor.commands.focus("end");
    }
  }, [externalRevision, editor]);
  if (!editor) return <div className="editor-loading">Opening editor…</div>;
  const button = (
    name: string,
    icon: React.ReactNode,
    fn: () => void,
    active = false,
    unavailable = false,
  ) => (
    <button
      key={name}
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={active}
      className={"format-button " + (active ? "active" : "")}
      disabled={disabled || unavailable}
      onMouseDown={(e) => e.preventDefault()}
      onClick={fn}
    >
      {icon}
    </button>
  );
  const openLink = () => {
    const { from, to } = editor.state.selection;
    setLink({
      from,
      to,
      url: editor.getAttributes("link").href || "",
      text: editor.state.doc.textBetween(from, to),
    });
    setLinkError("");
  };
  const applyLink = () => {
    if (!link) return;
    const url = link.url.trim();
    if (!validMailLink(url)) {
      setLinkError("Use a complete https://, http:// or mailto: address.");
      return;
    }
    if (link.from === link.to)
      editor
        .chain()
        .focus()
        .setTextSelection(link.from)
        .insertContent({
          type: "text",
          text: link.text || url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    else
      editor
        .chain()
        .focus()
        .setTextSelection({ from: link.from, to: link.to })
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    setLink(null);
  };
  return (
    <div className={"rich-editor " + (disabled ? "disabled" : "")}>
      <div
        className="format-toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        <select
          aria-label="Font family"
          title="Font family"
          disabled={disabled}
          value={state?.font}
          onChange={(e) =>
            e.target.value
              ? editor.chain().focus().setFontFamily(e.target.value).run()
              : editor.chain().focus().unsetFontFamily().run()
          }
        >
          <option value="">Default font</option>
          {[
            "Arial",
            "Verdana",
            "Georgia",
            "Times New Roman",
            "Courier New",
          ].map((font) => (
            <option key={font}>{font}</option>
          ))}
        </select>
        <select
          aria-label="Font size"
          title="Font size"
          disabled={disabled}
          value={state?.size}
          onChange={(e) =>
            editor.chain().focus().setFontSize(e.target.value).run()
          }
        >
          {["10px", "12px", "14px", "18px", "24px", "32px"].map((size) => (
            <option key={size} value={size}>
              {size.replace("px", "")}
            </option>
          ))}
        </select>
        <span className="format-divider" />
        {button(
          "Bold (Ctrl+B)",
          <Bold size={16} />,
          () => editor.chain().focus().toggleBold().run(),
          state?.bold,
        )}
        {button(
          "Italic (Ctrl+I)",
          <Italic size={16} />,
          () => editor.chain().focus().toggleItalic().run(),
          state?.italic,
        )}
        {button(
          "Underline (Ctrl+U)",
          <Underline size={16} />,
          () => editor.chain().focus().toggleUnderline().run(),
          state?.underline,
        )}
        {button(
          "Strikethrough",
          <Strikethrough size={16} />,
          () => editor.chain().focus().toggleStrike().run(),
          state?.strike,
        )}
        <label className="format-color" title="Text color">
          A
          <input
            type="color"
            aria-label="Text color"
            disabled={disabled}
            defaultValue="#24334a"
            onChange={(e) =>
              editor.chain().focus().setColor(e.target.value).run()
            }
          />
        </label>
        <label className="format-color highlight" title="Highlight color">
          A
          <input
            type="color"
            aria-label="Highlight color"
            disabled={disabled}
            defaultValue="#fff1a6"
            onChange={(e) =>
              editor.chain().focus().setBackgroundColor(e.target.value).run()
            }
          />
        </label>
        <span className="format-divider" />
        {button(
          "Bullet list",
          <List size={16} />,
          () => editor.chain().focus().toggleBulletList().run(),
          state?.bullet,
        )}
        {button(
          "Numbered list",
          <ListOrdered size={16} />,
          () => editor.chain().focus().toggleOrderedList().run(),
          state?.ordered,
        )}
        {button("Indent list", <IndentIncrease size={16} />, () =>
          editor.chain().focus().sinkListItem("listItem").run(),
        )}
        {button("Outdent list", <IndentDecrease size={16} />, () =>
          editor.chain().focus().liftListItem("listItem").run(),
        )}
        {button("Align left", <AlignLeft size={16} />, () =>
          editor.chain().focus().setTextAlign("left").run(),
        )}
        {button("Align center", <AlignCenter size={16} />, () =>
          editor.chain().focus().setTextAlign("center").run(),
        )}
        {button("Align right", <AlignRight size={16} />, () =>
          editor.chain().focus().setTextAlign("right").run(),
        )}
        {button(
          "Quote",
          <Quote size={16} />,
          () => editor.chain().focus().toggleBlockquote().run(),
          state?.quote,
        )}
        <span className="format-divider" />
        {button(
          "Insert link (Ctrl+K)",
          <LinkIcon size={16} />,
          openLink,
          state?.link,
        )}
        {button(
          "Remove link",
          <Unlink size={16} />,
          () => editor.chain().focus().unsetLink().run(),
          false,
          !state?.link,
        )}
        {button("Clear formatting", <RemoveFormatting size={16} />, () =>
          editor.chain().focus().unsetAllMarks().clearNodes().run(),
        )}
        {button("Undo (Ctrl+Z)", <Undo2 size={16} />, () =>
          editor.chain().focus().undo().run(),
        )}
        {button("Redo (Ctrl+Y)", <Redo2 size={16} />, () =>
          editor.chain().focus().redo().run(),
        )}
        <select
          aria-label="Insert emoji"
          title="Insert emoji"
          disabled={disabled}
          value=""
          onChange={(e) => {
            editor.chain().focus().insertContent(e.target.value).run();
          }}
        >
          <option value="">🙂</option>
          {["🙂", "👍", "✅", "📌", "📅", "🎉"].map((emoji) => (
            <option key={emoji}>{emoji}</option>
          ))}
        </select>
      </div>
      {link && (
        <div className="link-editor">
          <label>
            Link address
            <input
              autoFocus
              value={link.url}
              placeholder="https://example.com"
              onChange={(e) => setLink({ ...link, url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setLink(null);
                }
              }}
            />
          </label>
          {link.from === link.to && (
            <label>
              Text to display
              <input
                value={link.text}
                onChange={(e) => setLink({ ...link, text: e.target.value })}
              />
            </label>
          )}
          <button type="button" className="primary" onClick={applyLink}>
            Apply link
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setLink(null)}
          >
            Cancel
          </button>
          {linkError && (
            <p role="alert" className="error-text">
              {linkError}
            </p>
          )}
        </div>
      )}
      <div
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            e.stopPropagation();
            openLink();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
