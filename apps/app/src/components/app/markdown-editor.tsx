"use client";

import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type MarkdownEditorProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string | null;
  onChange?: (markdown: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
  invalid?: boolean;
  className?: string;
};

const ToolbarButton = ({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={active}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={cn(
      "text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors",
      active && "bg-accent text-foreground",
    )}
  >
    <Icon className="size-3.5" />
  </button>
);

const Toolbar = ({ editor }: { editor: Editor }) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      heading: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
    }),
  });

  const toggleLink = () => {
    if (state.link) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Link URL");
    if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
      <ToolbarButton icon={Bold} label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={Heading2} label="Heading" active={state.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <span className="bg-border mx-1 h-4 w-px" />
      <ToolbarButton icon={List} label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton icon={Quote} label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton icon={Link2} label="Link" active={state.link} onClick={toggleLink} />
    </div>
  );
};

const MARKDOWN_HINT =
  /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\|.*\|)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`/m;

export const MarkdownEditor = ({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  minRows = 4,
  invalid,
  className,
}: MarkdownEditorProps) => {
  const [markdown, setMarkdown] = useState(value ?? defaultValue ?? "");
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: markdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(invalid ? { "aria-invalid": "true" } : {}),
        class: "outline-none px-3 py-2",
        style: `min-height: ${minRows * 1.5 + 1}rem`,
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        const current = editorRef.current;
        if (!text || !current || !MARKDOWN_HINT.test(text)) return false;
        event.preventDefault();
        current.commands.insertContent(text, { contentType: "markdown" });
        return true;
      },
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
    onUpdate: ({ editor: e }) => {
      const next = e.isEmpty ? "" : e.getMarkdown();
      setMarkdown(next);
      onChange?.(next);
    },
    onBlur: () => onBlur?.(),
  });

  return (
    <div
      data-invalid={invalid || undefined}
      className={cn(
        "border-input bg-background dark:bg-input/30 overflow-hidden rounded-lg border transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        "data-[invalid]:border-destructive data-[invalid]:ring-destructive/20",
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} /> : <div className="h-9 border-b" />}
      <EditorContent
        editor={editor}
        className={cn(
          "text-sm leading-relaxed",
          "[&_.tiptap_p]:my-1.5 [&_.tiptap_ul]:my-1.5 [&_.tiptap_ol]:my-1.5 [&_.tiptap_ul]:list-disc [&_.tiptap_ol]:list-decimal [&_.tiptap_ul]:pl-5 [&_.tiptap_ol]:pl-5",
          "[&_.tiptap_h1]:mt-3 [&_.tiptap_h1]:mb-1.5 [&_.tiptap_h1]:text-base [&_.tiptap_h1]:font-semibold",
          "[&_.tiptap_h2]:mt-3 [&_.tiptap_h2]:mb-1.5 [&_.tiptap_h2]:text-base [&_.tiptap_h2]:font-semibold",
          "[&_.tiptap_h3]:mt-2 [&_.tiptap_h3]:mb-1 [&_.tiptap_h3]:font-semibold",
          "[&_.tiptap_blockquote]:text-muted-foreground [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:pl-3",
          "[&_.tiptap_a]:underline [&_.tiptap_a]:underline-offset-4",
          "[&_.tiptap_code]:bg-muted [&_.tiptap_code]:rounded [&_.tiptap_code]:px-1 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-[0.85em]",
          "[&_.tiptap>*:first-child]:mt-0 [&_.tiptap>*:last-child]:mb-0",
          "[&_.tiptap_p.is-editor-empty:first-child]:before:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child]:before:float-left [&_.tiptap_p.is-editor-empty:first-child]:before:h-0 [&_.tiptap_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        )}
      />
      {name ? <input type="hidden" name={name} value={markdown} /> : null}
    </div>
  );
};
