export type DiagramAppearance = "dark" | "light";

export interface DiagramPalette {
  background: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  accent: string;
  border: string;
}

const DARK_PALETTE: DiagramPalette = {
  background: "#0e0e10",
  card: "#141417",
  foreground: "#f3f3f4",
  mutedForeground: "#9ca3af",
  accent: "#1e293b",
  border: "#34343a",
};

const LIGHT_PALETTE: DiagramPalette = {
  background: "#ffffff",
  card: "#f8fafc",
  foreground: "#0f172a",
  mutedForeground: "#475569",
  accent: "#e2e8f0",
  border: "#cbd5e1",
};

export function paletteForAppearance(appearance: DiagramAppearance = "dark"): DiagramPalette {
  return appearance === "light" ? LIGHT_PALETTE : DARK_PALETTE;
}

/** True for a fence whose info string names Mermaid (```mermaid, ```Mermaid title="x"). */
export function isMermaidFence(info: string | undefined | null): boolean {
  return (info ?? "").trim().split(/\s+/)[0]?.toLowerCase() === "mermaid";
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Mermaid's SVG as a safe `data:image/svg+xml` image source.
 * Rendered inside an `<img>` element so no embedded script or style can affect the host page.
 */
export function mermaidSvgImage(
  svg: string,
): { src: string; width: number; height: number; alt: string } | undefined {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0];
  const viewBox =
    open &&
    /\sviewBox="([^"]+)"/
      .exec(open)?.[1]
      ?.trim()
      .split(/[\s,]+/);
  const width = Number(viewBox?.[2]);
  const height = Number(viewBox?.[3]);
  if (!open || !(width > 0) || !(height > 0)) return undefined;
  const sized = open
    .replace(/\s(width|height)="[^"]*"/g, "")
    .replace(/max-width:\s*[^;"]+;?\s*/, "")
    .replace(/^<svg\b/, `<svg width="${width}" height="${height}"`);
  const title = /<title\b[^>]*>([^<]*)<\/title>/.exec(svg)?.[1]?.trim();
  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(open, () => sized))}`,
    width: Math.ceil(width),
    height: Math.ceil(height),
    alt: title
      ? title.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => XML_ENTITIES[e] ?? e)
      : "Diagram",
  };
}

export type ChatMermaidConfig = {
  startOnLoad: false;
  securityLevel: "strict";
  secure: string[];
  suppressErrorRendering: true;
  htmlLabels: false;
  flowchart: { htmlLabels: false };
  theme: "base";
  darkMode: boolean;
  fontFamily: string;
  themeVariables: Record<string, string | boolean>;
};

export const CHAT_DIAGRAM_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function chatMermaidConfig(
  appearance: DiagramAppearance = "dark",
  palette: DiagramPalette = paletteForAppearance(appearance),
): ChatMermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    secure: [
      "secure",
      "securityLevel",
      "startOnLoad",
      "maxTextSize",
      "suppressErrorRendering",
      "maxEdges",
      "htmlLabels",
    ],
    suppressErrorRendering: true,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    theme: "base",
    darkMode: appearance === "dark",
    fontFamily: CHAT_DIAGRAM_FONT,
    themeVariables: {
      darkMode: appearance === "dark",
      fontFamily: CHAT_DIAGRAM_FONT,
      fontSize: "14px",
      background: palette.card,
      textColor: palette.foreground,
      lineColor: palette.mutedForeground,
      primaryColor: palette.accent,
      primaryTextColor: palette.foreground,
      primaryBorderColor: palette.border,
    },
  };
}

const VALID_DIAGRAM_HEADER =
  /^(?:flowchart|graph)(?:\s+(?:TB|TD|BT|RL|LR))?\b|^sequenceDiagram\b|^stateDiagram(?:-v2)?\b|^classDiagram\b|^erDiagram\b|^gantt\b|^pie\b|^mindmap\b/i;

interface ParsedNode {
  id: string;
  label: string;
}

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
}

function cleanNodeToken(raw: string): { id: string; label: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^([A-Za-z0-9_.-]+)\s*(?:\[\s*"?([^"\]]*)"?\s*\]|\(\s*"?([^")]*)"?\s*\)|\{\s*"?([^"}]*)"?\s*\})?$/,
  );
  if (!match) {
    return null;
  }
  const id = match[1]!;
  const label = (match[2] ?? match[3] ?? match[4] ?? id).trim() || id;
  return { id, label };
}

const MAX_RENDERED_CACHE = 64;
const renderedCache = new Map<string, string | null>();

function cacheKey(source: string, appearance: DiagramAppearance): string {
  return `${appearance}\n${source.trim()}`;
}

function rememberSvg(key: string, svg: string | null): void {
  renderedCache.delete(key);
  renderedCache.set(key, svg);
  if (renderedCache.size > MAX_RENDERED_CACHE) {
    const oldest = renderedCache.keys().next().value;
    if (oldest !== undefined) renderedCache.delete(oldest);
  }
}

/**
 * Deterministic, strict SVG renderer for Mermaid blocks in chat.
 * Produces clean, theme-aware SVG markup without external script execution,
 * and returns `null` when the source is not valid Mermaid syntax so the caller
 * falls back to the standard `<pre><code>` block.
 */
export function renderMermaidSvgSync(
  source: string,
  appearance: DiagramAppearance = "dark",
): string | null {
  const key = cacheKey(source, appearance);
  if (renderedCache.has(key)) {
    return renderedCache.get(key) ?? null;
  }

  const rawLines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));

  if (rawLines.length === 0) {
    rememberSvg(key, null);
    return null;
  }

  const header = rawLines[0]!;
  if (!VALID_DIAGRAM_HEADER.test(header)) {
    rememberSvg(key, null);
    return null;
  }

  let accTitle = "";
  const nodes = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    const titleMatch = line.match(/^accTitle\s*:\s*(.+)$/i) ?? line.match(/^title\s+(.+)$/i);
    if (titleMatch?.[1]) {
      accTitle = titleMatch[1].trim();
      continue;
    }
    if (/^(?:subgraph|end|direction|style|classDef|class|click)\b/i.test(line)) {
      continue;
    }

    // Parse arrows (--> , -.- , ==> , ->> , -->> , -->|label|)
    const arrowMatch = line.match(
      /^(.+?)\s*(?:--+>|--+\|([^|]+)\|-->|==+>|-\.->|-+>>|--+>>|-->\|([^|]+)\|)\s*(.+)$/,
    );
    if (arrowMatch) {
      const leftRaw = arrowMatch[1]!.trim();
      const edgeLabel = (arrowMatch[2] ?? arrowMatch[3] ?? "").trim();
      let rightRaw = arrowMatch[4]!.trim();
      let seqLabel = edgeLabel;

      // Sequence diagram `Alice->>Bob: Hello`
      if (rightRaw.includes(":")) {
        const colonIdx = rightRaw.indexOf(":");
        seqLabel = rightRaw.slice(colonIdx + 1).trim();
        rightRaw = rightRaw.slice(0, colonIdx).trim();
      }

      const fromNode = cleanNodeToken(leftRaw);
      const toNode = cleanNodeToken(rightRaw);
      if (!fromNode || !toNode) {
        rememberSvg(key, null);
        return null;
      }
      if (!nodes.has(fromNode.id)) nodes.set(fromNode.id, fromNode);
      else if (fromNode.label !== fromNode.id) nodes.set(fromNode.id, fromNode);

      if (!nodes.has(toNode.id)) nodes.set(toNode.id, toNode);
      else if (toNode.label !== toNode.id) nodes.set(toNode.id, toNode);

      edges.push({
        from: fromNode.id,
        to: toNode.id,
        ...(seqLabel ? { label: seqLabel } : {}),
      });
      continue;
    }

    const participantMatch = line.match(
      /^(?:participant|actor)\s+([A-Za-z0-9_.-]+)(?:\s+as\s+(.+))?$/i,
    );
    if (participantMatch?.[1]) {
      const id = participantMatch[1].trim();
      const label = (participantMatch[2] ?? id).trim();
      nodes.set(id, { id, label });
      continue;
    }

    const singleNode = cleanNodeToken(line.replace(/;$/, ""));
    if (singleNode) {
      nodes.set(singleNode.id, singleNode);
      continue;
    }

    // For other valid diagram types (pie, gantt, mindmap, erDiagram, classDiagram, stateDiagram),
    // represent non-empty lines as nodes if they are well-formed.
    if (/^[A-Za-z0-9_."'[\]():\s-]+$/.test(line)) {
      const id = `item_${i}`;
      nodes.set(id, { id, label: line.slice(0, 64) });
    } else {
      rememberSvg(key, null);
      return null;
    }
  }

  if (nodes.size === 0) {
    rememberSvg(key, null);
    return null;
  }

  const isHorizontal = /\b(?:LR|RL)\b/i.test(header);
  const palette = paletteForAppearance(appearance);
  const nodeList = Array.from(nodes.values());
  const boxWidth = 160;
  const boxHeight = 44;
  const gapX = 64;
  const gapY = 48;
  const pad = 24;

  const positions = new Map<string, { x: number; y: number }>();
  nodeList.forEach((node, idx) => {
    const x = isHorizontal ? pad + idx * (boxWidth + gapX) : pad + 40;
    const y = isHorizontal ? pad + 20 : pad + idx * (boxHeight + gapY);
    positions.set(node.id, { x, y });
  });

  const totalWidth = isHorizontal
    ? pad * 2 + nodeList.length * boxWidth + Math.max(0, nodeList.length - 1) * gapX
    : pad * 2 + boxWidth + 80;
  const totalHeight = isHorizontal
    ? pad * 2 + boxHeight + 40
    : pad * 2 + nodeList.length * boxHeight + Math.max(0, nodeList.length - 1) * gapY;

  const edgeSvg = edges
    .map((edge) => {
      const fromPos = positions.get(edge.from);
      const toPos = positions.get(edge.to);
      if (!fromPos || !toPos) return "";
      const x1 = isHorizontal ? fromPos.x + boxWidth : fromPos.x + boxWidth / 2;
      const y1 = isHorizontal ? fromPos.y + boxHeight / 2 : fromPos.y + boxHeight;
      const x2 = isHorizontal ? toPos.x : toPos.x + boxWidth / 2;
      const y2 = isHorizontal ? toPos.y + boxHeight / 2 : toPos.y;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const labelEl = edge.label
        ? `<text x="${midX}" y="${midY - 6}" fill="${palette.mutedForeground}" font-family="${escapeXml(CHAT_DIAGRAM_FONT)}" font-size="12" text-anchor="middle">${escapeXml(edge.label)}</text>`
        : "";
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${palette.mutedForeground}" stroke-width="1.75" marker-end="url(#rk-arrow)" />${labelEl}`;
    })
    .join("");

  const nodeSvg = nodeList
    .map((node) => {
      const pos = positions.get(node.id)!;
      return `<g transform="translate(${pos.x},${pos.y})"><rect width="${boxWidth}" height="${boxHeight}" rx="8" ry="8" fill="${palette.accent}" stroke="${palette.border}" stroke-width="1.5" /><text x="${boxWidth / 2}" y="${boxHeight / 2 + 5}" fill="${palette.foreground}" font-family="${escapeXml(CHAT_DIAGRAM_FONT)}" font-size="13" font-weight="500" text-anchor="middle">${escapeXml(node.label)}</text></g>`;
    })
    .join("");

  const titleTag = accTitle ? `<title>${escapeXml(accTitle)}</title>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" style="max-width: ${totalWidth}px;">${titleTag}<defs><marker id="rk-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${palette.mutedForeground}" /></marker></defs>${edgeSvg}${nodeSvg}</svg>`;

  rememberSvg(key, svg);
  return svg;
}

export async function renderMermaidSvg(
  source: string,
  appearance: DiagramAppearance = "dark",
): Promise<string | null> {
  return renderMermaidSvgSync(source, appearance);
}
