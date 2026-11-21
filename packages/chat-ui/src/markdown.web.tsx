import { type CSSProperties, createContext, memo, type ReactNode, useContext } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./markdown.web.css";
import { type ChatMarkdownProps, closeUnterminatedFence, sanitizeMarkdownUrl } from "./markdown";
import { isMermaidFence, mermaidSvgImage, renderMermaidSvgSync } from "./mermaid";
import { N8nWorkflowCanvas } from "./N8nWorkflowCanvas";
import { isN8nFenceLanguage, parseN8nWorkflowJson } from "./n8n-workflow";

type MarkdownHast = {
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownHast[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

const StreamingSourceContext = createContext<string | undefined>(undefined);

function extractFencedCode(node: MarkdownHast | undefined): { lang: string; source: string } | undefined {
  const code = node?.children?.find((child) => child.tagName === "code");
  const classNames = code?.properties?.className;
  const languageClass = Array.isArray(classNames)
    ? classNames.find((name) => typeof name === "string" && name.startsWith("language-"))
    : undefined;
  const lang = typeof languageClass === "string" ? languageClass.slice("language-".length) : "";
  const source = (code?.children ?? []).map((child) => child.value ?? "").join("");
  return source.trim() ? { lang, source: source.trimEnd() } : undefined;
}

function isFenceClosedInStream(node: MarkdownHast | undefined, streamingSource: string | undefined): boolean {
  if (streamingSource === undefined) return true;
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  const fence = start === undefined ? "" : streamingSource.slice(start, end);
  const opening = fence.match(/^(`{3,}|~{3,})/);
  const lastLine = fence.slice(fence.lastIndexOf("\n") + 1);
  const closing = lastLine.match(/^(?:[ \t]*>[ \t]?)*[ \t]*(`{3,}|~{3,})[ \t]*$/);
  return Boolean(
    fence.includes("\n") &&
      opening?.[1] &&
      closing?.[1] &&
      opening[1][0] === closing[1][0] &&
      closing[1].length >= opening[1].length,
  );
}

function MermaidDiagram({ source, fallback }: { source: string; fallback: ReactNode }) {
  const appearance =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";
  const svg = renderMermaidSvgSync(source, appearance);
  const image = svg ? mermaidSvgImage(svg) : undefined;
  if (!image) return fallback;
  return (
    <figure className="rk-chat-markdown-diagram" data-testid="chat-diagram">
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading="lazy"
        style={{ "--rk-diagram-width": `${image.width}px` } as CSSProperties}
      />
    </figure>
  );
}

function MarkdownPre({
  node,
  ...props
}: React.ComponentPropsWithoutRef<"pre"> & { node?: MarkdownHast }) {
  const streamingSource = useContext(StreamingSourceContext);
  const extracted = extractFencedCode(node);
  if (!extracted) return <pre {...props} />;

  if (isMermaidFence(extracted.lang)) {
    if (!isFenceClosedInStream(node, streamingSource)) return <pre {...props} />;
    return <MermaidDiagram source={extracted.source} fallback={<pre {...props} />} />;
  }

  if (isN8nFenceLanguage(extracted.lang) && isFenceClosedInStream(node, streamingSource)) {
    const workflow = parseN8nWorkflowJson(extracted.source);
    if (workflow) {
      return <N8nWorkflowCanvas workflow={workflow} rawSource={extracted.source} />;
    }
  }

  return <pre {...props} />;
}

const components: Components = {
  a({ node: _node, ...props }) {
    return <a {...props} target="_blank" rel="noreferrer noopener" />;
  },
  img({ node: _node, ...props }) {
    return <img {...props} alt={props.alt ?? ""} loading="lazy" />;
  },
  pre: MarkdownPre as Components["pre"],
};

export const ChatMarkdown = memo(function ChatMarkdown({
  children,
  streaming = false,
}: ChatMarkdownProps) {
  const source = streaming ? closeUnterminatedFence(children) : children;

  return (
    <div className={streaming ? "rk-chat-markdown rk-chat-markdown-streaming" : "rk-chat-markdown"}>
      <StreamingSourceContext.Provider value={streaming ? children : undefined}>
        <ReactMarkdown
          components={components}
          remarkPlugins={[remarkGfm]}
          skipHtml
          urlTransform={(url, key) =>
            key === "src" && url.startsWith("data:image/svg+xml;charset=utf-8,")
              ? url
              : (sanitizeMarkdownUrl(url, true) ?? "")
          }
        >
          {source}
        </ReactMarkdown>
      </StreamingSourceContext.Provider>
      {streaming ? <span aria-hidden="true" className="rk-chat-markdown-cursor" /> : null}
    </div>
  );
});

export type { ChatMarkdownProps } from "./markdown";
export { N8nWorkflowCanvas, type N8nWorkflowCanvasProps } from "./N8nWorkflowCanvas";
export { parseN8nWorkflowJson, type ParsedN8nWorkflow } from "./n8n-workflow";

