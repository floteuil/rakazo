import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Skill, SkillSummary } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  FileCode,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SkillItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  content?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillCardProps {
  id: string;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  sizeBytes?: number;
  onSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onPreview?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export interface SkillLibraryOverlayProps {
  skills?: SkillItem[];
  searchQuery?: string;
  selectedTag?: string;
  onClose?: () => void;
  onSelectSkill?: (skill: SkillItem) => void;
}

type ViewMode = "catalog" | "editor" | "preview";

// ============================================================================
// HELPER FUNCTIONS: FRONTMATTER & SIZE UTILITIES
// ============================================================================

export function getByteLength(str: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return typeof Buffer !== "undefined"
    ? Buffer.byteLength(str, "utf8")
    : encodeURI(str).split(/%..|./).length - 1;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export interface ParsedMarkdownSkill {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  content: string;
  metadata: Record<string, unknown>;
}

export function parseMarkdownContent(rawText: string, filename?: string): ParsedMarkdownSkill {
  const frontmatterMatch = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  let name = "";
  let slug = "";
  let description = "";
  const tags: string[] = [];
  const metadata: Record<string, unknown> = {};
  let content = rawText;

  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1] ?? "";
    content = (frontmatterMatch[2] ?? "").trim();

    const lines = yamlBlock.split(/\r?\n/);
    let currentKey = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (trimmed.startsWith("- ") && currentKey === "tags") {
        const item = trimmed
          .slice(2)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        if (item) tags.push(item);
        continue;
      }

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
        let value = trimmed.slice(colonIdx + 1).trim();
        currentKey = key;

        // Strip quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1).trim();
        }

        if (key === "name" || key === "title") {
          name = value;
        } else if (key === "slug" || key === "id") {
          slug = slugify(value);
        } else if (key === "description" || key === "summary") {
          description = value;
        } else if (key === "tags" || key === "keywords") {
          if (value.startsWith("[") && value.endsWith("]")) {
            const parsedTags = value
              .slice(1, -1)
              .split(",")
              .map((t) => t.trim().replace(/^['"]|['"]$/g, ""))
              .filter(Boolean);
            tags.push(...parsedTags);
          } else if (value) {
            const parsedTags = value
              .split(",")
              .map((t) => t.trim().replace(/^['"]|['"]$/g, ""))
              .filter(Boolean);
            tags.push(...parsedTags);
          }
        } else if (value) {
          metadata[key] = value;
        }
      }
    }
  }

  // Fallback: extract title from H1 or filename
  if (!name) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
      name = h1Match[1].trim();
    } else if (filename) {
      name = filename
        .replace(/\.(md|markdown|txt)$/i, "")
        .replace(/[-_]+/g, " ")
        .trim();
    } else {
      name = "Nouvelle compétence";
    }
  }

  if (!slug) {
    slug = slugify(name);
  }

  // Fallback: extract description from first text paragraph
  if (!description) {
    const lines = content.split(/\r?\n/);
    for (const l of lines) {
      const trimmed = l.trim();
      if (
        trimmed &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("```") &&
        !trimmed.startsWith(">")
      ) {
        description = trimmed.slice(0, 300);
        break;
      }
    }
  }

  return {
    name,
    slug,
    description,
    tags: Array.from(new Set(tags)),
    content,
    metadata,
  };
}

// ============================================================================
// BADGE & CARD COMPONENTS
// ============================================================================

export function SkillSizeBadge({ sizeBytes = 0 }: { sizeBytes?: number }) {
  const isDirect = sizeBytes < 4096;
  if (isDirect) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        &lt; 4 Ko : Direct
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      {(sizeBytes / 1024).toFixed(1)} Ko : Indexé
    </span>
  );
}

export function SkillCard({
  id,
  name,
  slug,
  description,
  tags,
  sizeBytes = 0,
  onSelect,
  onEdit,
  onPreview,
  onDelete,
}: SkillCardProps) {
  return (
    <div
      data-testid={`skill-card-${id}`}
      className="group relative flex flex-col justify-between rounded-xl border border-[#26262A] bg-[#17171A] p-4 transition-all hover:border-[#3F3F46] hover:shadow-lg hover:shadow-black/30"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[#EDEDEF] text-sm leading-tight group-hover:text-white transition-colors">
            {name}
          </h3>
          <SkillSizeBadge sizeBytes={sizeBytes} />
        </div>
        <p className="mt-1 text-xs text-[#71717A] font-mono">{slug}</p>
        <p className="mt-2 text-xs text-[#A1A1AA] line-clamp-2 leading-relaxed">
          {description || "Aucune description fournie"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#26262A] pt-3">
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded bg-[#232326] px-1.5 py-0.5 text-[10px] font-medium text-[#A1A1AA]"
            >
              #{t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {onPreview ? (
            <>
              <button
                type="button"
                onClick={() => onPreview(id)}
                className="text-xs text-[#A1A1AA] hover:text-white transition-colors flex items-center gap-1"
                title="Prévisualiser"
              >
                Prévisualiser
              </button>
              <span className="text-[#3F3F46]">•</span>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit?.(id)}
            className="text-xs text-[#A1A1AA] hover:text-white transition-colors"
          >
            Éditer
          </button>
          <span className="text-[#3F3F46]">•</span>
          <button
            type="button"
            onClick={() => onDelete?.(id)}
            className="text-xs text-rose-400/80 hover:text-rose-300 transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN OVERLAY COMPONENT
// ============================================================================

export function SkillLibraryOverlay({
  skills: initialSkills,
  searchQuery: initialSearchQuery = "",
  selectedTag: initialSelectedTag = "Tous",
  onClose,
  onSelectSkill,
}: SkillLibraryOverlayProps) {
  const [skills, setSkills] = useState<SkillItem[]>(initialSkills ?? []);
  const [loading, setLoading] = useState(!initialSkills);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedTag, setSelectedTag] = useState(initialSelectedTag);
  const [viewMode, setViewMode] = useState<ViewMode>("catalog");

  // Editor State
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorSlug, setEditorSlug] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorTags, setEditorTags] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Deletion State
  const [deleteTarget, setDeleteTarget] = useState<SkillItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  // Load skills via RPC if not supplied via props
  async function refreshSkills() {
    if (initialSkills) return;
    try {
      setLoading(true);
      const list = await rpc.skills.list({});
      const formatted: SkillItem[] = list.map((s: SkillSummary) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        tags: s.tags,
        metadata: s.metadata,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        sizeBytes:
          s.metadata && typeof s.metadata.sizeBytes === "number" ? s.metadata.sizeBytes : 1500,
      }));
      setSkills(formatted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les compétences.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialSkills) {
      void refreshSkills();
    }
  }, [initialSkills]);

  // Derived tags for filter pills
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    for (const s of skills) {
      for (const t of s.tags) {
        if (t) tagsSet.add(t);
      }
    }
    return ["Tous", ...Array.from(tagsSet)];
  }, [skills]);

  // Filtered skills
  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return skills.filter((s) => {
      const matchesTag = selectedTag === "Tous" || s.tags.includes(selectedTag);
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
      return matchesTag && matchesSearch;
    });
  }, [skills, searchQuery, selectedTag]);

  // Actions
  function openCreateSkill() {
    setEditingSkill(null);
    setEditorName("");
    setEditorSlug("");
    setEditorDescription("");
    setEditorTags("");
    setEditorContent(
      `# Instructions pour ma compétence\n\nDirectives spécialisées pour orienter le comportement de l'agent.\n\n- Règle 1 : Suivre scrupuleusement les exigences.\n- Règle 2 : Répondre de manière concise et experte.`,
    );
    setViewMode("editor");
    setError(null);
    setSuccess(null);
  }

  async function openEditSkill(id: string) {
    const target = skills.find((s) => s.id === id);
    if (!target) return;

    setError(null);
    setSuccess(null);
    setEditingSkill(target);
    setEditorName(target.name);
    setEditorSlug(target.slug);
    setEditorDescription(target.description);
    setEditorTags(target.tags.join(", "));

    // Load full content if not already available
    if (target.content) {
      setEditorContent(target.content);
      setViewMode("editor");
    } else {
      try {
        setLoading(true);
        const full = await rpc.skills.get({ skillId: target.id });
        setEditorContent(full.content);
        setViewMode("editor");
      } catch {
        setEditorContent(`# ${target.name}\n\n${target.description}`);
        setViewMode("editor");
      } finally {
        setLoading(false);
      }
    }
  }

  async function openPreviewSkill(id: string) {
    const target = skills.find((s) => s.id === id);
    if (!target) return;
    setEditingSkill(target);
    setEditorName(target.name);
    setEditorSlug(target.slug);
    setEditorDescription(target.description);
    setEditorTags(target.tags.join(", "));

    if (target.content) {
      setEditorContent(target.content);
      setViewMode("preview");
    } else {
      try {
        setLoading(true);
        const full = await rpc.skills.get({ skillId: target.id });
        setEditorContent(full.content);
        setViewMode("preview");
      } catch {
        setEditorContent(`# ${target.name}\n\n${target.description}`);
        setViewMode("preview");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSaveSkill() {
    if (!editorName.trim()) {
      setError("Le nom de la compétence est obligatoire.");
      return;
    }
    if (!editorContent.trim()) {
      setError("Le contenu Markdown ne peut pas être vide.");
      return;
    }

    const byteLen = getByteLength(editorContent);
    if (byteLen > 2_000_000) {
      setError("Le contenu de la compétence dépasse la taille limite de 2 Mo.");
      return;
    }

    const finalSlug = editorSlug.trim() ? slugify(editorSlug) : slugify(editorName);
    const parsedTags = editorTags
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
      .filter(Boolean);

    setSaving(true);
    setError(null);

    try {
      if (editingSkill) {
        // Update existing skill
        if (!initialSkills) {
          const updated = await rpc.skills.update({
            skillId: editingSkill.id,
            name: editorName.trim(),
            slug: finalSlug,
            description: editorDescription.trim(),
            content: editorContent,
            tags: parsedTags,
          });
          setSkills((prev) =>
            prev.map((s) =>
              s.id === updated.id
                ? {
                    ...s,
                    name: updated.name,
                    slug: updated.slug,
                    description: updated.description,
                    tags: updated.tags,
                    content: updated.content,
                    sizeBytes: getByteLength(updated.content),
                  }
                : s,
            ),
          );
        } else {
          setSkills((prev) =>
            prev.map((s) =>
              s.id === editingSkill.id
                ? {
                    ...s,
                    name: editorName.trim(),
                    slug: finalSlug,
                    description: editorDescription.trim(),
                    tags: parsedTags,
                    content: editorContent,
                    sizeBytes: byteLen,
                  }
                : s,
            ),
          );
        }
        setSuccess(`Compétence « ${editorName.trim()} » mise à jour avec succès.`);
      } else {
        // Create new skill
        if (!initialSkills) {
          const created = await rpc.skills.create({
            name: editorName.trim(),
            slug: finalSlug,
            description: editorDescription.trim(),
            content: editorContent,
            tags: parsedTags,
          });
          const item: SkillItem = {
            id: created.id,
            name: created.name,
            slug: created.slug,
            description: created.description,
            tags: created.tags,
            content: created.content,
            sizeBytes: getByteLength(created.content),
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          };
          setSkills((prev) => [item, ...prev]);
        } else {
          const newItem: SkillItem = {
            id: `sk-${Date.now()}`,
            name: editorName.trim(),
            slug: finalSlug,
            description: editorDescription.trim(),
            tags: parsedTags,
            content: editorContent,
            sizeBytes: byteLen,
          };
          setSkills((prev) => [newItem, ...prev]);
        }
        setSuccess(`Compétence « ${editorName.trim()} » créée avec succès.`);
      }
      setViewMode("catalog");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement de la compétence.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      if (!initialSkills) {
        await rpc.skills.delete({ skillId: deleteTarget.id });
      }
      setSkills((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setSuccess(`Compétence « ${deleteTarget.name} » supprimée.`);
      setDeleteTarget(null);
      if (editingSkill?.id === deleteTarget.id) {
        setViewMode("catalog");
        setEditingSkill(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de supprimer la compétence.");
    } finally {
      setDeleting(false);
    }
  }

  // File Upload Handlers (Drag & Drop + Input File)
  function processFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError("Le fichier dépasse la taille limite autorisée de 2 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawText = (e.target?.result as string) || "";
      if (!rawText.trim()) {
        setError("Le fichier sélectionné est vide.");
        return;
      }

      const parsed = parseMarkdownContent(rawText, file.name);

      // Pre-fill editor with parsed content
      setEditingSkill(null);
      setEditorName(parsed.name);
      setEditorSlug(parsed.slug);
      setEditorDescription(parsed.description);
      setEditorTags(parsed.tags.join(", "));
      setEditorContent(parsed.content);
      setViewMode("editor");
      setError(null);
      setSuccess(
        `Fichier « ${file.name} » importé avec succès. Vérifiez et enregistrez votre compétence.`,
      );
    };
    reader.onerror = () => {
      setError("Erreur lors de la lecture du fichier Markdown.");
    };
    reader.readAsText(file);
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) {
        processFile(file);
      }
    }
  }

  // Calculated editor bytes
  const editorByteLength = useMemo(() => getByteLength(editorContent), [editorContent]);

  return (
    <div
      data-testid="skill-library-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-0 sm:p-4 md:p-6 backdrop-blur-sm"
    >
      <div className="flex h-full w-full sm:h-[min(760px,100%)] md:h-[760px] md:w-[1080px] max-w-full flex-col overflow-hidden rounded-none sm:rounded-[20px] md:rounded-[26px] border border-[#26262A] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)] text-[#EDEDEF]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#26262A] px-6 py-4">
          <div className="flex items-center gap-3">
            {viewMode !== "catalog" ? (
              <button
                type="button"
                onClick={() => setViewMode("catalog")}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#26262A] bg-[#17171A] text-[#A1A1AA] hover:bg-[#232326] hover:text-white transition-colors"
                title="Retour au catalogue"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles size={16} />
              </span>
            )}
            <div>
              <h2 className="text-lg font-semibold text-[#EDEDEF]">
                {viewMode === "editor"
                  ? editingSkill
                    ? `Modifier : ${editingSkill.name}`
                    : "Créer une nouvelle compétence"
                  : viewMode === "preview"
                    ? `Aperçu : ${editingSkill?.name || "Compétence"}`
                    : "Bibliothèque de Compétences"}
              </h2>
              <p className="text-xs text-[#71717A]">
                {viewMode === "editor"
                  ? "Configurez les instructions, métadonnées et directives souveraines pour vos agents."
                  : viewMode === "preview"
                    ? "Rendu en direct des instructions Markdown telles qu'injectées dans le prompt de l'agent."
                    : "Gérez vos instructions spécialisées souveraines et assignez-les à vos agents."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {viewMode === "catalog" ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 transition-colors shadow-sm"
                >
                  + Importer un skill (.md)
                </button>
                <button
                  type="button"
                  onClick={openCreateSkill}
                  className="rounded-lg border border-[#3F3F46] bg-[#1C1C1F] px-3.5 py-1.5 text-xs font-medium text-[#EDEDEF] hover:bg-[#27272A] transition-colors"
                >
                  + Créer un skill
                </button>
              </>
            ) : viewMode === "editor" ? (
              <>
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  className="rounded-lg border border-[#3F3F46] bg-[#1C1C1F] px-3.5 py-1.5 text-xs font-medium text-[#EDEDEF] hover:bg-[#27272A] transition-colors flex items-center gap-1.5"
                >
                  <Eye size={13} />
                  Prévisualiser
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveSkill()}
                  disabled={saving}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setViewMode("editor")}
                className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 transition-colors"
              >
                Modifier le contenu
              </button>
            )}
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Alerts / Feedback */}
        {error ? (
          <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-6 py-2.5 text-xs text-rose-400">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400/80 hover:text-rose-200"
            >
              ✕
            </button>
          </div>
        ) : null}
        {success ? (
          <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-2.5 text-xs text-emerald-400">
            <Check size={14} className="shrink-0" />
            <span className="flex-1">{success}</span>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="text-emerald-400/80 hover:text-emerald-200"
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* Hidden File Input for .md upload */}
        <input
          id={fileInputId}
          type="file"
          ref={fileInputRef}
          accept=".md,text/markdown,text/plain"
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Téléverser un fichier Markdown"
        />

        {/* CATALOG VIEW */}
        {viewMode === "catalog" ? (
          <>
            {/* Search & Tag Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 border-b border-[#26262A] bg-[#111113] px-4 py-3 sm:px-6">
              <div className="flex items-center gap-1.5 overflow-x-auto rk-scroll py-0.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className={`cursor-pointer shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      tag === selectedTag
                        ? "bg-[#27272A] text-white font-semibold shadow-sm"
                        : "bg-transparent text-[#71717A] hover:text-[#EDEDEF]"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="relative shrink-0">
                <Search size={14} className="absolute left-3 top-2.5 text-[#71717A]" />
                <input
                  type="text"
                  placeholder="Rechercher une compétence..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 rounded-lg border border-[#26262A] bg-[#17171A] pl-8 pr-3 py-1.5 text-[16px] sm:text-xs text-white placeholder-[#71717A] focus:border-neutral-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mx-4 sm:mx-6 mt-4 cursor-pointer rounded-xl border border-dashed p-4 text-center transition-all ${
                isDragging
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-[#2E2E32] bg-[#17171A]/50 hover:border-[#3F3F46] hover:bg-[#17171A]"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <UploadCloud
                  size={16}
                  className={isDragging ? "text-emerald-400" : "text-[#71717A]"}
                />
                <p className="text-xs font-medium text-[#A1A1AA]">
                  Glissez un fichier Markdown (.md) ici ou cliquez sur Importer
                </p>
              </div>
              <p className="mt-0.5 text-[11px] text-[#71717A]">
                Taille max : 2 Mo • Support YAML Frontmatter & Markdown brut
              </p>
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 rk-scroll">
              {loading ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <p className="text-sm font-medium text-[#71717A]">
                    Chargement de la bibliothèque…
                  </p>
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <p className="text-sm font-medium text-[#71717A]">
                    {searchQuery || selectedTag !== "Tous"
                      ? "Aucun skill ne correspond à votre recherche"
                      : "Aucune compétence enregistrée pour le moment"}
                  </p>
                  <p className="mt-1 text-xs text-[#52525B]">
                    Importez des fichiers Markdown ou créez vos premiers guides d'instructions
                    souverains.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSkills.map((s) => (
                    <SkillCard
                      key={s.id}
                      {...s}
                      onEdit={openEditSkill}
                      onPreview={openPreviewSkill}
                      onDelete={() => setDeleteTarget(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* SPLIT MARKDOWN EDITOR & LIVE PREVIEW VIEW */}
        {viewMode === "editor" ? (
          <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[#26262A]">
            {/* Left Pane: Form Fields & Raw Markdown Textarea */}
            <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6 rk-scroll gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs font-medium text-[#A1A1AA]">
                  Nom de la compétence
                  <input
                    type="text"
                    value={editorName}
                    onChange={(e) => {
                      setEditorName(e.target.value);
                      if (!editorSlug || editorSlug === slugify(editorName)) {
                        setEditorSlug(slugify(e.target.value));
                      }
                    }}
                    placeholder="Ex: TypeScript Pro, Docling Document Parser"
                    className="mt-1.5 w-full rounded-lg border border-[#26262A] bg-[#101012] px-3 py-2 text-[16px] sm:text-xs text-white placeholder-[#52525B] focus:border-neutral-500 focus:outline-none"
                  />
                </label>
                <label className="block text-xs font-medium text-[#A1A1AA]">
                  Identifiant technique / Slug
                  <input
                    type="text"
                    value={editorSlug}
                    onChange={(e) => setEditorSlug(slugify(e.target.value))}
                    placeholder="Ex: typescript-pro"
                    className="mt-1.5 w-full rounded-lg border border-[#26262A] bg-[#101012] px-3 py-2 text-[16px] sm:text-xs font-mono text-white placeholder-[#52525B] focus:border-neutral-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs font-medium text-[#A1A1AA]">
                  Description courte
                  <textarea
                    value={editorDescription}
                    onChange={(e) => setEditorDescription(e.target.value)}
                    placeholder="Résumé succinct de l'expertise apportée par cette compétence..."
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-[#26262A] bg-[#101012] px-3 py-2 text-[16px] sm:text-xs text-white placeholder-[#52525B] focus:border-neutral-500 focus:outline-none"
                  />
                </label>
                <label className="block text-xs font-medium text-[#A1A1AA]">
                  Tags (séparés par des virgules)
                  <input
                    type="text"
                    value={editorTags}
                    onChange={(e) => setEditorTags(e.target.value)}
                    placeholder="dev, typescript, backend, security"
                    className="mt-1.5 w-full rounded-lg border border-[#26262A] bg-[#101012] px-3 py-2 text-[16px] sm:text-xs text-white placeholder-[#52525B] focus:border-neutral-500 focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-1 flex-col min-h-[260px]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#A1A1AA] flex items-center gap-1.5">
                    <FileCode size={14} />
                    Contenu Markdown des directives
                  </span>
                  <span className="text-[11px] text-[#71717A] font-mono">
                    {editorByteLength} octets · ~{Math.ceil(editorByteLength / 4)} tokens
                  </span>
                </div>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="Rédigez ici les directives détaillées, exemples de code et règles expertes..."
                  className="flex-1 w-full rounded-lg border border-[#26262A] bg-[#101012] p-3 text-[16px] sm:text-xs font-mono text-[#E4E4E7] placeholder-[#52525B] focus:border-neutral-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Right Pane: Live Markdown Preview */}
            <div className="flex flex-1 flex-col overflow-hidden bg-[#111113]">
              <div className="flex items-center justify-between border-b border-[#26262A] px-6 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#EDEDEF]">Aperçu en direct</span>
                  <SkillSizeBadge sizeBytes={editorByteLength} />
                </div>
                <span className="text-[11px] text-[#71717A]">
                  Rendu synchronisé avec le prompt système
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-6 rk-scroll prose prose-invert max-w-none text-xs leading-relaxed text-[#D4D4D8]">
                {editorContent.trim() ? (
                  <ChatMarkdown>{editorContent}</ChatMarkdown>
                ) : (
                  <p className="text-xs italic text-[#52525B]">
                    Tapez des instructions Markdown à gauche pour observer le rendu en direct ici.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* FULL PREVIEW VIEW */}
        {viewMode === "preview" ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#111113]">
            <div className="flex items-center justify-between border-b border-[#26262A] px-6 py-3 bg-[#141416]">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {editorName || "Compétence"}
                    </h3>
                    <SkillSizeBadge sizeBytes={editorByteLength} />
                  </div>
                  <p className="text-xs text-[#71717A] font-mono">{editorSlug || "slug-auto"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#71717A]">
                  Taille totale : {(editorByteLength / 1024).toFixed(1)} Ko ({editorByteLength}{" "}
                  octets)
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 rk-scroll prose prose-invert max-w-4xl mx-auto w-full text-xs leading-relaxed text-[#D4D4D8]">
              {editorDescription ? (
                <div className="mb-6 rounded-lg border border-[#26262A] bg-[#17171A] p-4 text-xs text-[#A1A1AA]">
                  <span className="font-semibold text-white">Description : </span>
                  {editorDescription}
                </div>
              ) : null}
              <ChatMarkdown>{editorContent}</ChatMarkdown>
            </div>
          </div>
        ) : null}

        {/* DELETE CONFIRMATION MODAL */}
        {deleteTarget ? (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-[#26262A] bg-[#17171A] p-6 shadow-2xl">
              <div className="flex items-center gap-3 text-rose-400">
                <Trash2 size={20} />
                <h3 className="text-base font-semibold text-white">Supprimer la compétence</h3>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#A1A1AA]">
                Êtes-vous sûr de vouloir supprimer définitivement la compétence{" "}
                <span className="font-semibold text-white">« {deleteTarget.name} »</span> ? Cette
                action est irréversible et détachera cette compétence de tous les agents.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-[#3F3F46] bg-transparent px-3.5 py-1.5 text-xs font-medium text-[#EDEDEF] hover:bg-[#232326] transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteConfirm()}
                  className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Suppression…" : "Supprimer définitivement"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
