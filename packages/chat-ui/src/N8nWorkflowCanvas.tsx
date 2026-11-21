import { useMemo, useState } from "react";
import type { N8nNodeCategory, ParsedN8nNode, ParsedN8nWorkflow } from "./n8n-workflow";

const CATEGORY_ACCENTS: Record<
  N8nNodeCategory,
  { stroke: string; badgeBg: string; badgeText: string; dot: string }
> = {
  trigger: {
    stroke: "#34D399",
    badgeBg: "rgba(52, 211, 153, 0.14)",
    badgeText: "#6EE7B7",
    dot: "#10B981",
  },
  ai: {
    stroke: "#C084FC",
    badgeBg: "rgba(192, 132, 252, 0.15)",
    badgeText: "#D8B4FE",
    dot: "#A855F7",
  },
  flow: {
    stroke: "#FBBF24",
    badgeBg: "rgba(251, 191, 36, 0.14)",
    badgeText: "#FCD34D",
    dot: "#F59E0B",
  },
  code: {
    stroke: "#38BDF8",
    badgeBg: "rgba(56, 189, 248, 0.14)",
    badgeText: "#7DD3FC",
    dot: "#0EA5E9",
  },
  http: {
    stroke: "#FB7185",
    badgeBg: "rgba(251, 113, 133, 0.14)",
    badgeText: "#FDA4AF",
    dot: "#F43F5E",
  },
  note: {
    stroke: "#52525B",
    badgeBg: "rgba(161, 161, 170, 0.12)",
    badgeText: "#D4D4D8",
    dot: "#71717A",
  },
  integration: {
    stroke: "#818CF8",
    badgeBg: "rgba(129, 140, 248, 0.14)",
    badgeText: "#A5B4FC",
    dot: "#6366F1",
  },
};

function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}

export interface N8nWorkflowCanvasProps {
  workflow: ParsedN8nWorkflow;
  rawSource?: string;
  initialSelectedNodeId?: string | null;
  initialShowJson?: boolean;
}

export function N8nWorkflowCanvas({
  workflow,
  rawSource,
  initialSelectedNodeId = null,
  initialShowJson = false,
}: N8nWorkflowCanvasProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [showJson, setShowJson] = useState<boolean>(initialShowJson);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialSelectedNodeId);

  const selectedNode: ParsedN8nNode | undefined = useMemo(
    () => workflow.nodes.find((n) => n.id === selectedNodeId),
    [workflow.nodes, selectedNodeId],
  );

  const actionNodesCount = useMemo(
    () => workflow.nodes.filter((n) => !n.isStickyNote).length,
    [workflow.nodes],
  );

  const stickyNotes = useMemo(
    () => workflow.nodes.filter((n) => n.isStickyNote),
    [workflow.nodes],
  );
  const regularNodes = useMemo(
    () => workflow.nodes.filter((n) => !n.isStickyNote),
    [workflow.nodes],
  );

  const scaledWidth = Math.round(workflow.bounds.width * zoom);
  const scaledHeight = Math.round(workflow.bounds.height * zoom);

  return (
    <section
      className="rk-n8n-canvas-card"
      data-testid="n8n-workflow-canvas"
      aria-label={`Workflow n8n : ${workflow.name}`}
    >
      <header className="rk-n8n-canvas-header">
        <div className="rk-n8n-canvas-title-group">
          <span className="rk-n8n-badge-pill">n8n</span>
          <strong className="rk-n8n-workflow-title">{workflow.name}</strong>
          <span className="rk-n8n-meta">
            {actionNodesCount} {actionNodesCount > 1 ? "nœuds" : "nœud"} · {workflow.edges.length}{" "}
            {workflow.edges.length > 1 ? "liaisons" : "liaison"}
          </span>
        </div>

        <div className="rk-n8n-toolbar" role="toolbar" aria-label="Contrôles du canevas n8n">
          {!showJson ? (
            <>
              <button
                type="button"
                className="rk-n8n-btn"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))))}
                aria-label="Réduire le zoom"
                title="Zoom arrière"
              >
                −
              </button>
              <button
                type="button"
                className="rk-n8n-btn"
                onClick={() => setZoom(1)}
                aria-label="Ajuster le zoom à 100 %"
                title="Réinitialiser la vue"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="rk-n8n-btn"
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.2).toFixed(2))))}
                aria-label="Augmenter le zoom"
                title="Zoom avant"
              >
                +
              </button>
            </>
          ) : null}

          {rawSource ? (
            <button
              type="button"
              className="rk-n8n-btn rk-n8n-btn-toggle"
              onClick={() => setShowJson((prev) => !prev)}
              data-testid="n8n-toggle-json"
            >
              {showJson ? "Graphe visuel" : "Code JSON"}
            </button>
          ) : null}

          {workflow.externalUrl ? (
            <a
              href={workflow.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="rk-n8n-btn rk-n8n-btn-accent"
            >
              Ouvrir dans n8n ↗
            </a>
          ) : null}
        </div>
      </header>

      {showJson && rawSource ? (
        <pre className="rk-n8n-json-view">
          <code>{rawSource}</code>
        </pre>
      ) : (
        <div className="rk-n8n-viewport">
          <svg
            viewBox={`${workflow.bounds.minX} ${workflow.bounds.minY} ${workflow.bounds.width} ${workflow.bounds.height}`}
            width={scaledWidth}
            height={scaledHeight}
            className="rk-n8n-svg"
            role="img"
            aria-label={`Schéma du workflow ${workflow.name}`}
          >
            <defs>
              <pattern
                id="rk-n8n-grid"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.07)" />
              </pattern>
            </defs>

            <rect
              x={workflow.bounds.minX}
              y={workflow.bounds.minY}
              width={workflow.bounds.width}
              height={workflow.bounds.height}
              fill="url(#rk-n8n-grid)"
            />

            {/* Notes adhésives en arrière-plan */}
            {stickyNotes.map((note) => (
              <g key={note.id} transform={`translate(${note.x}, ${note.y})`}>
                <rect
                  width={note.width}
                  height={note.height}
                  rx={10}
                  fill="rgba(250, 204, 21, 0.06)"
                  stroke="rgba(250, 204, 21, 0.24)"
                  strokeDasharray="4 3"
                />
                <text x={12} y={24} fill="#FDE68A" fontSize={12} fontWeight={600}>
                  {truncateLabel(note.name, 34)}
                </text>
                {note.notes ? (
                  <text x={12} y={44} fill="#A1A1AA" fontSize={11}>
                    {truncateLabel(note.notes.replace(/\s+/g, " "), 46)}
                  </text>
                ) : null}
              </g>
            ))}

            {/* Liaisons Bézier */}
            {workflow.edges.map((edge) => {
              const isSub = edge.connectionType !== "main";
              return (
                <g key={edge.id}>
                  <path
                    d={edge.svgPath}
                    fill="none"
                    stroke={isSub ? "rgba(192, 132, 252, 0.55)" : "rgba(161, 161, 170, 0.55)"}
                    strokeWidth={isSub ? 1.6 : 2}
                    strokeDasharray={isSub ? "5 4" : undefined}
                  />
                  {edge.label ? (
                    <g transform={`translate(${edge.midX}, ${edge.midY})`}>
                      <rect
                        x={-28}
                        y={-10}
                        width={56}
                        height={19}
                        rx={6}
                        fill="#18181C"
                        stroke="#2E2E36"
                      />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fill="#D4D4D8"
                        fontSize={10}
                        fontWeight={500}
                      >
                        {truncateLabel(edge.label, 10)}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {/* Nœuds interactifs */}
            {regularNodes.map((node) => {
              const palette = CATEGORY_ACCENTS[node.category];
              const isSelected = node.id === selectedNodeId;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() =>
                    setSelectedNodeId((prev) => (prev === node.id ? null : node.id))
                  }
                  style={{ cursor: "pointer", opacity: node.disabled ? 0.52 : 1 }}
                  data-testid={`n8n-node-${node.id}`}
                >
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={13}
                    fill="#18181D"
                    stroke={isSelected ? palette.stroke : "#2E2E36"}
                    strokeWidth={isSelected ? 2.2 : 1.3}
                  />
                  {/* Barre latérale d'accent de catégorie */}
                  <rect
                    x={0}
                    y={10}
                    width={4}
                    height={node.height - 20}
                    rx={2}
                    fill={palette.dot}
                  />
                  {/* Ports d'entrée et sortie */}
                  {node.category !== "trigger" && !node.isSubNode ? (
                    <circle
                      cx={0}
                      cy={node.height / 2}
                      r={4.2}
                      fill="#27272A"
                      stroke={palette.stroke}
                      strokeWidth={1.5}
                    />
                  ) : null}
                  {!node.isSubNode ? (
                    <circle
                      cx={node.width}
                      cy={node.height / 2}
                      r={4.2}
                      fill="#27272A"
                      stroke={palette.stroke}
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      cx={node.width / 2}
                      cy={0}
                      r={4.2}
                      fill="#27272A"
                      stroke={palette.stroke}
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Badge catégorie */}
                  <rect
                    x={12}
                    y={10}
                    width={Math.min(node.width - 24, node.categoryLabelFr.length * 6.5 + 14)}
                    height={18}
                    rx={5}
                    fill={palette.badgeBg}
                  />
                  <text
                    x={19}
                    y={22.5}
                    fill={palette.badgeText}
                    fontSize={10}
                    fontWeight={600}
                  >
                    {node.categoryLabelFr}
                  </text>

                  {/* Nom du nœud */}
                  <text
                    x={12}
                    y={43}
                    fill="#F4F4F5"
                    fontSize={12.5}
                    fontWeight={600}
                  >
                    {truncateLabel(node.name, node.isSubNode ? 20 : 25)}
                  </text>

                  {/* Sous-type technique */}
                  <text x={12} y={60} fill="#8E8E98" fontSize={10.5}>
                    {truncateLabel(node.shortType, 26)}
                    {node.disabled ? " · désactivé" : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {selectedNode && !showJson ? (
        <div className="rk-n8n-inspector" data-testid="n8n-node-inspector">
          <div className="rk-n8n-inspector-head">
            <div>
              <strong>{selectedNode.name}</strong>
              <span className="rk-n8n-inspector-type">
                {selectedNode.type}
                {selectedNode.typeVersion ? ` (v${selectedNode.typeVersion})` : ""}
              </span>
            </div>
            <button
              type="button"
              className="rk-n8n-btn"
              onClick={() => setSelectedNodeId(null)}
              aria-label="Fermer l'inspecteur du nœud"
            >
              Fermer
            </button>
          </div>
          {selectedNode.notes ? (
            <p className="rk-n8n-inspector-notes">{selectedNode.notes}</p>
          ) : null}
          {Object.keys(selectedNode.sanitizedParameters).length > 0 ? (
            <pre className="rk-n8n-inspector-params">
              <code>{JSON.stringify(selectedNode.sanitizedParameters, null, 2)}</code>
            </pre>
          ) : (
            <p className="rk-n8n-inspector-empty">Aucun paramètre configuré sur ce nœud.</p>
          )}
        </div>
      ) : (
        !showJson && (
          <footer className="rk-n8n-footer-hint">
            Touchez ou cliquez sur un nœud pour inspecter sa configuration.
          </footer>
        )
      )}
    </section>
  );
}
