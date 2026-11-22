/**
 * Analyseur et Moteur Géométrique Déterministe de Workflows n8n
 * (Inspiré de src/web/components/n8n-canvas.tsx de n8n-io/nod, 100 % autonome et francisé).
 */

export type N8nNodeCategory =
  | "trigger"
  | "ai"
  | "flow"
  | "code"
  | "http"
  | "note"
  | "integration";

export interface ParsedN8nNode {
  id: string;
  name: string;
  type: string;
  shortType: string;
  typeVersion?: number;
  category: N8nNodeCategory;
  categoryLabelFr: string;
  x: number;
  y: number;
  width: number;
  height: number;
  disabled: boolean;
  isStickyNote: boolean;
  isSubNode: boolean;
  notes?: string;
  sanitizedParameters: Record<string, unknown>;
  outputLabels: string[] | null;
}

export interface ParsedN8nEdge {
  id: string;
  from: string;
  to: string;
  outputIndex: number;
  inputIndex: number;
  connectionType: string;
  label?: string;
  svgPath: string;
  midX: number;
  midY: number;
}

export interface ParsedN8nWorkflow {
  name: string;
  nodes: ParsedN8nNode[];
  edges: ParsedN8nEdge[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  externalUrl: string | null;
}

const NODE_WIDTH = 210;
const NODE_HEIGHT = 74;
const SUB_NODE_WIDTH = 172;
const SUB_NODE_HEIGHT = 58;

const SECRET_KEY_RE =
  /(?:api[_-]?key|secret|token|password|passwd|authorization|bearer|credential|private[_-]?key)/i;

const FLOW_SEGMENTS = new Set(["if", "switch", "merge", "filter", "splitinbatches"]);
const CODE_SEGMENTS = new Set(["code", "function", "functionitem", "set", "itemlists"]);

const BRANCH_LABELS_FR: Record<string, string[]> = {
  if: ["vrai", "faux"],
  filter: ["conservé", "écarté"],
  splitinbatches: ["terminé", "boucle"],
};

const CATEGORY_LABELS_FR: Record<N8nNodeCategory, string> = {
  trigger: "Déclencheur",
  ai: "Agent / IA",
  flow: "Logique",
  code: "Transformation",
  http: "Requête HTTP",
  note: "Note",
  integration: "Action",
};

export function isN8nFenceLanguage(lang: string): boolean {
  const normalized = (lang || "").trim().toLowerCase();
  return (
    normalized === "n8n" ||
    normalized === "n8n-workflow" ||
    normalized === "json" ||
    normalized === "jsonc"
  );
}

function sanitizeNodeParams(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[…]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeNodeParams(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (SECRET_KEY_RE.test(k) && typeof v === "string" && v.length > 0) {
        out[k] = "[MASQUÉ]";
      } else {
        out[k] = sanitizeNodeParams(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > 300) {
    return `${value.slice(0, 300)}…`;
  }
  return value;
}

function classifyN8nNode(rawType: string): {
  category: N8nNodeCategory;
  shortType: string;
  isStickyNote: boolean;
  isSubNode: boolean;
} {
  const lower = rawType.toLowerCase();
  const rawSeg = rawType.includes(".") ? rawType.slice(rawType.lastIndexOf(".") + 1) : rawType;
  const segLower = rawSeg.toLowerCase();

  if (lower === "n8n-nodes-base.stickynote" || segLower === "stickynote") {
    return { category: "note", shortType: "Note", isStickyNote: true, isSubNode: false };
  }
  const isSubNode =
    lower.includes("langchain") &&
    (segLower.startsWith("lm") ||
      segLower.startsWith("memory") ||
      segLower.startsWith("tool") ||
      segLower.startsWith("vectorstore") ||
      segLower.startsWith("embeddings") ||
      segLower.startsWith("outputparser"));

  if (
    segLower.includes("trigger") ||
    segLower === "webhook" ||
    segLower === "cron" ||
    segLower === "start"
  ) {
    return { category: "trigger", shortType: rawSeg, isStickyNote: false, isSubNode: false };
  }
  if (
    lower.includes("langchain") ||
    segLower === "agent" ||
    segLower.includes("openai") ||
    segLower.includes("anthropic") ||
    segLower.includes("gemini") ||
    segLower.includes("ollama")
  ) {
    return { category: "ai", shortType: rawSeg, isStickyNote: false, isSubNode };
  }
  if (FLOW_SEGMENTS.has(segLower)) {
    return { category: "flow", shortType: rawSeg, isStickyNote: false, isSubNode: false };
  }
  if (CODE_SEGMENTS.has(segLower)) {
    return { category: "code", shortType: rawSeg, isStickyNote: false, isSubNode: false };
  }
  if (segLower.includes("http") || segLower === "graphql") {
    return { category: "http", shortType: rawSeg, isStickyNote: false, isSubNode: false };
  }
  return { category: "integration", shortType: rawSeg, isStickyNote: false, isSubNode: false };
}

function computeCubicPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  isSubLink: boolean,
): { svgPath: string; midX: number; midY: number } {
  if (isSubLink) {
    const dy = Math.max(40, Math.abs(y2 - y1) * 0.5);
    const cy1 = y1 - dy;
    const cy2 = y2 + dy;
    return {
      svgPath: `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
    };
  }
  const dx = Math.max(64, Math.abs(x2 - x1) * 0.48);
  const cx1 = x1 + dx;
  const cx2 = x2 - dx;
  return {
    svgPath: `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

/**
 * Tente de parser une chaîne JSON comme un workflow n8n valide (`nodes` + `connections`).
 * Retourne `null` si le JSON n'est pas un workflow n8n (permettant à `ChatMarkdown` d'afficher
 * les blocs `json` ordinaires normalement sans faux positifs).
 */
export function parseN8nWorkflowJson(source: string): ParsedN8nWorkflow | null {
  if (!source || !source.includes('"nodes"')) return null;
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    root = parsed as Record<string, unknown>;
  } catch {
    // Supporte également une enveloppe `{ workflow: { nodes, connections } }`
    return null;
  }

  const candidate =
    Array.isArray(root.nodes)
      ? root
      : root.workflow && typeof root.workflow === "object" && !Array.isArray(root.workflow)
        ? (root.workflow as Record<string, unknown>)
        : null;

  if (!candidate || !Array.isArray(candidate.nodes) || candidate.nodes.length === 0) {
    return null;
  }
  if (candidate.nodes.length > 250) {
    return null;
  }

  // Au moins un nœud doit posséder `type` et (`name` ou `parameters` ou `position`) typiques de n8n
  const looksLikeN8n = candidate.nodes.every(
    (n) =>
      n &&
      typeof n === "object" &&
      typeof (n as Record<string, unknown>).type === "string" &&
      typeof (n as Record<string, unknown>).name === "string",
  );
  if (!looksLikeN8n) return null;

  const hasConnectionsObj =
    candidate.connections !== undefined &&
    typeof candidate.connections === "object" &&
    candidate.connections !== null &&
    !Array.isArray(candidate.connections);
  const hasN8nNodePrefix = candidate.nodes.some((n) => {
    const t = String((n as Record<string, unknown>).type);
    return t.includes("n8n-nodes-") || t.includes("@n8n/");
  });

  if (!hasConnectionsObj && !hasN8nNodePrefix) {
    return null;
  }

  const parsedNodes: ParsedN8nNode[] = [];
  const nodeByName = new Map<string, ParsedN8nNode>();

  candidate.nodes.forEach((rawNode, index) => {
    const rec = rawNode as Record<string, unknown>;
    const name = String(rec.name || `Nœud ${index + 1}`);
    const type = String(rec.type || "n8n-nodes-base.noOp");
    const info = classifyN8nNode(type);
    const params =
      rec.parameters && typeof rec.parameters === "object" && !Array.isArray(rec.parameters)
        ? (rec.parameters as Record<string, unknown>)
        : {};

    const pos = Array.isArray(rec.position) ? rec.position : null;
    const rawX = pos && typeof pos[0] === "number" && Number.isFinite(pos[0]) ? pos[0] : index * 280;
    const rawY = pos && typeof pos[1] === "number" && Number.isFinite(pos[1]) ? pos[1] : (index % 2) * 110;

    const width = info.isStickyNote
      ? Math.min(600, Math.max(220, Number(params.width) || 280))
      : info.isSubNode
        ? SUB_NODE_WIDTH
        : NODE_WIDTH;
    const height = info.isStickyNote
      ? Math.min(420, Math.max(110, Number(params.height) || 140))
      : info.isSubNode
        ? SUB_NODE_HEIGHT
        : NODE_HEIGHT;

    const segLower = info.shortType.toLowerCase();
    const nodeObj: ParsedN8nNode = {
      id: typeof rec.id === "string" && rec.id ? rec.id : `node-${index}`,
      name,
      type,
      shortType: info.shortType,
      typeVersion: typeof rec.typeVersion === "number" ? rec.typeVersion : undefined,
      category: info.category,
      categoryLabelFr: CATEGORY_LABELS_FR[info.category],
      x: rawX,
      y: rawY,
      width,
      height,
      disabled: rec.disabled === true,
      isStickyNote: info.isStickyNote,
      isSubNode: info.isSubNode,
      notes:
        info.isStickyNote && typeof params.content === "string"
          ? params.content
          : typeof rec.notes === "string"
            ? rec.notes
            : undefined,
      sanitizedParameters: sanitizeNodeParams(params) as Record<string, unknown>,
      outputLabels: BRANCH_LABELS_FR[segLower] ?? null,
    };

    parsedNodes.push(nodeObj);
    nodeByName.set(name, nodeObj);
  });

  // Si tous les nœuds sont superposés à (0,0), appliquer un placement horizontal lisible
  const nonSticky = parsedNodes.filter((n) => !n.isStickyNote);
  if (
    nonSticky.length > 1 &&
    nonSticky.every((n) => n.x === nonSticky[0]!.x && n.y === nonSticky[0]!.y)
  ) {
    nonSticky.forEach((n, idx) => {
      n.x = idx * 270;
      n.y = n.isSubNode ? 150 : 0;
    });
  }

  const edges: ParsedN8nEdge[] = [];
  if (hasConnectionsObj) {
    const connMap = candidate.connections as Record<string, unknown>;
    let edgeCounter = 0;
    for (const [fromName, outputsByType] of Object.entries(connMap)) {
      const fromNode = nodeByName.get(fromName);
      if (!fromNode || !outputsByType || typeof outputsByType !== "object") continue;

      for (const [connType, branches] of Object.entries(outputsByType as Record<string, unknown>)) {
        if (!Array.isArray(branches)) continue;
        const totalOutputs = Math.max(1, branches.length);

        branches.forEach((targets, outputIdx) => {
          if (!Array.isArray(targets)) return;
          for (const target of targets) {
            if (!target || typeof target !== "object") continue;
            const tRec = target as Record<string, unknown>;
            const toName = typeof tRec.node === "string" ? tRec.node : "";
            const toNode = nodeByName.get(toName);
            if (!toNode) continue;

            const inputIdx = typeof tRec.index === "number" ? tRec.index : 0;
            const isSub = connType !== "main" || fromNode.isSubNode;

            const startX = isSub ? fromNode.x + fromNode.width / 2 : fromNode.x + fromNode.width;
            const startY = isSub
              ? fromNode.y
              : fromNode.y + (fromNode.height * (outputIdx + 1)) / (totalOutputs + 1);

            const endX = isSub ? toNode.x + toNode.width / 2 : toNode.x;
            const endY = isSub ? toNode.y + toNode.height : toNode.y + toNode.height / 2;

            const { svgPath, midX, midY } = computeCubicPath(startX, startY, endX, endY, isSub);
            const branchLabel =
              connType === "main" && fromNode.outputLabels?.[outputIdx]
                ? fromNode.outputLabels[outputIdx]
                : connType !== "main"
                  ? connType.replace(/^ai_/, "IA · ")
                  : undefined;

            edges.push({
              id: `edge-${edgeCounter++}`,
              from: fromName,
              to: toName,
              outputIndex: outputIdx,
              inputIndex: inputIdx,
              connectionType: connType,
              label: branchLabel,
              svgPath,
              midX,
              midY,
            });
          }
        });
      }
    }
  }

  const pad = 44;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of parsedNodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 200;
  }

  const rawUrl = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const externalUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : null;

  return {
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : "Workflow n8n",
    nodes: parsedNodes,
    edges,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
      width: Math.max(320, maxX - minX + pad * 2),
      height: Math.max(180, maxY - minY + pad * 2),
    },
    externalUrl,
  };
}
