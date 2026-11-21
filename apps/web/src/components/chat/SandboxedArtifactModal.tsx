import { ChatMarkdown, N8nWorkflowCanvas, parseN8nWorkflowJson } from "@rakazo/chat-ui/web";
import { useEffect, useMemo, useState } from "react";
import { decodeArtifactBase64 } from "../../lib/artifact-open";
import { rpc } from "../../lib/rpc";

/**
 * Politique Content-Security-Policy zéro-réseau inspirée de n8n-io/nod (`attachment-frame.tsx`) :
 * - Aucun accès réseau sortant (`default-src 'none'; connect-src 'none'; form-action 'none'`)
 * - Aucun accès `allow-same-origin` dans l'attribut `sandbox` (isolation d'origine opaque stricte)
 * - Transmission sécurisée de la touche `Escape` vers le parent pour fermeture clavier fluide
 */
export const ZERO_NETWORK_ARTIFACT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

const ESCAPE_FORWARDER_SCRIPT =
  "<script>addEventListener('keydown',function(e){if(e.key==='Escape')parent.postMessage('rakazo:artifact-close','*')},true)</script>";

export function buildSandboxedSrcDoc(rawHtml: string): string {
  const safeCspMeta = `<meta http-equiv="Content-Security-Policy" content="${ZERO_NETWORK_ARTIFACT_CSP}"><meta name="referrer" content="no-referrer">`;
  return `<!doctype html><html><head><meta charset="utf-8">${safeCspMeta}</head><body>${ESCAPE_FORWARDER_SCRIPT}${rawHtml}</body></html>`;
}

export function isPreviewableArtifact(name: string, mimeType: string): boolean {
  const lowerName = (name || "").trim().toLowerCase();
  const lowerMime = (mimeType || "").trim().toLowerCase();
  if (
    lowerMime === "text/html" ||
    lowerMime === "image/svg+xml" ||
    lowerMime === "text/markdown" ||
    lowerMime === "application/json"
  ) {
    return true;
  }
  return (
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm") ||
    lowerName.endsWith(".svg") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown") ||
    lowerName.endsWith(".json")
  );
}

export interface SandboxedArtifactModalProps {
  name: string;
  mimeType: string;
  contentText: string;
  onClose: () => void;
  onDownload?: () => void;
}

export function SandboxedArtifactModal({
  name,
  mimeType,
  contentText,
  onClose,
  onDownload,
}: SandboxedArtifactModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data === "rakazo:artifact-close") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, [onClose]);

  const lowerName = name.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  const parsedWorkflow = useMemo(() => {
    if (lowerMime === "application/json" || lowerName.endsWith(".json")) {
      return parseN8nWorkflowJson(contentText);
    }
    return null;
  }, [contentText, lowerMime, lowerName]);

  const isMarkdown = lowerMime === "text/markdown" || lowerName.endsWith(".md") || lowerName.endsWith(".markdown");
  const isHtmlOrSvg =
    lowerMime === "text/html" ||
    lowerMime === "image/svg+xml" ||
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm") ||
    lowerName.endsWith(".svg");

  const srcDoc = useMemo(() => {
    if (!isHtmlOrSvg) return "";
    return buildSandboxedSrcDoc(contentText);
  }, [contentText, isHtmlOrSvg]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu sécurisé : ${name}`}
      data-testid="sandboxed-artifact-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[90dvh] sm:h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[20px] sm:rounded-[20px] border border-[#2B2B33] bg-[#131317] shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#25252C] bg-[#18181E] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              Bac à sable isolé · Zéro réseau
            </span>
            <h2 className="truncate text-[14.5px] font-semibold text-[#F2F2F5]">{name}</h2>
          </div>

          <div className="flex items-center gap-2">
            {onDownload ? (
              <button
                type="button"
                onClick={onDownload}
                className="min-h-[44px] sm:min-h-[34px] rounded-lg border border-[#32323C] bg-[#22222A] px-3 py-1.5 text-[13px] font-medium text-[#E4E4E8] hover:bg-[#2B2B35] cursor-pointer"
              >
                Télécharger
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer l'aperçu"
              data-testid="close-sandboxed-artifact"
              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] rounded-lg border border-[#32323C] bg-[#22222A] px-3 py-1.5 text-[13px] font-medium text-[#E4E4E8] hover:bg-[#2B2B35] cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-[#0E0E12] p-3 sm:p-5">
          {parsedWorkflow ? (
            <N8nWorkflowCanvas workflow={parsedWorkflow} rawSource={contentText} />
          ) : isHtmlOrSvg ? (
            <iframe
              title={`Contenu isolé : ${name}`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={srcDoc}
              data-testid="sandboxed-artifact-iframe"
              className="h-full min-h-[420px] w-full rounded-xl border border-[#27272F] bg-white"
            />
          ) : isMarkdown ? (
            <div className="mx-auto max-w-3xl rounded-xl border border-[#26262E] bg-[#16161B] p-4 sm:p-6 text-[#E4E4EA]">
              <ChatMarkdown>{contentText}</ChatMarkdown>
            </div>
          ) : (
            <pre className="overflow-auto rounded-xl border border-[#26262E] bg-[#141418] p-4 font-mono text-[12.5px] text-[#E4E4EA]">
              <code>{contentText}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export interface ArtifactFileCardProps {
  botId: string;
  artifactId: string;
  name: string;
  mimeType: string;
  formattedSize: string;
  onDownload: () => void;
}

export function ArtifactFileCard({
  botId,
  artifactId,
  name,
  mimeType,
  formattedSize,
  onDownload,
}: ArtifactFileCardProps) {
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const canPreview = isPreviewableArtifact(name, mimeType);

  async function handleOpenPreview() {
    if (loadingPreview) return;
    setLoadingPreview(true);
    try {
      const artifact = await rpc.artifacts.get({ botId, artifactId });
      const bytes = decodeArtifactBase64(artifact.contentBase64);
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      setPreviewText(decoded);
    } catch {
      onDownload();
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <>
      <div className="flex max-w-[98%] sm:max-w-[380px] flex-col gap-2 rounded-[20px] border border-[#26262A] bg-[#17171A] px-4 py-3 text-left text-[14px] text-[#DFDFE2]">
        <button
          type="button"
          onClick={onDownload}
          className="text-left hover:opacity-90 cursor-pointer"
        >
          <div className="font-medium break-words">{name}</div>
          <div className="mt-1 text-[#85858A]">
            {mimeType} · {formattedSize}
          </div>
        </button>
        {canPreview ? (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleOpenPreview()}
              disabled={loadingPreview}
              data-testid="open-sandboxed-preview-btn"
              className="min-h-[44px] sm:min-h-[32px] rounded-full border border-[#34343E] bg-[#212129] px-3 py-1 text-[12.5px] font-medium text-[#ECECEF] hover:bg-[#2A2A34] disabled:opacity-60 cursor-pointer"
            >
              {loadingPreview ? "Chargement…" : "Aperçu sécurisé"}
            </button>
          </div>
        ) : null}
      </div>

      {previewText !== null ? (
        <SandboxedArtifactModal
          name={name}
          mimeType={mimeType}
          contentText={previewText}
          onClose={() => setPreviewText(null)}
          onDownload={onDownload}
        />
      ) : null}
    </>
  );
}
