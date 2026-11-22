import { ChatMarkdown, N8nWorkflowCanvas, parseN8nWorkflowJson } from "@rakazo/chat-ui/web";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildSandboxedSrcDoc,
  isPreviewableArtifact,
  SandboxedArtifactModal,
  ZERO_NETWORK_ARTIFACT_CSP,
} from "../components/chat/SandboxedArtifactModal";

const SAMPLE_N8N_WORKFLOW = JSON.stringify(
  {
    name: "Relance Factures Clients",
    nodes: [
      {
        id: "n1",
        name: "Chaque Matin 8h",
        type: "n8n-nodes-base.scheduleTrigger",
        position: [100, 200],
        parameters: { rule: "0 8 * * 1-5" },
      },
      {
        id: "n2",
        name: "Vérifier Retard",
        type: "n8n-nodes-base.if",
        position: [380, 200],
        parameters: { daysOverdue: 15, apiKey: "super-secret-value-should-be-masked" },
      },
      {
        id: "n3",
        name: "Agent Relance IA",
        type: "@n8n/n8n-nodes-langchain.agent",
        position: [680, 140],
        parameters: { systemMessage: "Rédige un rappel courtois." },
      },
    ],
    connections: {
      "Chaque Matin 8h": {
        main: [[{ node: "Vérifier Retard", type: "main", index: 0 }]],
      },
      "Vérifier Retard": {
        main: [[{ node: "Agent Relance IA", type: "main", index: 0 }], []],
      },
    },
  },
  null,
  2,
);

describe("n8n-io/nod Web UI — Native n8n Workflow Canvas & Zero-Network CSP Artifact Frame", () => {
  it("parses valid n8n workflow JSON, masks secret node parameters, and ignores plain non-n8n JSON", () => {
    const parsed = parseN8nWorkflowJson(SAMPLE_N8N_WORKFLOW);
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe("Relance Factures Clients");
    expect(parsed?.nodes).toHaveLength(3);
    expect(parsed?.edges).toHaveLength(2);
    expect(parsed?.edges[1]?.label).toBe("vrai");

    const ifNode = parsed?.nodes.find((n) => n.id === "n2");
    expect(ifNode?.sanitizedParameters.apiKey).toBe("[MASQUÉ]");

    // Regular JSON objects must NOT trigger false-positive n8n canvas rendering
    expect(parseN8nWorkflowJson('{"status":"ok","items":[1,2,3]}')).toBeNull();
  });

  it("renders interactive French N8nWorkflowCanvas inside ChatMarkdown and supports node inspection & JSON mode", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown>{`Voici le workflow généré :\n\n\`\`\`n8n\n${SAMPLE_N8N_WORKFLOW}\n\`\`\``}</ChatMarkdown>,
    );

    expect(html).toContain('data-testid="n8n-workflow-canvas"');
    expect(html).toContain("Relance Factures Clients");
    expect(html).toContain("3 nœuds · 2 liaisons");
    expect(html).toContain("Chaque Matin 8h");
    expect(html).toContain("Agent Relance IA");

    const parsed = parseN8nWorkflowJson(SAMPLE_N8N_WORKFLOW)!;
    const inspectorHtml = renderToStaticMarkup(
      <N8nWorkflowCanvas
        workflow={parsed}
        rawSource={SAMPLE_N8N_WORKFLOW}
        initialSelectedNodeId="n2"
      />,
    );
    expect(inspectorHtml).toContain('data-testid="n8n-node-inspector"');
    expect(inspectorHtml).toContain("n8n-nodes-base.if");
    expect(inspectorHtml).toContain("[MASQUÉ]");
    expect(inspectorHtml).not.toContain("super-secret-value-should-be-masked");

    const jsonModeHtml = renderToStaticMarkup(
      <N8nWorkflowCanvas workflow={parsed} rawSource={SAMPLE_N8N_WORKFLOW} initialShowJson />,
    );
    expect(jsonModeHtml).toContain("Graphe visuel");
  });

  it("keeps incomplete streaming n8n fences as safe <pre> code until closing fence arrives", () => {
    const partial = `\`\`\`n8n\n${SAMPLE_N8N_WORKFLOW.slice(0, 140)}`;
    const html = renderToStaticMarkup(<ChatMarkdown streaming>{partial}</ChatMarkdown>);
    expect(html).not.toContain('data-testid="n8n-workflow-canvas"');
    expect(html).toContain("<pre>");
  });

  it("enforces strict zero-network CSP and opaque sandbox without allow-same-origin in SandboxedArtifactModal", () => {
    expect(isPreviewableArtifact("rapport.html", "text/html")).toBe(true);
    expect(isPreviewableArtifact("workflow.json", "application/json")).toBe(true);
    expect(isPreviewableArtifact("archive.zip", "application/zip")).toBe(false);

    const srcDoc = buildSandboxedSrcDoc("<h1>Rapport Mensuel</h1>");
    expect(srcDoc).toContain(ZERO_NETWORK_ARTIFACT_CSP);
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc).toContain("connect-src 'none'");
    expect(srcDoc).toContain("form-action 'none'");

    const modalHtml = renderToStaticMarkup(
      <SandboxedArtifactModal
        name="tableau-de-bord.html"
        mimeType="text/html"
        contentText="<h1>Tableau de Bord</h1>"
        onClose={vi.fn()}
      />,
    );

    expect(modalHtml).toContain('data-testid="sandboxed-artifact-iframe"');
    expect(modalHtml).toContain('sandbox="allow-scripts"');
    expect(modalHtml).not.toContain("allow-same-origin");
    expect(modalHtml).toContain('referrerPolicy="no-referrer"');
    expect(modalHtml).toContain("Bac à sable isolé · Zéro réseau");

    // Verify JSON n8n workflow artifacts automatically render the visual canvas inside the modal
    const workflowModalHtml = renderToStaticMarkup(
      <SandboxedArtifactModal
        name="relance-factures.json"
        mimeType="application/json"
        contentText={SAMPLE_N8N_WORKFLOW}
        onClose={vi.fn()}
      />,
    );
    expect(workflowModalHtml).toContain('data-testid="n8n-workflow-canvas"');
  });
});
