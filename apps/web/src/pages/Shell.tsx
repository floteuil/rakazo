import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type {
  Bot,
  BotInferenceConfig,
  BotMcpConfig,
  ComputerMode,
  ComputerStatus,
  InferenceMode,
  InferenceUsageTag,
  Me,
  ProductEvent,
  Routine,
  SearchHit,
  Skill,
  SkillSummary,
  TaughtSkill,
  ThreadMessage,
  ThreadSnapshot,
  VoiceInfo,
  VoiceStatus,
} from "@rakazo/contracts";
import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  buildBlueprintMcpConfig,
  buildInterAgentRelayBriefFr,
  getBlueprintSkillIds,
  SOVEREIGN_AGENT_BLUEPRINTS,
  SOVEREIGN_ROUTINE_TEMPLATES,
  type SovereignAgentBlueprint,
} from "@rakazo/contracts";
import {
  abortableDelay,
  attachmentsForBot,
  cronFromPreset,
  DEFAULT_ROUTINE_TIMEZONE,
  defaultCronPreset,
  formatCronFr,
  inferAttachmentMimeType,
  isActive,
  presetFromCron,
  speechFromBlocks,
} from "@rakazo/core";
import { BotAvatar, Button } from "@rakazo/ui-web";
import {
  ArrowUp,
  CalendarClock,
  ChevronLeft,
  Cpu,
  Gauge,
  LogOut,
  Menu,
  Paperclip,
  Plus,
  Puzzle,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  type Dispatch,
  lazy,
  memo,
  type RefObject,
  type SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  type ChoiceBlock,
  ChoiceChipsCard,
  MentionPopover,
  MessageActionBar,
  TimestampBadge,
  ToolActivityAccordion,
} from "../components/chat";
import { SkillDraftCard } from "../components/teach/SkillDraftCard";
import { TeachCaptureOverlay } from "../components/teach/TeachCaptureOverlay";
import { TeachComputerSection } from "../components/teach/TeachComputerSection";
import { TeachRecordingChrome, TeachStopButton } from "../components/teach/TeachRecordingChrome";
import { decodeArtifactBase64, openArtifact } from "../lib/artifact-open";
import { authClient } from "../lib/auth";
import { takeInitialBootstrap } from "../lib/bootstrap";
import {
  beginComposerDraftSubmission,
  readComposerDraft,
  settleComposerDraftSubmission,
  subscribeComposerDraftAccepted,
  writeComposerDraft,
} from "../lib/composer-draft";
import {
  getComposerEnterToSend,
  subscribeComposerEnterToSend,
} from "../lib/composer-enter-to-send-pref";
import { dictation } from "../lib/dictation";
import {
  revokePendingAttachmentPreviews,
  usePendingAttachmentPreviewCleanup,
} from "../lib/pending-attachments";
import { markAfterPaint, markOnce } from "../lib/performance";
import { rpc } from "../lib/rpc";
import { formatUserFacingRunError } from "../lib/run-error";
import {
  computerPanelAutoBoot,
  isComputerStatusEvent,
  isThreadSnapshotEvent,
  mergeThreadSnapshot,
  prependThreadMessagePage,
  reduceComputerStatus,
  reduceThreadSnapshot,
  userHoldsComputerControl,
} from "../lib/thread-events";
import {
  applySilentRoutineClause,
  buildFiveLineThreadHandoff,
  estimateTokensSavedByRemaster,
  hasSilentRoutineClause,
  type RemasterableMessage,
  shouldSuggestThreadRemaster,
  stripSilentRoutineClauseForEditor,
} from "../lib/thread-remaster";
import { speaker } from "../lib/tts";
import type { ContextMenuPosition } from "./BotContextMenu";
import { BotMcpToolSelector, getRecommendedMcpConfig } from "./BotMcpToolSelector";
import { BotSkillSelector } from "./BotSkillSelector";
import { HostComputerPrompt } from "./HostComputerPrompt";
import { PromptCompilerModal } from "./PromptCompilerModal";
import type { InitialDraftSkill } from "./SkillLibraryOverlay";
import { WindowChrome } from "./WindowChrome";
import { WorkspaceSearchResults } from "./WorkspaceSearch";

const BotContextMenu = lazy(() =>
  import("./BotContextMenu").then((module) => ({ default: module.BotContextMenu })),
);
const ModelSettingsOverlay = lazy(() =>
  import("./ModelSettingsOverlay").then((module) => ({ default: module.ModelSettingsOverlay })),
);
const PluginsOverlay = lazy(() =>
  import("./PluginsOverlay").then((module) => ({ default: module.PluginsOverlay })),
);
const SovereignCockpitOverlay = lazy(() =>
  import("./SovereignCockpitOverlay").then((module) => ({
    default: module.SovereignCockpitOverlay,
  })),
);
const SkillLibraryOverlay = lazy(() =>
  import("./SkillLibraryOverlay").then((module) => ({ default: module.SkillLibraryOverlay })),
);
const RoutineSchedule = lazy(() =>
  import("./RoutineSchedule").then((module) => ({ default: module.RoutineSchedule })),
);
const VoiceSettingsOverlay = lazy(() =>
  import("./VoiceSettingsOverlay").then((module) => ({ default: module.VoiceSettingsOverlay })),
);
const CallView = lazy(() => import("./CallView").then((module) => ({ default: module.CallView })));

type Panel = "computer" | "settings" | "routine" | "create" | null;

type PendingAttachment = {
  id: string;
  botId: string;
  file: File;
  previewUrl?: string;
};

const ATTACHMENT_ACCEPT = ATTACHMENT_ALLOWED_MIME_TYPES.join(",");

export function ShellPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = authClient.useSession();
  const [bots, setBots] = useState<Bot[]>([]);
  const [archivedBots, setArchivedBots] = useState<Bot[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  usePendingAttachmentPreviewCleanup(pendingAttachments);
  const attachmentSeqRef = useRef(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState("");
  const inChatSearchInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesBotId, setRoutinesBotId] = useState<string | null>(null);
  const [taughtSkills, setTaughtSkills] = useState<TaughtSkill[]>([]);
  const [taughtSkillsBotId, setTaughtSkillsBotId] = useState<string | null>(null);
  const [teachBusy, setTeachBusy] = useState(false);
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [cockpitOpen, setCockpitOpen] = useState(false);
  const [skillLibraryOpen, setSkillLibraryOpen] = useState(false);
  const [skillLibraryDraft, setSkillLibraryDraft] = useState<InitialDraftSkill | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [botMenu, setBotMenu] = useState<{
    botId: string;
    position: ContextMenuPosition;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bot | null>(null);
  const [clearTarget, setClearTarget] = useState<Bot | null>(null);
  const [booting, setBooting] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [initialBotsLoaded, setInitialBotsLoaded] = useState(false);
  const [bootstrapMe, setBootstrapMe] = useState<Me | null>();
  const [routineDraft, setRoutineDraft] = useState({
    name: "",
    prompt: "",
    schedule: defaultCronPreset(),
    silentMode: true,
  });
  const [remasterOpen, setRemasterOpen] = useState(false);
  const [remasterDraft, setRemasterDraft] = useState("");
  const [remasterCopied, setRemasterCopied] = useState(false);
  const [remasterApplying, setRemasterApplying] = useState(false);
  const [relayOpen, setRelayOpen] = useState(false);
  const [relayTargetBotId, setRelayTargetBotId] = useState("");
  const [relayDirective, setRelayDirective] = useState("");
  const [relayDraft, setRelayDraft] = useState("");
  const [relayApplying, setRelayApplying] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteRoutineTarget, setDeleteRoutineTarget] = useState<Routine | null>(null);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState(false);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const [usage, setUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    runs: number;
  } | null>(null);
  const [reactions, setReactions] = useState<Record<string, "up" | "down" | null>>({});
  const handleReact = useCallback((msgId: string, reaction: "up" | "down" | null) => {
    setReactions((current) => ({ ...current, [msgId]: reaction }));
  }, []);
  const autoBooted = useRef<string | null>(null);
  const routineSavePending = useRef(false);
  const routineRunPending = useRef(false);
  const bootstrappedThread = useRef<ThreadSnapshot | null>(null);
  const expandedHistoryThread = useRef<string | null>(null);
  const historyEpoch = useRef(0);
  const initiallyScrolledThread = useRef<string | null>(null);
  const messageScroll = useRef<HTMLDivElement>(null);
  const pinnedAroundRef = useRef<{
    botId: string;
    messageId: string;
    threadId: string;
    messages: ThreadMessage[];
    olderCursor: number | null;
  } | null>(null);
  const manuallyUnread = useRef(new Set<string>());
  const computerVisible = useRef(false);
  computerVisible.current = panel === "computer" || computerOpen;
  const autoSpoken = useRef<string | null>(null);
  const autoSpokenBotId = useRef<string | null>(null);

  const active = bots.find((b) => b.id === botId) ?? bots[0];
  const enterToSend = useSyncExternalStore(
    subscribeComposerEnterToSend,
    getComposerEnterToSend,
    () => true,
  );
  const activePendingAttachments = useMemo(
    () => attachmentsForBot(pendingAttachments, active?.id),
    [active?.id, pendingAttachments],
  );
  const activeRoutines = routinesBotId === active?.id ? routines : [];
  const activeTaughtSkills = taughtSkillsBotId === active?.id ? taughtSkills : [];
  const recordingSkill = activeTaughtSkills.find((skill) => skill.status === "recording") ?? null;
  const routeBotId = useRef<string | undefined>(botId);
  routeBotId.current = botId;
  const activeBotId = useRef<string | undefined>(active?.id);
  activeBotId.current = active?.id;
  const screenRequest = useRef(0);
  const contextBot = botMenu ? bots.find((bot) => bot.id === botMenu.botId) : undefined;
  const closeBotMenu = useCallback(() => setBotMenu(null), []);
  const updateBotUnread = useCallback((id: string, unread: boolean) => {
    setBots((current) => {
      const bot = current.find((candidate) => candidate.id === id);
      if (!bot || bot.unread === unread) return current;
      return current.map((candidate) =>
        candidate.id === id ? { ...candidate, unread } : candidate,
      );
    });
  }, []);
  const markBotRead = useCallback(
    async (id: string) => {
      await rpc.threads.markRead({ botId: id });
      manuallyUnread.current.delete(id);
      updateBotUnread(id, false);
    },
    [updateBotUnread],
  );
  const markBotUnread = useCallback(
    async (id: string) => {
      manuallyUnread.current.add(id);
      try {
        await rpc.threads.markUnread({ botId: id });
      } catch (err) {
        manuallyUnread.current.delete(id);
        throw err;
      }
      updateBotUnread(id, true);
    },
    [updateBotUnread],
  );
  // A bot the user marked unread by hand stays unread until they open it again,
  // otherwise the auto-read below would undo the action on the next window focus.
  const markBotReadIfVisible = useCallback(
    (id: string) => {
      if (manuallyUnread.current.has(id)) return;
      if (document.visibilityState === "visible" && document.hasFocus()) {
        void markBotRead(id).catch(() => undefined);
      }
    },
    [markBotRead],
  );

  async function refreshBots(includeArchived = false) {
    markOnce("rk:renderer:bots-request-start");
    const [list, archived] = await Promise.all([
      rpc.bots.list(),
      includeArchived ? rpc.bots.listArchived() : Promise.resolve(null),
    ]);
    markOnce("rk:renderer:bots-response");
    setBots(list);
    setInitialBotsLoaded(true);
    if (archived) setArchivedBots(archived);
    if (includeArchived && list.length === 0 && archived?.length === 0) {
      navigate("/onboarding", { replace: true });
      return;
    }
    const currentBotId = routeBotId.current;
    if (!currentBotId || !list.some((bot) => bot.id === currentBotId)) {
      navigate(list[0] ? `/app/${list[0].id}` : "/app", { replace: true });
    }
  }

  async function refreshThread(id: string) {
    const scrollElement = messageScroll.current;
    const stickToEnd =
      !scrollElement ||
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 80;
    markOnce("rk:renderer:thread-request-start");
    const pin = pinnedAroundRef.current;
    const keepPin = pin?.botId === id;
    const epoch = historyEpoch.current;
    const [snap, routines, skills] = await Promise.all([
      rpc.threads.get({ botId: id }),
      rpc.routines.list({ botId: id }),
      rpc.taughtSkills.list({ botId: id }),
      refreshComputerScreen(id),
    ]);
    markOnce("rk:renderer:thread-response");
    // The epoch check drops a response that raced a conversation clear, which would otherwise
    // re-apply the deleted messages and cursor over the emptied snapshot.
    if (activeBotId.current !== id || epoch !== historyEpoch.current) return snap;
    setSnapshot((prev) => {
      let merged = mergeThreadSnapshot(prev, snap, expandedHistoryThread.current === snap.threadId);
      if (keepPin && merged) {
        merged = {
          ...merged,
          messages: pin.messages,
          olderCursor: pin.olderCursor,
        };
      }
      return merged;
    });
    setComputer(snap.computer);
    setRoutines(routines);
    setRoutinesBotId(id);
    setTaughtSkills(skills);
    setTaughtSkillsBotId(id);
    if (!keepPin && stickToEnd) {
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    }
    return snap;
  }

  async function refreshComputerScreen(id: string) {
    if (!computerVisible.current) return null;
    const request = ++screenRequest.current;
    const screen = await rpc.computer.screenUrl({ botId: id }).catch(() => ({ url: null }));
    if (
      request !== screenRequest.current ||
      activeBotId.current !== id ||
      !computerVisible.current
    ) {
      return null;
    }
    setScreenUrl(screen.url);
    return screen.url;
  }

  async function loadOlderMessages() {
    if (!active || snapshot?.olderCursor == null || loadingOlder) return;
    pinnedAroundRef.current = null;
    const scrollElement = messageScroll.current;
    const previousHeight = scrollElement?.scrollHeight ?? 0;
    const epoch = historyEpoch.current;
    setLoadingOlder(true);
    try {
      const page = await rpc.threads.messages({
        botId: active.id,
        before: snapshot.olderCursor,
      });
      if (epoch !== historyEpoch.current) return;
      expandedHistoryThread.current = page.threadId;
      setSnapshot((prev) => prependThreadMessagePage(prev, page));
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop += element.scrollHeight - previousHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void takeInitialBootstrap(botId)
      .then((bootstrap) => {
        if (cancelled) return;
        setBootstrapMe(bootstrap.me);
        setBots(bootstrap.bots);
        setArchivedBots(bootstrap.archivedBots);
        setInitialBotsLoaded(true);
        if (bootstrap.thread) {
          bootstrappedThread.current = bootstrap.thread;
          setSnapshot(bootstrap.thread);
          setComputer(bootstrap.thread.computer);
          setRoutines(bootstrap.routines);
          setRoutinesBotId(bootstrap.thread.botId);
          markOnce("rk:renderer:bots-response");
          markOnce("rk:renderer:thread-response");
        }
        if (bootstrap.bots.length === 0 && bootstrap.archivedBots.length === 0) {
          navigate("/onboarding", { replace: true });
          return;
        }
        const selectedBotId = bootstrap.thread?.botId ?? bootstrap.bots[0]?.id;
        if (selectedBotId && selectedBotId !== botId) {
          navigate(`/app/${selectedBotId}`, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBootstrapMe(null);
        void refreshBots(true);
      });
    let refreshTimer: number | undefined;
    const refreshVisibleBots = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshBots().catch(() => undefined), 50);
    };
    window.addEventListener("focus", refreshVisibleBots);
    document.addEventListener("visibilitychange", refreshVisibleBots);
    const poll = window.setInterval(refreshVisibleBots, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshVisibleBots);
      document.removeEventListener("visibilitychange", refreshVisibleBots);
    };
  }, []);

  useEffect(() => {
    void rpc.voice
      .status()
      .then(setVoiceStatus)
      .catch(() => undefined);
    const unsubSpeech = speaker.subscribe((state) => {
      setSpeakingMessageId(state.status === "idle" ? null : (state.messageId ?? null));
    });
    const unsubDictation = dictation.subscribe((state) => {
      setDictating(state.status === "listening" || state.status === "transcribing");
      if (state.error) setDictationError(state.error);
      else if (state.status === "listening") setDictationError(null);
    });
    return () => {
      unsubSpeech();
      unsubDictation();
    };
  }, []);

  useEffect(() => {
    if (!active || !snapshot || snapshot.botId !== active.id) return;
    const lastBot = [...snapshot.messages].reverse().find((message) => message.role === "bot");
    if (autoSpokenBotId.current !== active.id) {
      autoSpokenBotId.current = active.id;
      autoSpoken.current = lastBot?.id ?? null;
      return;
    }
    if (callOpen || !active.autoSpeak) {
      autoSpoken.current = lastBot?.id ?? null;
      return;
    }
    if (snapshot.run && ["running", "queued", "leased"].includes(snapshot.run.status)) return;
    if (!lastBot || lastBot.id === autoSpoken.current) return;
    const text = speechFromBlocks(lastBot.blocks);
    if (!text) return;
    autoSpoken.current = lastBot.id;
    void speaker.speak(text, { botId: active.id, messageId: lastBot.id });
  }, [
    snapshot?.messages,
    snapshot?.run?.status,
    snapshot?.botId,
    active?.autoSpeak,
    active?.id,
    callOpen,
  ]);

  useEffect(() => {
    if (!active) return;
    // Opening a bot clears the manual unread flag so it can auto-read again.
    manuallyUnread.current.delete(active.id);
    const markVisibleBotRead = () => {
      markBotReadIfVisible(active.id);
    };
    markVisibleBotRead();
    window.addEventListener("focus", markVisibleBotRead);
    document.addEventListener("visibilitychange", markVisibleBotRead);
    return () => {
      window.removeEventListener("focus", markVisibleBotRead);
      document.removeEventListener("visibilitychange", markVisibleBotRead);
    };
  }, [active?.id, markBotReadIfVisible]);

  useEffect(() => {
    if (!active) return;
    if (!searchParams.get("m")) {
      pinnedAroundRef.current = null;
    }
    screenRequest.current += 1;
    setScreenUrl(null);
    expandedHistoryThread.current = null;
    historyEpoch.current += 1;
    const abort = new AbortController();
    void (async () => {
      const primed = bootstrappedThread.current;
      bootstrappedThread.current = null;
      const snap =
        primed?.botId === active.id ? primed : await refreshThread(active.id).catch(() => null);
      if (abort.signal.aborted) return;
      let cursor = snap?.cursor ?? -1;
      let retryMs = 250;
      while (!abort.signal.aborted) {
        try {
          const events = await rpc.threads.subscribe(
            { botId: active.id, cursor },
            { signal: abort.signal },
          );
          for await (const event of events) {
            if (abort.signal.aborted) break;
            cursor = Math.max(cursor, event.seq);
            retryMs = 250;
            applyThreadEvent(event, setSnapshot, setComputer);
            if (event.type === "thread.cleared") {
              expandedHistoryThread.current = null;
              pinnedAroundRef.current = null;
              historyEpoch.current += 1;
            }
            if (event.type === "bot.archived") {
              void refreshBots(true).catch(() => undefined);
            } else if (
              event.type === "bot.spawned" ||
              event.type === "bot.deleted" ||
              event.type === "run.completed" ||
              event.type === "run.failed" ||
              event.type === "run.cancelled" ||
              event.type === "thread.cleared"
            ) {
              void refreshBots().catch(() => undefined);
            }
            if (event.type === "thread.message.created") {
              const blocks = (event.payload.blocks as Array<{ kind?: string }>) ?? [];
              if (blocks.some((block) => block.kind === "child_bot")) {
                void refreshBots().catch(() => undefined);
              }
              if (event.payload.role === "bot") markBotReadIfVisible(active.id);
            }
            if (
              event.type === "run.completed" ||
              event.type === "run.failed" ||
              event.type === "run.cancelled" ||
              event.type === "skill.teaching.stopped"
            ) {
              void refreshThread(active.id).catch(() => undefined);
            } else if (isComputerStatusEvent(event)) {
              void refreshComputerScreen(active.id).catch(() => undefined);
            }
          }
        } catch {
          // The durable cursor below makes reconnects safe after a transient network failure.
        }
        if (abort.signal.aborted) break;
        await refreshThread(active.id).catch(() => null);
        await abortableDelay(retryMs, abort.signal);
        retryMs = Math.min(retryMs * 2, 5_000);
      }
    })();
    return () => {
      abort.abort();
    };
  }, [active?.id, markBotReadIfVisible, searchParams]);

  const filtered = useMemo(
    () => bots.filter((b) => `${b.name} ${b.preview}`.toLowerCase().includes(query.toLowerCase())),
    [bots, query],
  );
  const workspaceQuery = query.trim();
  const showWorkspaceSearch = workspaceQuery.length > 0;

  useEffect(() => {
    if (!showWorkspaceSearch) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void rpc.search
        .query({ q: workspaceQuery })
        .then((result) => {
          if (!abort.signal.aborted) setSearchHits(result.hits);
        })
        .catch(() => {
          if (!abort.signal.aborted) setSearchHits([]);
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearchLoading(false);
        });
    }, 200);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [showWorkspaceSearch, workspaceQuery]);

  async function jumpToSearchHit(hit: SearchHit) {
    setQuery("");
    setSearchHits([]);
    setSidebarOpen(false);
    const params = new URLSearchParams();
    if (hit.messageId) params.set("m", hit.messageId);
    if (hit.routineId) params.set("routine", hit.routineId);
    navigate({
      pathname: `/app/${hit.botId}`,
      search: params.toString() ? `?${params.toString()}` : undefined,
    });
  }

  async function jumpToMessage(botId: string, messageId: string) {
    const epoch = historyEpoch.current;
    const [snap, page] = await Promise.all([
      rpc.threads.get({ botId }),
      rpc.threads.messages({ botId, around: { messageId } }),
    ]);
    // The epoch check drops a jump that raced a conversation clear (or a bot switch): applying
    // the fetched page would pin deleted messages that every later refresh keeps restoring.
    if (epoch !== historyEpoch.current) return;
    expandedHistoryThread.current = page.threadId;
    pinnedAroundRef.current = {
      botId,
      messageId,
      threadId: page.threadId,
      messages: page.messages,
      olderCursor: page.olderCursor,
    };
    setSnapshot({
      ...snap,
      messages: page.messages,
      olderCursor: page.olderCursor,
    });
    setComputer(snap.computer);
    setRoutines(await rpc.routines.list({ botId }));
    setRoutinesBotId(botId);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-message-id="${messageId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  useEffect(() => {
    if (!active) return;
    const messageId = searchParams.get("m");
    const routineId = searchParams.get("routine");
    if (routineId && routinesBotId === active.id) {
      const routine = routines.find((item) => item.id === routineId);
      if (routine) {
        setRoutineDraft({
          name: routine.name,
          prompt: stripSilentRoutineClauseForEditor(routine.prompt),
          schedule: presetFromCron(routine.cron),
          silentMode: hasSilentRoutineClause(routine.prompt) || true,
        });
        setPanel("routine");
      } else {
        setPanel("computer");
      }
      const next = new URLSearchParams(searchParams);
      next.delete("routine");
      setSearchParams(next, { replace: true });
    }
    if (messageId) {
      void jumpToMessage(active.id, messageId).finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("m");
        setSearchParams(next, { replace: true });
      });
    }
  }, [active?.id, routines, routinesBotId, searchParams, setSearchParams]);
  const answerableAskMessageId = latestAnswerableAskMessageId(snapshot);
  const shellReady = initialBotsLoaded && Boolean(active && snapshot?.botId === active.id);
  const refreshThreadRef = useRef(refreshThread);
  refreshThreadRef.current = refreshThread;
  const loadOlderMessagesRef = useRef(loadOlderMessages);
  loadOlderMessagesRef.current = loadOlderMessages;

  useLayoutEffect(() => {
    if (initialBotsLoaded) {
      markOnce("rk:renderer:bots-committed");
      markAfterPaint("rk:renderer:bots-painted");
    }
    if (active && snapshot?.botId === active.id) {
      markOnce("rk:renderer:thread-committed");
      markAfterPaint("rk:renderer:thread-painted");
    }
    if (shellReady) {
      markOnce("rk:renderer:shell-ready");
      markAfterPaint("rk:renderer:shell-painted");
    }
  }, [active, initialBotsLoaded, shellReady, snapshot?.botId]);

  useLayoutEffect(() => {
    if (!active || snapshot?.botId !== active.id) return;
    if (initiallyScrolledThread.current === snapshot.threadId) return;
    if (pinnedAroundRef.current?.botId === active.id) return;
    const element = messageScroll.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    initiallyScrolledThread.current = snapshot.threadId;
  }, [active, snapshot?.botId, snapshot?.threadId]);

  const openBot = useCallback((id: string) => navigate(`/app/${id}`), [navigate]);
  const loadOlder = useCallback(() => loadOlderMessagesRef.current(), []);
  const answerMessage = useCallback(async (message: ThreadMessage, text: string) => {
    const id = activeBotId.current;
    if (!id) return;
    await rpc.threads.answer({
      botId: id,
      runId: message.runId ?? "",
      messageId: message.id,
      answer: text,
    });
    await refreshThreadRef.current(id);
  }, []);
  const onAttachmentPick = useCallback(
    async (files: FileList | null) => {
      const id = activeBotId.current;
      if (!id || !files?.length) return;
      const existing = attachmentsForBot(pendingAttachments, id);
      const next: PendingAttachment[] = [];
      const skipped: string[] = [];
      for (const file of Array.from(files)) {
        if (existing.length + next.length >= ATTACHMENT_MAX_COUNT) {
          skipped.push(`${file.name} (max ${ATTACHMENT_MAX_COUNT} attachments)`);
          continue;
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
          skipped.push(`${file.name} (over 10 MiB)`);
          continue;
        }
        const mimeType = inferAttachmentMimeType(file.name, file.type);
        if (!mimeType) {
          skipped.push(file.name);
          continue;
        }
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${++attachmentSeqRef.current}`,
          botId: id,
          file,
          previewUrl: mimeType.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      }
      if (next.length) setPendingAttachments((current) => [...current, ...next]);
      setAttachmentNotice(skipped.length ? `Skipped ${skipped.join(", ")}` : null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [pendingAttachments],
  );
  const removeAttachment = useCallback((attachment: PendingAttachment) => {
    revokePendingAttachmentPreviews([attachment]);
    setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id));
  }, []);
  const sendMessage = useCallback(
    async (text: string) => {
      const id = activeBotId.current;
      if (!id || sending) return;
      const attachments = attachmentsForBot(pendingAttachments, id);
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;
      setSending(true);
      setSendError(null);
      setDictationError(null);
      try {
        const artifactIds: string[] = [];
        for (const pending of attachments) {
          const mimeType = inferAttachmentMimeType(pending.file.name, pending.file.type);
          if (!mimeType) {
            throw new Error(`Unsupported file type: ${pending.file.name}`);
          }
          const contentBase64 = await readFileAsBase64(pending.file);
          const artifact = await rpc.artifacts.create({
            botId: id,
            name: pending.file.name,
            mimeType,
            contentBase64,
          });
          artifactIds.push(artifact.id);
        }
        await rpc.threads.send({
          botId: id,
          text: trimmed || undefined,
          artifactIds: artifactIds.length ? artifactIds : undefined,
        });
        revokePendingAttachmentPreviews(attachments);
        setPendingAttachments((current) => current.filter((attachment) => attachment.botId !== id));
        if (activeBotId.current === id) setAttachmentNotice(null);
        await refreshThreadRef.current(id);
      } catch (error) {
        if (activeBotId.current === id) {
          setSendError(error instanceof Error ? error.message : "Failed to send message");
        }
      } finally {
        setSending(false);
      }
    },
    [pendingAttachments, sending],
  );
  const followUpMessage = useCallback(async (text: string) => {
    const id = activeBotId.current;
    if (!id) return;
    setSendError(null);
    setDictationError(null);
    await rpc.threads.followUp({ botId: id, text });
    await refreshThreadRef.current(id);
  }, []);
  const stopRun = useCallback(async () => {
    const id = activeBotId.current;
    if (!id) return;
    await rpc.threads.stop({ botId: id });
    await refreshThreadRef.current(id);
  }, []);
  const stopTeaching = useCallback(async () => {
    const id = activeBotId.current;
    if (!id || teachBusy) return;
    const recording = taughtSkills.find(
      (skill) => skill.status === "recording" && taughtSkillsBotId === id,
    );
    if (!recording) return;
    setTeachBusy(true);
    try {
      await rpc.taughtSkills.stop({ skillId: recording.id });
      await refreshThreadRef.current(id);
      setComputerOpen(false);
    } finally {
      setTeachBusy(false);
    }
  }, [teachBusy, taughtSkills, taughtSkillsBotId]);
  // Transcript and MessageView are memoized; these must stay referentially stable or every
  // Shell state change re-renders the whole transcript.
  const refreshActiveThread = useCallback(async () => {
    const id = activeBotId.current;
    if (!id) return;
    await refreshThreadRef.current(id);
  }, []);
  const addSkillRoutine = useCallback((name: string, prompt: string) => {
    setRoutineDraft({ name, prompt, schedule: defaultCronPreset(), silentMode: true });
    setEditingRoutine(null);
    setPanel("routine");
  }, []);
  const speakingMessageIdRef = useRef(speakingMessageId);
  speakingMessageIdRef.current = speakingMessageId;
  const speakMessage = useCallback((message: ThreadMessage) => {
    if (speakingMessageIdRef.current === message.id) {
      speaker.stop();
      return;
    }
    const text = speechFromBlocks(message.blocks);
    const id = activeBotId.current;
    if (text && id) void speaker.speak(text, { botId: id, messageId: message.id });
  }, []);

  async function createBot(input: {
    name: string;
    title: string;
    description: string;
    instructions?: string;
    computerMode: ComputerMode;
    skillIds?: string[];
    metadata?: Record<string, unknown>;
    inference?: BotInferenceConfig;
  }) {
    const bot = await rpc.bots.create({
      name: input.name.trim(),
      title: input.title,
      description: input.description,
      instructions: input.instructions?.trim() || input.description,
      notifyOnFinish: true,
      computerMode: input.computerMode,
      metadata: input.metadata,
      inference: input.inference,
    });
    if (input.skillIds && input.skillIds.length > 0) {
      await rpc.skills
        .assignToBot({
          botId: bot.id,
          skillIds: input.skillIds,
        })
        .catch(() => undefined);
    }
    await refreshBots();
    navigate(`/app/${bot.id}`);
    setPanel(null);
  }

  async function bootComputer({
    takeControl,
    overlay,
    force = false,
  }: {
    takeControl: boolean;
    overlay: boolean;
    force?: boolean;
  }) {
    if (!active) return;
    const needsBoot = force || computer?.state !== "running" || !screenUrl;
    if (overlay && needsBoot) setBooting(true);
    try {
      if (needsBoot) await rpc.computer.boot({ botId: active.id });
      if (takeControl) await rpc.computer.takeover({ botId: active.id });
      await refreshThread(active.id);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    if (panel !== "computer") {
      autoBooted.current = null;
      return;
    }
    if (!active) return;
    const botId = active.id;
    let cancelled = false;
    void (async () => {
      // Refresh from the server first. A stale SSE "booting" snapshot used to
      // skip this effect, so an RPC takeover never showed "You have control".
      const snap = await refreshThread(botId).catch(() => null);
      if (cancelled || activeBotId.current !== botId) return;
      const state = snap?.computer?.state;
      const screen = state === "running" ? await refreshComputerScreen(botId) : null;
      if (cancelled || activeBotId.current !== botId) return;
      const action = computerPanelAutoBoot(state, screen);
      if (action === "wait") {
        if (state === "running") autoBooted.current = botId;
        return;
      }
      if (action === "boot" && autoBooted.current === botId) return;
      autoBooted.current = botId;
      await bootComputer({
        takeControl: false,
        overlay: action === "boot",
        force: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, active?.id]);

  useEffect(() => {
    setComputerOpen(false);
  }, [active?.id]);

  // The routine panel copies a routine's data into local draft state at click time
  // rather than deriving it from `active`, so it goes stale across a bot switch —
  // without this, Save on bot B could silently update bot A's routine.
  useEffect(() => {
    setEditingRoutine(null);
    setDeleteRoutineTarget(null);
    setPanel((current) => (current === "routine" ? null : current));
  }, [active?.id]);

  // Preserve pendingAttachments across thread switches (v0.8.0); only clear transient banners
  useEffect(() => {
    setAttachmentNotice(null);
    setSendError(null);
    setDictationError(null);
  }, [active?.id]);

  // Escape key closes active modal or search bar
  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (remasterOpen && !remasterApplying) {
          setRemasterOpen(false);
          return;
        }
        if (inChatSearchOpen) {
          setInChatSearchOpen(false);
          setInChatSearchQuery("");
        }
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [inChatSearchOpen, remasterOpen, remasterApplying]);

  useEffect(() => {
    if (!computerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setComputerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [computerOpen]);

  useEffect(() => {
    if ((panel !== "computer" && !computerOpen) || !active || computer?.state !== "running") return;
    const ping = () => void rpc.computer.heartbeat({ botId: active.id }).catch(() => undefined);
    ping();
    const timer = window.setInterval(ping, 60_000);
    return () => window.clearInterval(timer);
  }, [panel, computerOpen, active?.id, computer?.state]);

  async function openComputer() {
    if (!active) return;
    const needsTakeover = !userHoldsComputerControl(computer, active.id);
    await bootComputer({
      takeControl: needsTakeover,
      overlay: needsTakeover || computer?.state !== "running",
      force: computer?.state !== "running",
    });
    setComputerOpen(true);
  }

  async function releaseComputer() {
    if (!active) return;
    setComputerOpen(false);
    await rpc.computer.release({ botId: active.id }).catch(() => undefined);
    await refreshThread(active.id);
  }

  const embeddedScreenUrl = embeddableScreenUrl(screenUrl);
  const hasControl = userHoldsComputerControl(computer, active?.id);

  const userName = session.data?.user.name ?? "You";
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      data-testid="shell-root"
      data-ready={shellReady}
      className="relative flex h-full min-w-0 overflow-hidden bg-[#050506] text-[#DFDFE2]"
    >
      {bootstrapMe !== undefined ? (
        <HostComputerPrompt initialMe={bootstrapMe ?? undefined} />
      ) : null}
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[300px] max-w-[85vw] shrink-0 flex-col border-r border-[#171719] bg-[#0B0B0C] transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:w-[316px] md:translate-x-0 ${
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="app-drag flex items-center justify-between px-[18px] pb-3 pt-4">
          <WindowChrome />
          <button
            type="button"
            onClick={() => {
              setPanel("create");
              setSidebarOpen(false);
            }}
            className="app-no-drag grid h-7 w-7 place-items-center rounded-lg text-[20px] leading-none text-[#7A7A80] hover:bg-[#1B1B1E] hover:text-[#C9C9CE] focus:outline-none focus:ring-1 focus:ring-[#3B3B40]"
            title="Nouvel agent"
            aria-label="Nouvel agent"
          >
            +
          </button>
        </div>
        <div className="mx-3.5 mb-3 flex items-center gap-2.5 rounded-xl border border-[#202023] bg-[#141416] px-3 py-2 text-[14px] text-[#6C6C70]">
          <Search size={17} strokeWidth={2} className="shrink-0 text-[#85858A]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="w-full bg-transparent outline-none text-[16px] sm:text-[14px]"
          />
        </div>
        <div className="rk-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2.5">
          {showWorkspaceSearch ? (
            <WorkspaceSearchResults
              hits={searchHits}
              loading={searchLoading}
              onSelect={(hit) => void jumpToSearchHit(hit)}
            />
          ) : (
            filtered.map((bot) => (
              <button
                key={bot.id}
                type="button"
                onClick={() => {
                  navigate(`/app/${bot.id}`);
                  setSidebarOpen(false);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setBotMenu({ botId: bot.id, position: { x: event.clientX, y: event.clientY } });
                }}
                className="flex gap-3 rounded-xl px-2.5 py-[11px] text-left"
                style={{
                  background: active?.id === bot.id ? "#161618" : "transparent",
                }}
              >
                <BotAvatar color={bot.color} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-[15px] text-[#ECECEE] ${
                        bot.unread ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {bot.name}
                      {bot.unread ? <span className="sr-only"> (non lu)</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-[#6C6C70]">
                      {bot.status === "idle"
                        ? ""
                        : bot.status === "running"
                          ? "en cours"
                          : bot.status === "queued"
                            ? "en attente"
                            : bot.status}
                      {bot.unread ? (
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 w-2 rounded-full bg-[#8B5CF6]"
                        />
                      ) : null}
                    </span>
                  </div>
                  <div
                    className={`mt-0.5 truncate text-[13.5px] ${
                      bot.unread ? "font-medium text-[#C9C9CE]" : "text-[#85858A]"
                    }`}
                  >
                    {bot.preview || bot.title}
                  </div>
                </div>
              </button>
            ))
          )}
          {archivedBots.length > 0 && !showWorkspaceSearch ? (
            <div className="mt-2 border-t border-[#202023] pt-2">
              <button
                type="button"
                aria-expanded={archivedOpen}
                onClick={() => setArchivedOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13.5px] text-[#85858A] hover:bg-[#131315]"
              >
                <span>Archivés</span>
                <span>{archivedBots.length}</span>
              </button>
              {archivedOpen
                ? archivedBots.map((bot) => (
                    <div key={bot.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2">
                      <BotAvatar color={bot.color} size={28} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-[#A8A8AD]">
                        {bot.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void rpc.bots.restore({ botId: bot.id }).then(() => refreshBots(true))
                        }
                        className="text-[12.5px] text-[#C9C9CE] hover:text-white"
                      >
                        Restaurer
                      </button>
                      <button
                        type="button"
                        aria-label={`Supprimer ${bot.name}`}
                        onClick={() => setDeleteTarget(bot)}
                        className="text-[12.5px] text-[#FF5364]"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          data-testid="open-sovereign-cockpit-btn"
          onClick={() => {
            setCockpitOpen(true);
            setSidebarOpen(false);
          }}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
            <ShieldCheck size={15} strokeWidth={1.7} />
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Cockpit & Sobriété IA</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSkillLibraryDraft(null);
            setSkillLibraryOpen(true);
            setSidebarOpen(false);
          }}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#17171A] text-[#9A9AA0]">
            <Sparkles size={15} strokeWidth={1.7} />
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Bibliothèque de Skills</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setPluginsOpen(true);
            setSidebarOpen(false);
          }}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[#131315]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#17171A] text-[#9A9AA0]">
            <Puzzle size={15} strokeWidth={1.7} />
          </span>
          <span className="text-[14.5px] text-[#C9C9CE]">Plugins & Outils</span>
        </button>
        <div className="relative">
          {menuOpen ? (
            <div className="absolute bottom-14 left-3 right-3 rounded-2xl border border-[#2A2A2F] bg-[#1A1A1D] p-2 shadow-[0_22px_50px_rgba(0,0,0,.55)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSidebarOpen(false);
                  setModelsOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
              >
                <Cpu size={16} strokeWidth={1.7} className="text-[#9A9AA0]" />
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">Modèles IA</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
                onClick={async () => {
                  setUsage(await rpc.usage.summary());
                }}
              >
                <Gauge size={16} strokeWidth={1.7} className="text-[#9A9AA0]" />
                <span className="flex-1 text-left text-[14.5px] text-[#ECECEE]">
                  Consommation hebdomadaire
                </span>
              </button>
              {usage ? (
                <p className="px-3 pb-2 text-[12.5px] text-[#85858A]">
                  {usage.runs} exécutions · {usage.inputTokens + usage.outputTokens} tokens
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void authClient.signOut().then(() => navigate("/"))}
                className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[#232327]"
              >
                <LogOut size={16} strokeWidth={1.7} className="text-[#9A9AA0]" />
                <span className="text-[14.5px] text-[#ECECEE]">Se déconnecter</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-[11px] px-[18px] py-3.5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#232326] text-[12px] text-[#A8A8AD]">
              {initials}
            </span>
            <span className="text-[14.5px] text-[#C9C9CE]">{userName}</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[#0D0D0E]">
        <div className="flex items-center justify-between border-b border-[#141416] px-3.5 py-3 md:px-[22px] md:py-[17px]">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Ouvrir le menu"
              onClick={() => setSidebarOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#A8A8AD] hover:bg-[#1B1B1E] md:hidden"
            >
              <Menu size={20} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              data-testid="bot-settings-trigger"
              onClick={() => setPanel(active ? "settings" : "create")}
              className="flex min-w-0 items-center gap-2.5 sm:gap-3"
            >
              {active ? <BotAvatar color={active.color} size={26} /> : null}
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-[#ECECEE] md:text-[16px]">
                  {active?.name ?? "Sélectionner un agent"}
                </span>
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            {active && (snapshot?.messages?.length ?? 0) >= 2 ? (
              <button
                type="button"
                data-testid="remaster-thread-trigger"
                title="Remasteriser le fil en Handoff de 5 lignes (Économie de tokens)"
                aria-label="Remasteriser le fil en Handoff de 5 lignes"
                onClick={() => {
                  const handoff = buildFiveLineThreadHandoff({
                    botName: active.name,
                    botTitle: active.title,
                    botDescription: active.description,
                    messages: (snapshot?.messages ?? []) as unknown as RemasterableMessage[],
                  });
                  setRemasterDraft(handoff);
                  setRemasterCopied(false);
                  setRemasterOpen(true);
                }}
                className={`flex h-[30px] items-center gap-1.5 rounded-[9px] border px-2 text-[12px] font-medium transition-colors sm:px-2.5 ${
                  shouldSuggestThreadRemaster(snapshot?.messages?.length ?? 0)
                    ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/15 text-[#DDD6FE] hover:bg-[#8B5CF6]/25"
                    : "border-[#26262A] bg-[#141417] text-[#C9C9CE] hover:bg-[#1B1B1E]"
                }`}
              >
                <Sparkles size={13} strokeWidth={1.8} className="shrink-0 text-[#A78BFA]" />
                <span className="sm:hidden">5L</span>
                <span className="hidden sm:inline">Remasteriser</span>
                {shouldSuggestThreadRemaster(snapshot?.messages?.length ?? 0) ? (
                  <span className="hidden rounded-full bg-[#8B5CF6]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#EDE9FE] lg:inline">
                    Éco Tokens
                  </span>
                ) : null}
              </button>
            ) : null}
            {active &&
            (snapshot?.messages?.length ?? 0) >= 1 &&
            bots.some((b) => b.id !== active.id) ? (
              <button
                type="button"
                data-testid="relay-thread-trigger"
                title="Transférer la mission à un autre Agent (Relais contrôlé en 5 lignes)"
                aria-label="Transférer la mission à un autre Agent"
                onClick={() => {
                  const otherBots = bots.filter((b) => b.id !== active.id);
                  const target = otherBots[0];
                  if (!target) return;
                  setRelayTargetBotId(target.id);
                  setRelayDirective("");
                  const mappedMsgs = (snapshot?.messages ?? []).map((m) => ({
                    role: m.role,
                    text: speechFromBlocks(m.blocks) || "",
                  }));
                  setRelayDraft(
                    buildInterAgentRelayBriefFr({
                      sourceBotName: active.name,
                      targetBotName: target.name,
                      directive: "",
                      messages: mappedMsgs,
                    }),
                  );
                  setRelayOpen(true);
                }}
                className="flex h-[30px] items-center gap-1.5 rounded-[9px] border border-[#26262A] bg-[#141417] px-2 text-[12px] font-medium text-[#C9C9CE] hover:bg-[#1B1B1E] transition-colors sm:px-2.5"
              >
                <Share2 size={13} strokeWidth={1.8} className="shrink-0 text-emerald-400" />
                <span className="hidden sm:inline">Transférer</span>
              </button>
            ) : null}
            <div className="group relative">
              <button
                type="button"
                title="Rechercher dans la discussion"
                aria-label="Rechercher dans la conversation"
                data-testid="in-chat-search-trigger"
                onClick={() => {
                  setInChatSearchOpen((v) => !v);
                  window.setTimeout(() => inChatSearchInputRef.current?.focus(), 0);
                }}
                className="grid h-[34px] w-[36px] place-items-center rounded-[10px] border border-[#26262A] bg-[#141417] text-[#C9C9CE] hover:border-[#3F3F46] hover:bg-[#1E1E24] hover:text-white transition-colors"
                style={{ background: inChatSearchOpen ? "#1E1E24" : undefined }}
              >
                <Search size={18} strokeWidth={2.1} />
              </button>
              <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden whitespace-nowrap rounded-lg border border-[#2C2C34] bg-[#141418] px-2.5 py-1 text-[11.5px] font-medium text-[#ECECEE] shadow-xl group-hover:block">
                Rechercher dans la discussion
              </span>
            </div>
            <div className="group relative">
              <button
                type="button"
                data-testid="routines-panel-trigger"
                title="Routines programmées & Automatisation de l'agent"
                aria-label="Routines programmées & Automatisation de l'agent"
                onClick={() => setPanel((p) => (p === "computer" ? null : "computer"))}
                className="flex h-[34px] items-center gap-1.5 rounded-[10px] border border-[#26262A] bg-[#141417] px-2.5 text-[12.5px] font-medium text-[#ECECEE] hover:border-[#3F3F46] hover:bg-[#1E1E24] transition-colors"
                style={{ background: panel ? "#1E1E24" : undefined }}
              >
                <CalendarClock size={18} strokeWidth={1.9} className="shrink-0 text-amber-400" />
                <span className="hidden md:inline">Routines</span>
                {activeRoutines.length > 0 ? (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-amber-300">
                    {activeRoutines.length}
                  </span>
                ) : null}
              </button>
              <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden whitespace-nowrap rounded-lg border border-[#2C2C34] bg-[#141418] px-2.5 py-1 text-[11.5px] font-medium text-[#ECECEE] shadow-xl group-hover:block">
                Routines programmées & Automatisation de l'agent
              </span>
            </div>
          </div>
        </div>
        {inChatSearchOpen ? (
          <div
            data-testid="in-chat-search-bar"
            className="flex items-center gap-2 border-b border-[#1D1D20] bg-[#111114] px-4 py-2"
          >
            <input
              ref={inChatSearchInputRef}
              type="search"
              value={inChatSearchQuery}
              onChange={(e) => setInChatSearchQuery(e.target.value)}
              placeholder="Rechercher dans ce fil de discussion…"
              aria-label="Rechercher dans ce fil de discussion"
              className="flex-1 rounded-lg border border-[#26262A] bg-[#0B0B0D] px-3 py-1.5 text-[13.5px] text-[#ECECEE] outline-none focus:border-[#4A4A50]"
            />
            <span className="text-[12px] text-[#85858A]" data-testid="in-chat-search-count">
              {inChatSearchQuery.trim()
                ? `${
                    (snapshot?.messages ?? []).filter((m) =>
                      m.blocks.some(
                        (b) =>
                          "text" in b &&
                          typeof b.text === "string" &&
                          b.text.toLowerCase().includes(inChatSearchQuery.trim().toLowerCase()),
                      ),
                    ).length
                  } résultat(s)`
                : ""}
            </span>
            <button
              type="button"
              aria-label="Fermer la recherche"
              onClick={() => {
                setInChatSearchOpen(false);
                setInChatSearchQuery("");
              }}
              className="rounded px-2 py-1 text-[12px] text-[#85858A] hover:bg-[#1B1B1E] hover:text-[#ECECEE]"
            >
              ✕
            </button>
          </div>
        ) : null}
        <Transcript
          scrollRef={messageScroll}
          botId={active?.id ?? ""}
          messages={
            inChatSearchOpen && inChatSearchQuery.trim()
              ? (snapshot?.messages ?? []).filter((m) =>
                  m.blocks.some(
                    (b) =>
                      "text" in b &&
                      typeof b.text === "string" &&
                      b.text.toLowerCase().includes(inChatSearchQuery.trim().toLowerCase()),
                  ),
                )
              : (snapshot?.messages ?? [])
          }
          olderCursor={snapshot?.olderCursor ?? null}
          loadingOlder={loadingOlder}
          answerableAskMessageId={answerableAskMessageId}
          running={Boolean(
            snapshot?.run && ["running", "queued", "leased"].includes(snapshot.run.status),
          )}
          onLoadOlder={loadOlder}
          onOpenBot={openBot}
          onAnswer={answerMessage}
          onSelectChoice={(text) => void sendMessage(text)}
          onReact={handleReact}
          onRefresh={refreshActiveThread}
          onAddRoutine={addSkillRoutine}
          onMemorizeSkill={(text) => {
            const firstHeading =
              /^#+\s+(.+)$/m.exec(text)?.[1]?.trim() ||
              `Méthode ${active?.name || "Souveraine"} (${new Date().toLocaleDateString("fr-FR")})`;
            const cleanTitle = firstHeading.replace(/[*_`]/g, "").slice(0, 80);
            const firstPara =
              text
                .split("\n")
                .map((l) => l.trim())
                .find((l) => l.length > 25 && !l.startsWith("#")) ||
              `Compétence capitalisée depuis une session avec ${active?.name || "votre agent"}.`;
            setSkillLibraryDraft({
              name: cleanTitle,
              description: firstPara.slice(0, 220),
              tags: [active?.name || "Agent", "Capitalisation"],
              content: text,
            });
            setSkillLibraryOpen(true);
          }}
          voiceReady={Boolean(voiceStatus?.ready)}
          speakingMessageId={speakingMessageId}
          onSpeak={speakMessage}
        />
        {recordingSkill ? (
          <div className="px-6 pb-2 text-center text-[13px] text-[#EF4444]">
            Apprentissage en cours — arrêtez l'apprentissage avant d'envoyer un nouveau message.
          </div>
        ) : null}
        <Composer
          activeName={active?.name}
          draftKey={active?.id ? `bot:${active.id}` : "default"}
          enterToSend={enterToSend}
          bots={bots}
          running={Boolean(snapshot?.run && isActive(snapshot.run.status))}
          disabled={Boolean(recordingSkill)}
          pendingAttachments={activePendingAttachments}
          attachmentNotice={attachmentNotice}
          sendError={sendError}
          dictationError={dictationError}
          onClearError={() => {
            setSendError(null);
            setDictationError(null);
          }}
          sending={sending}
          fileInputRef={fileInputRef}
          onAttachmentPick={onAttachmentPick}
          onRemoveAttachment={removeAttachment}
          onSend={sendMessage}
          onStop={stopRun}
          dictating={dictating}
          transcribe={Boolean(voiceStatus?.transcribe)}
          onDictateStart={(onFinal) => {
            void dictation.listen({
              mode: "hold",
              transcribe: Boolean(voiceStatus?.transcribe),
              onFinal,
            });
          }}
          onDictateStop={() => dictation.submitHold()}
        />
      </main>

      <aside
        data-testid="side-panel"
        data-panel={panel ?? "closed"}
        className={`fixed inset-0 z-40 flex min-h-0 flex-col overflow-hidden bg-[#0A0A0B] md:relative md:inset-auto md:z-20 md:transition-[width] md:duration-150 md:ease-out ${
          panel && (active || panel === "create")
            ? "w-full md:w-[384px] md:border-l md:border-[#141416]"
            : "pointer-events-none hidden md:flex md:w-0"
        }`}
      >
        {panel && (active || panel === "create") ? (
          <div className="rk-scroll h-full w-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-[17px] md:w-[384px]">
            {panel !== "routine" && panel !== "create" && active ? (
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13.5px] text-[#85858A]">
                  {computer?.state ?? active.status}
                </span>
                <div className="flex gap-3.5">
                  <button
                    type="button"
                    aria-label="Paramètres de l'agent"
                    onClick={() => setPanel("settings")}
                  >
                    <Settings size={16} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    aria-label="Fermer le panneau"
                    onClick={() => setPanel(null)}
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ) : null}
            {panel === "computer" && active ? (
              <div>
                <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] bg-[#0E0E10]">
                  {computerOpen ? (
                    <div className="grid h-full place-items-center text-sm text-[#6C6C70]">
                      Ouvert en plein écran
                    </div>
                  ) : computer?.kind === "desktop" ? (
                    <div className="grid h-full place-items-center px-6 text-center text-sm text-[#6C6C70]">
                      Cet agent s'exécute directement sur son espace de travail persistant.
                    </div>
                  ) : computer?.state === "running" && embeddedScreenUrl ? (
                    <iframe
                      title="Aperçu de l'écran"
                      src={embeddedScreenUrl}
                      sandbox={screenIframeSandbox(embeddedScreenUrl)}
                      className="h-full w-full border-0 bg-black"
                      allow="clipboard-read; clipboard-write"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-[#6C6C70]">
                      {computerPlaceholder(
                        computer?.state,
                        booting,
                        computerLabel(computer?.mode, active.name),
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute inset-0 cursor-pointer"
                    aria-label="Ouvrir l'ordinateur"
                    onClick={() => void openComputer()}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[13.5px] text-[#85858A]">
                    {computer?.busyBotName
                      ? `${computer.busyBotName} l'utilise actuellement`
                      : hasControl
                        ? "Vous avez le contrôle"
                        : computer?.state === "suspended"
                          ? "En veille"
                          : computerLabel(computer?.mode, active.name)}
                  </span>
                  {hasControl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void releaseComputer()}
                    >
                      Libérer
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openComputer()}
                    >
                      Prendre le contrôle
                    </Button>
                  )}
                </div>
                <div className="mt-[30px] mb-3 text-[14px] text-[#85858A]">
                  Routines & Planifications
                </div>
                {activeRoutines.map((routine) => (
                  <button
                    key={routine.id}
                    type="button"
                    onClick={() => {
                      setRoutineDraft({
                        name: routine.name,
                        prompt: stripSilentRoutineClauseForEditor(routine.prompt),
                        schedule: presetFromCron(routine.cron),
                        silentMode: hasSilentRoutineClause(routine.prompt) || true,
                      });
                      setEditingRoutine(routine);
                      setPanel("routine");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2.5 hover:bg-[#121214]"
                  >
                    <span className="text-[#E65707]">◷</span>
                    <span className="min-w-0 flex-1 truncate text-left text-[14.5px] text-[#ECECEE]">
                      {routine.name}
                    </span>
                    <span
                      title="Garde-fou Sobriété NO_SIGNAL actif"
                      className="shrink-0 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 text-[10.5px] font-medium text-[#34D399]"
                    >
                      NO_SIGNAL
                    </span>
                    <span className="shrink-0 text-[13px] text-[#6C6C70]">
                      {formatCronFr(routine.cron)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setRoutineDraft({
                      name: "",
                      prompt: "",
                      schedule: defaultCronPreset(),
                      silentMode: true,
                    });
                    setEditingRoutine(null);
                    setPanel("routine");
                  }}
                  className="mt-1 flex items-center gap-2.5 px-2.5 py-2.5 text-[14.5px] text-[#7A7A80]"
                >
                  + Nouvelle routine
                </button>
                {active ? (
                  <TeachComputerSection
                    botId={active.id}
                    computer={computer}
                    skills={activeTaughtSkills}
                    busy={teachBusy}
                    onRefresh={refreshActiveThread}
                    onOpenComputer={openComputer}
                    onStopTeaching={stopTeaching}
                    onAddRoutine={(skill) => {
                      setRoutineDraft({
                        name: skill.name || skill.goal.slice(0, 80),
                        prompt: `Run taught skill: ${skill.name || skill.goal}\n${skill.playbook.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
                        schedule: defaultCronPreset(),
                        silentMode: true,
                      });
                      setEditingRoutine(null);
                      setPanel("routine");
                    }}
                  />
                ) : null}
              </div>
            ) : null}
            {panel === "create" ? (
              <CreateBotForm
                onCancel={() => setPanel(null)}
                onCreate={(input) => void createBot(input)}
              />
            ) : null}
            {panel === "settings" && active ? (
              <BotSettings
                key={active.id}
                bot={active}
                onSave={async ({ computerMode, skillIds, ...patch }) => {
                  if (computerMode !== active.computerMode) {
                    await rpc.bots.setComputer({
                      botId: active.id,
                      mode: computerMode,
                    });
                  }
                  await rpc.bots.update({ botId: active.id, ...patch });
                  if (skillIds) {
                    await rpc.skills
                      .assignToBot({
                        botId: active.id,
                        skillIds,
                      })
                      .catch(() => undefined);
                  }
                  await refreshBots();
                }}
                onExport={async () => {
                  const manifest = await rpc.export.bot({ botId: active.id });
                  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${active.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                onClear={() => setClearTarget(active)}
              />
            ) : null}
            {panel === "routine" && active ? (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPanel("computer")}
                    className="text-[#9A9AA0]"
                    aria-label="Retour"
                  >
                    <ChevronLeft size={18} strokeWidth={1.8} />
                  </button>
                  <div className="text-[15.5px] font-medium text-[#F1F1F2]">Routine programmée</div>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="text-[#6C6C70]"
                    aria-label="Fermer"
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>

                {/* IDÉE N°4 : Modèles de Routines Quotidiennes (Heure de Paris) */}
                <div
                  data-testid="routine-templates-bar"
                  className="mb-5 rounded-xl border border-[#26262A] bg-[#121215] p-3"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ECECEE] mb-1">
                    <Sparkles size={13} className="text-amber-400 shrink-0" />
                    <span>Modèles de Routines Prêts à l'Emploi (Heure de Paris)</span>
                  </div>
                  <p className="text-[11px] text-[#85858A] mb-2.5">
                    Cliquez sur un modèle pour pré-remplir le titre, l'horaire français 24h et les
                    instructions :
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {SOVEREIGN_ROUTINE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        data-testid={`routine-template-${tpl.id}`}
                        onClick={() => {
                          const [hh, mm] = tpl.time24h.split(":");
                          const dow = tpl.daysOfWeek.length === 7 ? "*" : tpl.daysOfWeek.join(",");
                          const cronStr = `${Number(mm)} ${Number(hh)} * * ${dow}`;
                          setRoutineDraft({
                            name: tpl.title,
                            prompt: tpl.prompt,
                            schedule: presetFromCron(cronStr),
                            silentMode: tpl.silentGuard,
                          });
                        }}
                        className="flex flex-col items-start rounded-lg border border-[#26262A] bg-[#17171B] px-3 py-2 text-left hover:border-[#3F3F46] hover:bg-[#1E1E24] transition-colors min-h-[44px]"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#ECECEE] truncate">
                            {tpl.title}
                          </span>
                          <span className="shrink-0 rounded-full bg-[#232329] px-2 py-0.5 font-mono text-[10px] text-amber-300">
                            {tpl.badge}
                          </span>
                        </div>
                        <span className="mt-0.5 text-[11px] text-[#85858A] line-clamp-1">
                          {tpl.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="text-[14px] text-[#85858A]">
                  Nom de la routine
                  <input
                    value={routineDraft.name}
                    onChange={(e) => setRoutineDraft((s) => ({ ...s, name: e.target.value }))}
                    placeholder="Ex: Rapport quotidien, Veille"
                    className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[#ECECEE]"
                  />
                </label>
                <label className="mt-5 block text-[14px] text-[#85858A]">
                  Instructions à exécuter
                  <textarea
                    value={routineDraft.prompt}
                    onChange={(e) => setRoutineDraft((s) => ({ ...s, prompt: e.target.value }))}
                    placeholder="Ce que l'agent doit accomplir à chaque déclenchement..."
                    rows={4}
                    className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[#ECECEE]"
                  />
                </label>
                <div className="mt-5 text-[14px] text-[#85858A]">
                  Fréquence d'exécution
                  <Suspense fallback={null}>
                    <RoutineSchedule
                      value={routineDraft.schedule}
                      onChange={(schedule) => setRoutineDraft((s) => ({ ...s, schedule }))}
                    />
                  </Suspense>
                </div>
                <label
                  data-testid="routine-silent-mode-toggle"
                  className="mt-4 flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#26262A] bg-[#121215] p-3.5 transition-colors hover:border-[#34343A]"
                >
                  <input
                    type="checkbox"
                    checked={routineDraft.silentMode}
                    onChange={(e) =>
                      setRoutineDraft((s) => ({ ...s, silentMode: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#3A3A40] bg-[#1B1B1F] accent-[#10B981]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-[#ECECEE]">
                      <span>Mode Routine Silencieuse</span>
                      <span className="rounded-full bg-[#10B981]/15 px-2 py-0.5 font-mono text-[10.5px] text-[#34D399]">
                        NO_SIGNAL
                      </span>
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-[#85858A]">
                      Économie de tokens : si aucune nouveauté ou anomalie n'est détectée dès le 1er
                      tour, l'agent répond « NO_SIGNAL » et s'arrête immédiatement sans rapport
                      artificiel ni notification inutile.
                    </span>
                  </span>
                </label>
                <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    disabled={savingRoutine || runningRoutine}
                    onClick={async () => {
                      if (routineSavePending.current) return;
                      const targetBotId = active.id;
                      const targetRoutine = editingRoutine;
                      if (targetRoutine && targetRoutine.botId !== targetBotId) return;
                      routineSavePending.current = true;
                      setSavingRoutine(true);
                      const finalRoutinePrompt = applySilentRoutineClause(
                        routineDraft.prompt || "Check in.",
                        routineDraft.silentMode,
                      );
                      try {
                        if (targetRoutine) {
                          await rpc.routines.update({
                            routineId: targetRoutine.id,
                            name: routineDraft.name || "Routine",
                            prompt: finalRoutinePrompt,
                            cron: cronFromPreset(routineDraft.schedule),
                            timezone:
                              targetRoutine.timezone === "UTC"
                                ? DEFAULT_ROUTINE_TIMEZONE
                                : targetRoutine.timezone,
                          });
                        } else {
                          await rpc.routines.create({
                            botId: targetBotId,
                            name: routineDraft.name || "Routine",
                            prompt: finalRoutinePrompt,
                            cron: cronFromPreset(routineDraft.schedule),
                            timezone: DEFAULT_ROUTINE_TIMEZONE,
                            active: true,
                            notify: true,
                          });
                        }
                        if (activeBotId.current !== targetBotId) return;
                        await refreshThread(targetBotId);
                        if (activeBotId.current === targetBotId) setPanel("computer");
                      } finally {
                        routineSavePending.current = false;
                        setSavingRoutine(false);
                      }
                    }}
                    className="rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[#17171A] disabled:opacity-40"
                  >
                    {savingRoutine ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  {editingRoutine?.botId === active.id ? (
                    <>
                      <button
                        type="button"
                        disabled={savingRoutine || runningRoutine}
                        onClick={async () => {
                          if (routineRunPending.current) return;
                          const targetBotId = active.id;
                          const targetRoutine = editingRoutine;
                          routineRunPending.current = true;
                          setRunningRoutine(true);
                          try {
                            await rpc.routines.testRun({ routineId: targetRoutine.id });
                            await refreshThread(targetBotId);
                          } finally {
                            routineRunPending.current = false;
                            setRunningRoutine(false);
                          }
                        }}
                        className="rounded-[11px] border border-[#26262A] px-4 py-2 text-[14px] text-[#ECECEE] disabled:opacity-40"
                      >
                        {runningRoutine ? "Exécution…" : "Tester maintenant"}
                      </button>
                      <button
                        type="button"
                        disabled={savingRoutine || runningRoutine}
                        onClick={() => setDeleteRoutineTarget(editingRoutine)}
                        className="rounded-[11px] px-4 py-2 text-[14px] text-[#FF5364] disabled:opacity-40"
                      >
                        Supprimer la routine
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <Suspense fallback={null}>
        {contextBot && botMenu ? (
          <BotContextMenu
            bot={contextBot}
            position={botMenu.position}
            onClose={closeBotMenu}
            onTogglePinned={() => {
              setBotMenu(null);
              void rpc.bots
                .update({ botId: contextBot.id, pinned: !contextBot.pinned })
                .then(() => refreshBots());
            }}
            onToggleUnread={() => {
              const unread = !contextBot.unread;
              setBotMenu(null);
              const request = unread ? markBotUnread(contextBot.id) : markBotRead(contextBot.id);
              void request.catch(() => undefined);
            }}
            onEdit={() => {
              navigate(`/app/${contextBot.id}`);
              setPanel("settings");
              setBotMenu(null);
            }}
            onDuplicate={() => {
              setBotMenu(null);
              void rpc.bots.duplicate({ botId: contextBot.id }).then(async (bot) => {
                await refreshBots();
                navigate(`/app/${bot.id}`);
              });
            }}
            onClear={() => {
              setClearTarget(contextBot);
              setBotMenu(null);
            }}
            onArchive={() => {
              setBotMenu(null);
              void rpc.bots.archive({ botId: contextBot.id }).then(() => refreshBots(true));
            }}
            onDelete={() => {
              setDeleteTarget(contextBot);
              setBotMenu(null);
            }}
          />
        ) : null}

        {deleteTarget ? (
          <DeleteBotDialog
            bot={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={async (deleteMemories) => {
              await rpc.bots.remove({ botId: deleteTarget.id, deleteMemories });
              setDeleteTarget(null);
              setPanel(null);
              await refreshBots(true);
            }}
          />
        ) : null}

        {clearTarget ? (
          <ClearConversationDialog
            bot={clearTarget}
            onCancel={() => setClearTarget(null)}
            onConfirm={async () => {
              await rpc.threads.clear({ botId: clearTarget.id });
              if (active?.id === clearTarget.id) {
                expandedHistoryThread.current = null;
                pinnedAroundRef.current = null;
                historyEpoch.current += 1;
                setSnapshot((current) =>
                  current ? { ...current, messages: [], olderCursor: null, run: null } : current,
                );
              }
              setClearTarget(null);
              await refreshBots();
            }}
          />
        ) : null}

        {deleteRoutineTarget ? (
          <DeleteRoutineDialog
            routine={deleteRoutineTarget}
            onCancel={() => setDeleteRoutineTarget(null)}
            onConfirm={async () => {
              const target = deleteRoutineTarget;
              await rpc.routines.remove({ routineId: target.id });
              setDeleteRoutineTarget(null);
              setEditingRoutine((current) => (current?.id === target.id ? null : current));
              if (activeBotId.current !== target.botId) return;
              await refreshThread(target.botId);
              if (activeBotId.current === target.botId) setPanel("computer");
            }}
          />
        ) : null}

        {pluginsOpen ? <PluginsOverlay onClose={() => setPluginsOpen(false)} /> : null}
        {cockpitOpen ? (
          <SovereignCockpitOverlay
            bots={bots}
            initialUsage={usage}
            onClose={() => setCockpitOpen(false)}
          />
        ) : null}
        {skillLibraryOpen ? (
          <SkillLibraryOverlay
            initialDraftSkill={skillLibraryDraft}
            onClose={() => {
              setSkillLibraryOpen(false);
              setSkillLibraryDraft(null);
            }}
          />
        ) : null}
        {relayOpen && active ? (
          <div
            data-testid="inter-agent-relay-dialog"
            role="dialog"
            aria-label="Transférer la mission à un autre Agent"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5"
          >
            <button
              type="button"
              aria-label="Fermer le transfert inter-agents"
              onClick={() => {
                if (!relayApplying) setRelayOpen(false);
              }}
              className="absolute inset-0 h-full w-full cursor-default bg-black/75 backdrop-blur-sm"
            />
            <div className="relative z-10 flex max-h-[90dvh] w-full max-w-xl flex-col overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[#2C2C34] bg-[#141418] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[#ECECEE] shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Share2 size={17} strokeWidth={1.8} className="shrink-0 text-emerald-400" />
                    <h3 className="text-[16px] font-semibold text-[#F1F1F4] sm:text-[17.5px]">
                      Passer le relais à un autre Agent
                    </h3>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#9A9AA0] sm:text-[13px]">
                    Transmet les conclusions de <strong>{active.name}</strong> à un autre agent sous
                    forme d'un brief synthétique de 5 lignes validé par vous (0 boucle autonome
                    inter-agents).
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fermer la modale de transfert"
                  disabled={relayApplying}
                  onClick={() => setRelayOpen(false)}
                  className="grid min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 shrink-0 place-items-center rounded-lg p-1.5 text-[#85858A] hover:bg-[#1F1F24] hover:text-[#ECECEE]"
                >
                  <X size={16} strokeWidth={1.8} />
                </button>
              </div>

              <label className="mt-4 block text-[12.5px] font-medium text-[#C9C9CE] sm:text-[13px]">
                Agent destinataire
                <select
                  data-testid="relay-target-bot-select"
                  value={relayTargetBotId}
                  onChange={(e) => {
                    const nextBotId = e.target.value;
                    setRelayTargetBotId(nextBotId);
                    const targetBot = bots.find((b) => b.id === nextBotId);
                    if (targetBot) {
                      const mappedMsgs = (snapshot?.messages ?? []).map((m) => ({
                        role: m.role,
                        text: speechFromBlocks(m.blocks) || "",
                      }));
                      setRelayDraft(
                        buildInterAgentRelayBriefFr({
                          sourceBotName: active.name,
                          targetBotName: targetBot.name,
                          directive: relayDirective,
                          messages: mappedMsgs,
                        }),
                      );
                    }
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#2C2C34] bg-[#0B0B0D] px-3 py-2.5 text-[16px] sm:text-[13.5px] text-[#ECECEE] outline-none focus:border-emerald-500/60"
                >
                  {bots
                    .filter((b) => b.id !== active.id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.title}
                      </option>
                    ))}
                </select>
              </label>

              <label className="mt-3 block text-[12.5px] font-medium text-[#C9C9CE] sm:text-[13px]">
                Ordre de mission spécifique (optionnel)
                <input
                  type="text"
                  data-testid="relay-directive-input"
                  value={relayDirective}
                  onChange={(e) => {
                    const nextDir = e.target.value;
                    setRelayDirective(nextDir);
                    const targetBot = bots.find((b) => b.id === relayTargetBotId);
                    if (targetBot) {
                      const mappedMsgs = (snapshot?.messages ?? []).map((m) => ({
                        role: m.role,
                        text: speechFromBlocks(m.blocks) || "",
                      }));
                      setRelayDraft(
                        buildInterAgentRelayBriefFr({
                          sourceBotName: active.name,
                          targetBotName: targetBot.name,
                          directive: nextDir,
                          messages: mappedMsgs,
                        }),
                      );
                    }
                  }}
                  placeholder="Ex: Rédige l'article WordPress complet à partir de ce brief SEO..."
                  className="mt-1.5 w-full rounded-xl border border-[#2C2C34] bg-[#0B0B0D] px-3 py-2 text-[16px] sm:text-[13px] text-[#ECECEE] outline-none focus:border-emerald-500/60"
                />
              </label>

              <label className="mt-3 block text-[12.5px] font-medium text-[#C9C9CE] sm:text-[13px]">
                Dossier de transmission (modifiable avant envoi)
                <textarea
                  data-testid="relay-draft-textarea"
                  value={relayDraft}
                  onChange={(e) => setRelayDraft(e.target.value)}
                  rows={6}
                  className="mt-1.5 w-full rounded-xl border border-[#2C2C34] bg-[#0B0B0D] px-3 py-2.5 font-mono text-[16px] leading-relaxed text-[#ECECEE] outline-none focus:border-emerald-500/60 sm:text-[12.5px]"
                />
              </label>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  disabled={relayApplying}
                  onClick={() => setRelayOpen(false)}
                  className="w-full min-h-[44px] sm:min-h-0 rounded-xl px-3.5 py-2.5 text-[13.5px] text-[#9A9AA0] hover:bg-[#1F1F24] sm:w-auto"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  data-testid="relay-thread-apply"
                  disabled={relayApplying || !relayTargetBotId || !relayDraft.trim()}
                  onClick={async () => {
                    if (!relayTargetBotId || relayApplying) return;
                    const destBotId = relayTargetBotId;
                    const briefToSend = relayDraft.trim();
                    setRelayApplying(true);
                    try {
                      setRelayOpen(false);
                      navigate(`/app/${destBotId}`);
                      await rpc.threads.send({ botId: destBotId, text: briefToSend });
                      await refreshThread(destBotId);
                      await refreshBots();
                    } finally {
                      setRelayApplying(false);
                    }
                  }}
                  className="w-full min-h-[44px] sm:min-h-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13.5px] font-semibold text-black shadow-sm hover:bg-emerald-400 disabled:opacity-50 sm:w-auto"
                >
                  {relayApplying ? "Transmission…" : "Transférer & Lancer la mission"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {remasterOpen && active ? (
          <div
            data-testid="remaster-thread-dialog"
            role="dialog"
            aria-label="Remasteriser le fil en Handoff de 5 lignes"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          >
            <button
              type="button"
              aria-label="Fermer la remasterisation du fil"
              onClick={() => {
                if (!remasterApplying) setRemasterOpen(false);
              }}
              className="absolute inset-0 h-full w-full cursor-default bg-black/75 backdrop-blur-sm"
            />
            <div className="relative z-10 flex max-h-[90dvh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-[#2C2C34] bg-[#141418] p-4 text-[#ECECEE] shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles size={17} strokeWidth={1.8} className="shrink-0 text-[#A78BFA]" />
                    <h3 className="text-[16px] font-semibold text-[#F1F1F4] sm:text-[17.5px]">
                      Remasteriser le fil (Handoff 5 lignes)
                    </h3>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#9A9AA0] sm:text-[13px]">
                    Compacte l'historique actuel sans aucun appel IA et relance {active.name} sur un
                    fil propre (0 token d'historique traîné) tout en préservant l'ordinateur et la
                    mémoire.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fermer la modale de remasterisation"
                  disabled={remasterApplying}
                  onClick={() => setRemasterOpen(false)}
                  className="shrink-0 rounded-lg p-1.5 text-[#85858A] hover:bg-[#1F1F24] hover:text-[#ECECEE]"
                >
                  <X size={16} strokeWidth={1.8} />
                </button>
              </div>

              {(() => {
                const stats = estimateTokensSavedByRemaster(
                  (snapshot?.messages ?? []) as unknown as RemasterableMessage[],
                  remasterDraft,
                );
                return (
                  <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl border border-[#24242C] bg-[#0E0E11] p-2.5 text-center sm:p-3">
                    <div>
                      <div className="text-[11px] text-[#85858A]">Messages condensés</div>
                      <div className="mt-0.5 font-mono text-[14px] font-semibold text-[#ECECEE] sm:text-[15px]">
                        {snapshot?.messages?.length ?? 0} → 1
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#85858A]">Tokens économisés</div>
                      <div className="mt-0.5 font-mono text-[14px] font-semibold text-[#34D399] sm:text-[15px]">
                        ~{stats.savedTokens}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#85858A]">Allègement contexte</div>
                      <div className="mt-0.5 font-mono text-[14px] font-semibold text-[#A78BFA] sm:text-[15px]">
                        -{stats.reductionPercent}%
                      </div>
                    </div>
                  </div>
                );
              })()}

              <label className="mt-3.5 block text-[12.5px] font-medium text-[#C9C9CE] sm:text-[13px]">
                Handoff de continuité (modifiable avant relance)
                <textarea
                  data-testid="remaster-thread-textarea"
                  value={remasterDraft}
                  onChange={(e) => setRemasterDraft(e.target.value)}
                  rows={6}
                  className="mt-1.5 w-full rounded-xl border border-[#2C2C34] bg-[#0B0B0D] px-3 py-2.5 font-mono text-[16px] leading-relaxed text-[#ECECEE] outline-none focus:border-[#8B5CF6] sm:text-[13px]"
                />
              </label>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  data-testid="remaster-thread-copy"
                  onClick={() => {
                    void navigator.clipboard?.writeText(remasterDraft);
                    setRemasterCopied(true);
                    window.setTimeout(() => setRemasterCopied(false), 2000);
                  }}
                  className="w-full rounded-xl border border-[#2C2C34] bg-[#1A1A1F] px-3.5 py-2.5 text-[13.5px] font-medium text-[#C9C9CE] hover:bg-[#232329] sm:w-auto"
                >
                  {remasterCopied ? "✓ Copié dans le presse-papiers" : "Copier les 5 lignes"}
                </button>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    disabled={remasterApplying}
                    onClick={() => setRemasterOpen(false)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-[13.5px] text-[#9A9AA0] hover:bg-[#1F1F24] sm:w-auto"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    data-testid="remaster-thread-apply"
                    disabled={remasterApplying || !remasterDraft.trim()}
                    onClick={async () => {
                      if (!active || remasterApplying) return;
                      const targetBotId = active.id;
                      const handoffToSend = remasterDraft.trim();
                      setRemasterApplying(true);
                      try {
                        await rpc.threads.clear({ botId: targetBotId });
                        if (activeBotId.current === targetBotId) {
                          expandedHistoryThread.current = null;
                          pinnedAroundRef.current = null;
                          historyEpoch.current += 1;
                          setSnapshot((current) =>
                            current
                              ? { ...current, messages: [], olderCursor: null, run: null }
                              : current,
                          );
                        }
                        setRemasterOpen(false);
                        await sendMessage(handoffToSend);
                        await refreshBots();
                      } finally {
                        setRemasterApplying(false);
                      }
                    }}
                    className="w-full rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm hover:bg-[#7C3AED] disabled:opacity-50 sm:w-auto"
                  >
                    {remasterApplying ? "Remasterisation…" : "Nettoyer le fil & Relancer"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {modelsOpen ? <ModelSettingsOverlay onClose={() => setModelsOpen(false)} /> : null}
      </Suspense>

      {booting ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[22px] bg-[rgba(4,4,5,.96)]">
          <div className="text-[19px] font-medium text-[#F1F1F2]">
            Booting up {active?.name}’s computer
          </div>
          <div className="h-[5px] w-[min(420px,70%)] overflow-hidden rounded-full bg-[#232327]">
            <div className="h-full w-2/3 rounded-full bg-[#F1F1EF]" />
          </div>
        </div>
      ) : computerOpen && active ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#050506]">
          <div className="flex items-center justify-between gap-4 border-b border-[#171719] px-[18px] py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BotAvatar color={active.color} size={28} />
              {recordingSkill ? (
                <TeachRecordingChrome
                  recording={recordingSkill}
                  busy={teachBusy}
                  onStop={stopTeaching}
                  variant="overlay"
                />
              ) : (
                <span className="truncate text-[15.5px] font-medium text-[#ECECEE]">
                  {computerLabel(computer?.mode, active.name)}
                </span>
              )}
              {!recordingSkill && hasControl ? (
                <span className="rounded-full bg-[rgba(48,162,75,.14)] px-[11px] py-1 text-[13px] text-[#4ECB71]">
                  You have control
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {recordingSkill ? (
                <TeachStopButton busy={teachBusy} onStop={stopTeaching} />
              ) : hasControl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void releaseComputer()}
                >
                  Release
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void bootComputer({ takeControl: true, overlay: false })}
                >
                  Take control
                </Button>
              )}
              <button
                type="button"
                className="text-[16px] text-[#85858A] hover:text-[#ECECEE]"
                aria-label="Close computer"
                onClick={() => setComputerOpen(false)}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 bg-[#0E0E10]">
            {computer?.kind === "desktop" ? (
              <div className="grid h-full place-items-center px-8 text-center text-sm text-[#6C6C70]">
                This bot runs on this computer. There is no separate Linux desktop. Ask it to use
                the shell; working directories under your home folder are allowed.
              </div>
            ) : computer?.state === "running" && embeddedScreenUrl ? (
              <>
                <iframe
                  title="Bot screen"
                  src={embeddedScreenUrl}
                  sandbox={screenIframeSandbox(embeddedScreenUrl)}
                  className="h-full w-full border-0 bg-black"
                  allow="clipboard-read; clipboard-write; fullscreen"
                  style={{
                    pointerEvents: recordingSkill || !hasControl ? "none" : "auto",
                  }}
                />
                {active ? (
                  <TeachCaptureOverlay
                    botId={active.id}
                    skill={recordingSkill}
                    enabled={Boolean(recordingSkill)}
                    screenWidth={computer?.screenWidth}
                    screenHeight={computer?.screenHeight}
                  />
                ) : null}
              </>
            ) : (
              <div className="grid h-full place-items-center text-sm text-[#6C6C70]">
                {computer?.state === "suspended"
                  ? "Computer is asleep"
                  : computerLabel(computer?.mode, active.name)}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const Transcript = memo(function Transcript({
  scrollRef,
  botId,
  messages,
  olderCursor,
  loadingOlder,
  answerableAskMessageId,
  running,
  onLoadOlder,
  onOpenBot,
  onAnswer,
  onSelectChoice,
  onReact,
  onRefresh,
  onAddRoutine,
  onMemorizeSkill,
  voiceReady,
  speakingMessageId,
  onSpeak,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  botId: string;
  messages: ThreadMessage[];
  olderCursor: number | null;
  loadingOlder: boolean;
  answerableAskMessageId: string | null;
  running: boolean;
  onLoadOlder: () => void | Promise<void>;
  onOpenBot: (botId: string) => void;
  onAnswer: (message: ThreadMessage, text: string) => Promise<void>;
  onSelectChoice?: (text: string) => void | Promise<void>;
  onReact?: (messageId: string, reaction: "up" | "down" | null) => void;
  onRefresh: () => Promise<void>;
  onAddRoutine: (name: string, prompt: string) => void;
  onMemorizeSkill?: (text: string) => void;
  voiceReady: boolean;
  speakingMessageId: string | null;
  onSpeak: (message: ThreadMessage) => void;
}) {
  return (
    <div
      ref={scrollRef}
      data-testid="transcript"
      className="rk-scroll flex flex-1 flex-col gap-3 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-6 w-full max-w-full"
    >
      {olderCursor != null ? (
        <button
          type="button"
          disabled={loadingOlder}
          onClick={() => void onLoadOlder()}
          className="self-center rounded-lg px-3 py-1.5 text-[13px] text-[#85858A] hover:bg-[#1A1A1D] hover:text-[#C9C9CE] disabled:opacity-50"
        >
          {loadingOlder ? "Chargement…" : "Charger les messages précédents"}
        </button>
      ) : null}
      {messages.map((message) => (
        <div key={message.id} data-message-id={message.id} className="w-full">
          <MessageView
            botId={botId}
            message={message}
            canAnswer={message.id === answerableAskMessageId}
            onOpenBot={onOpenBot}
            onAnswer={onAnswer}
            onSelectChoice={onSelectChoice}
            onReact={onReact}
            onRefresh={onRefresh}
            onAddRoutine={onAddRoutine}
            onMemorizeSkill={onMemorizeSkill}
            voiceReady={voiceReady}
            speaking={speakingMessageId === message.id}
            onSpeak={() => onSpeak(message)}
          />
        </div>
      ))}
      {running ? (
        <div className="flex justify-start w-full">
          <div
            className="rounded-[20px] bg-[#1A1A1D] px-4 py-3 sm:px-[18px] sm:py-[13px] text-[14.5px] text-[#85858A]"
            style={{ animation: "rkPulse 1.2s ease-in-out infinite" }}
          >
            Réflexion en cours…
          </div>
        </div>
      ) : null}
    </div>
  );
});

export const Composer = memo(function Composer({
  activeName,
  draftKey = "default",
  enterToSend = true,
  bots = [],
  running,
  disabled,
  pendingAttachments,
  attachmentNotice,
  sendError,
  dictationError,
  onClearError,
  sending,
  fileInputRef,
  onAttachmentPick,
  onRemoveAttachment,
  onSend,
  onStop,
  dictating,
  transcribe,
  onDictateStart,
  onDictateStop,
}: {
  activeName?: string;
  draftKey?: string;
  enterToSend?: boolean;
  bots?: Bot[];
  running: boolean;
  disabled?: boolean;
  pendingAttachments: PendingAttachment[];
  attachmentNotice: string | null;
  sendError: string | null;
  dictationError: string | null;
  onClearError?: () => void;
  sending: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachmentPick: (files: FileList | null) => void | Promise<void>;
  onRemoveAttachment: (attachment: PendingAttachment) => void;
  onSend: (text: string) => Promise<void>;
  onStop: () => Promise<void>;
  dictating: boolean;
  transcribe: boolean;
  onDictateStart: (onFinal: (text: string) => void) => void;
  onDictateStop: () => void;
}) {
  const [draft, setDraft] = useState(() => readComposerDraft(draftKey));
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return subscribeComposerDraftAccepted(draftKey, (text) => {
      setDraft((current) => (current === text ? "" : current));
      setShowMention(false);
    });
  }, [draftKey]);

  useEffect(() => {
    setDraft(readComposerDraft(draftKey));
  }, [draftKey]);

  const canSend = draft.trim().length > 0 || pendingAttachments.length > 0;

  const filteredBots = useMemo(() => {
    if (!bots || bots.length === 0) return [];
    const q = (mentionQuery || "").toLowerCase().trim();
    return bots.filter((b) => {
      const nameMatch = b.name ? b.name.toLowerCase().includes(q) : false;
      const titleMatch = b.title ? b.title.toLowerCase().includes(q) : false;
      return nameMatch || titleMatch;
    });
  }, [bots, mentionQuery]);

  function send() {
    if (!canSend || sending || disabled) return;
    const text = draft;
    const submission = beginComposerDraftSubmission(draftKey, draft);
    setDraft("");
    setShowMention(false);
    writeComposerDraft(draftKey, "");
    void onSend(text)
      .then(() => {
        settleComposerDraftSubmission(draftKey, submission, true);
      })
      .catch(() => {
        settleComposerDraftSubmission(draftKey, submission, false);
        setDraft(submission.text);
        writeComposerDraft(draftKey, submission.text);
      });
  }

  function handleSelectBot(bot: Bot) {
    const atIdx = draft.lastIndexOf("@");
    const prefix = atIdx >= 0 ? draft.slice(0, atIdx) : draft;
    const next = `${prefix}@${bot.name} `;
    writeComposerDraft(draftKey, next);
    setDraft(next);
    setShowMention(false);
    inputRef.current?.focus();
  }

  function handleDraftChange(event: React.ChangeEvent<HTMLInputElement>) {
    const val = event.target.value;
    writeComposerDraft(draftKey, val);
    setDraft(val);
    const atMatch = /(?:^|\s)@([^\s@]*)$/.exec(val);
    if (atMatch && bots && bots.length > 0) {
      setShowMention(true);
      setMentionQuery(atMatch[1] ?? "");
      setMentionIndex(0);
    } else {
      setShowMention(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (showMention && filteredBots.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredBots.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredBots.length) % filteredBots.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selected = filteredBots[mentionIndex] ?? filteredBots[0];
        if (selected) {
          handleSelectBot(selected);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setShowMention(false);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      if (enterToSend || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        send();
      }
    }
  }

  return (
    <div className="w-full px-2 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3">
      {sendError || dictationError ? (
        <div
          data-testid="composer-error-banner"
          className="mb-2.5 rounded-[14px] border border-rose-800/80 bg-rose-950/80 px-3.5 py-2 text-[13px] text-rose-200 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-rose-400 font-bold shrink-0">⚠️ Erreur :</span>
            <span className="truncate">
              {formatUserFacingRunError(sendError ?? dictationError ?? "")}
            </span>
          </div>
          {onClearError ? (
            <button
              type="button"
              onClick={onClearError}
              className="text-rose-400 hover:text-rose-200 shrink-0 text-xs px-1.5 py-0.5 rounded hover:bg-rose-900/50 cursor-pointer"
              aria-label="Fermer l'erreur"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
      {attachmentNotice ? (
        <div className="mb-2.5 rounded-[14px] border border-[#3A3A20] bg-[#232316] px-3.5 py-2 text-[13px] text-[#D6CFA0]">
          {attachmentNotice}
        </div>
      ) : null}
      {pendingAttachments.length ? (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-full border border-[#26262A] bg-[#17171A] px-3 py-1.5 text-[13px] text-[#C9C9CE]"
            >
              {attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.file.name}
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded object-cover"
                />
              ) : (
                <Paperclip size={14} strokeWidth={1.8} />
              )}
              <span className="max-w-[140px] sm:max-w-[180px] truncate">
                {attachment.file.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.file.name}`}
                onClick={() => onRemoveAttachment(attachment)}
                className="text-[#85858A] hover:text-[#ECECEE]"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="relative">
        {showMention && bots && bots.length > 0 ? (
          <MentionPopover
            query={mentionQuery}
            bots={bots}
            selectedIndex={mentionIndex}
            onSelectBot={handleSelectBot}
            onClose={() => setShowMention(false)}
          />
        ) : null}
        <div className="flex w-full items-center gap-2 sm:gap-3.5 rounded-full border border-[#202023] bg-[#131315] py-1.5 px-2 sm:py-[9px] sm:pr-2.5 sm:pl-3 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(event) => void onAttachmentPick(event.target.files)}
          />
          <button
            type="button"
            aria-label="Attach file"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="grid h-9 w-9 sm:h-[34px] sm:w-[34px] shrink-0 place-items-center rounded-full border border-[#26262A] text-[#9A9AA0] hover:bg-[#1C1C1F] hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Plus size={17} strokeWidth={1.8} />
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={activeName ? `Envoyer un message à ${activeName}…` : "Écrire un message…"}
            className="min-w-0 flex-1 bg-transparent px-1.5 text-[16px] sm:text-[15.5px] text-[#E9E9EA] placeholder-[#6C6C70] outline-none disabled:opacity-40"
          />
          {running ? (
            <button
              type="button"
              aria-label="Arrêter"
              onClick={() => void onStop()}
              className="grid h-9 w-9 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A] hover:bg-white transition-colors cursor-pointer"
            >
              <Square size={12} strokeWidth={0} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Envoyer"
              disabled={sending || !canSend || disabled}
              onClick={send}
              className="grid h-9 w-9 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A] hover:bg-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function applyThreadEvent(
  event: ProductEvent,
  setSnapshot: Dispatch<SetStateAction<ThreadSnapshot | null>>,
  setComputer: Dispatch<SetStateAction<ComputerStatus | null>>,
) {
  if (isThreadSnapshotEvent(event)) {
    setSnapshot((prev) => reduceThreadSnapshot(prev, event));
  }
  if (isComputerStatusEvent(event)) {
    setComputer((prev) => reduceComputerStatus(prev, event));
  }
}

function latestAnswerableAskMessageId(snapshot: ThreadSnapshot | null): string | null {
  if (snapshot?.run?.status !== "waiting_input") return null;
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.runId !== snapshot.run.id) continue;
    if (message.blocks.some((block) => block.kind === "ask" && block.status !== "answered")) {
      return message.id;
    }
  }
  return null;
}

function parseProgressTool(text: string): {
  toolName: string;
  status: "running" | "completed" | "failed";
  args?: Record<string, unknown> | string;
  result?: string;
  durationMs?: number;
} | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();

  // 1. Check for JSON format: { "tool": "xyz", ... }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.tool || parsed.toolName || parsed.name) {
        return {
          toolName: parsed.tool || parsed.toolName || parsed.name,
          status:
            parsed.status === "failed"
              ? "failed"
              : parsed.status === "running"
                ? "running"
                : "completed",
          args: parsed.args || parsed.parameters,
          result: parsed.result || parsed.output,
          durationMs: parsed.durationMs || parsed.duration,
        };
      }
    } catch {
      // not valid json
    }
  }

  // 2. Check for tool log format: e.g. "Running tool: search" or "Executing tool read_file..." or "[tool: searxng]"
  const match =
    /^(?:\[tool:\s*|running tool:\s*|executing tool:\s*|tool:\s*|outil:\s*)([a-zA-Z0-9_-]+)(.*)$/i.exec(
      trimmed,
    );
  if (match) {
    const toolName = match[1]!;
    const rest = match[2] || "";
    const isRunning = /running|en cours|executing/i.test(trimmed);
    const isFailed = /failed|error|échec/i.test(trimmed);
    const durMatch = /(\d+(?:\.\d+)?)\s*(ms|s)/i.exec(rest);
    let durationMs: number | undefined;
    if (durMatch) {
      const num = parseFloat(durMatch[1]!);
      durationMs = durMatch[2]?.toLowerCase() === "s" ? num * 1000 : num;
    }
    return {
      toolName,
      status: isFailed ? "failed" : isRunning ? "running" : "completed",
      result: rest.trim() || undefined,
      durationMs,
    };
  }

  return null;
}

function extractTurnExecutionMetadata(message: ThreadMessage): {
  resolvedModel?: string;
  resolvedProvider?: string;
  isFree?: boolean;
  durationMs?: number;
  latencyMs?: number;
} | null {
  const m = message as any;
  const rawMeta = m.metadata || m.executionMetadata || m.execution || m.inference || {};
  const resolvedModel =
    rawMeta.resolvedModel ||
    rawMeta.model ||
    m.resolvedModel ||
    m.model ||
    m.run?.modelId ||
    m.run?.model ||
    null;
  const resolvedProvider =
    rawMeta.resolvedProvider ||
    rawMeta.provider ||
    m.resolvedProvider ||
    m.provider ||
    m.run?.modelProvider ||
    m.run?.provider ||
    null;
  const durationMs =
    rawMeta.durationMs ||
    rawMeta.duration ||
    rawMeta.computeDurationMs ||
    m.durationMs ||
    m.duration ||
    m.run?.durationMs ||
    undefined;
  const latencyMs =
    rawMeta.latencyMs ||
    rawMeta.upstreamLatencyMs ||
    m.latencyMs ||
    m.upstreamLatencyMs ||
    m.run?.latencyMs ||
    undefined;
  const isFree =
    rawMeta.isFree ??
    m.isFree ??
    (rawMeta.mode === "free" ||
      m.inferenceMode === "free" ||
      (typeof resolvedModel === "string" &&
        (resolvedModel.includes(":free") || resolvedModel.includes("free"))));

  if (Array.isArray(message.blocks)) {
    for (const block of message.blocks) {
      const b = block as any;
      if (b.metadata || b.executionMetadata) {
        const bMeta = b.metadata || b.executionMetadata;
        const bModel = bMeta.resolvedModel || bMeta.model;
        const bProvider = bMeta.resolvedProvider || bMeta.provider;
        const bDur = bMeta.durationMs || bMeta.duration;
        const bLat = bMeta.latencyMs || bMeta.upstreamLatencyMs;
        if (bModel || bProvider || bDur || bLat) {
          return {
            resolvedModel: bModel || resolvedModel || undefined,
            resolvedProvider: bProvider || resolvedProvider || undefined,
            isFree: bMeta.isFree ?? isFree,
            durationMs: bDur || durationMs,
            latencyMs: bLat || latencyMs,
          };
        }
      }
    }
  }

  if (resolvedModel || resolvedProvider || durationMs !== undefined || latencyMs !== undefined) {
    return {
      resolvedModel: resolvedModel || undefined,
      resolvedProvider: resolvedProvider || undefined,
      isFree: Boolean(isFree),
      durationMs,
      latencyMs,
    };
  }

  return null;
}

export const MessageView = memo(function MessageView({
  botId,
  canAnswer,
  message,
  onAnswer,
  onOpenBot,
  onRefresh,
  onAddRoutine,
  onMemorizeSkill,
  onSelectChoice,
  onReact,
  voiceReady,
  speaking,
  onSpeak,
}: {
  botId: string;
  canAnswer: boolean;
  message: ThreadMessage;
  onAnswer: (message: ThreadMessage, text: string) => Promise<void>;
  onOpenBot: (botId: string) => void;
  onRefresh: () => Promise<void>;
  onAddRoutine: (name: string, prompt: string) => void;
  onMemorizeSkill?: (text: string) => void;
  onSelectChoice?: (text: string) => void | Promise<void>;
  onReact?: (messageId: string, reaction: "up" | "down" | null) => void;
  voiceReady: boolean;
  speaking: boolean;
  onSpeak: () => void;
}) {
  const executionMeta = extractTurnExecutionMetadata(message);
  const textContent = speechFromBlocks(message.blocks) || "";

  return (
    <>
      {message.blocks.map((block, i) => {
        if (block.kind === "meta") {
          return (
            <div
              key={i}
              className="flex items-center justify-center gap-2 py-1 text-[13.5px] text-[#85858A]"
            >
              <span className="text-[#EF4444]">◷</span>
              <span>{block.text}</span>
            </div>
          );
        }
        if (block.kind === "choice") {
          return (
            <div key={i} className="flex justify-start w-full">
              <ChoiceChipsCard
                block={block as ChoiceBlock}
                onSelectOption={(opt) => {
                  if (onSelectChoice) {
                    void onSelectChoice(opt.label || opt.letter);
                  } else {
                    void onAnswer(message, opt.label || opt.letter);
                  }
                }}
              />
            </div>
          );
        }
        if ((block as any).kind === "tool") {
          const tb = block as any;
          return (
            <div
              key={i}
              className="w-full max-w-[98%] sm:max-w-[88%] md:max-w-[78%] lg:max-w-[74%]"
            >
              <ToolActivityAccordion
                toolName={tb.toolName || tb.name || "mcp_tool"}
                status={tb.status || "completed"}
                args={tb.args || tb.parameters}
                result={tb.result || tb.output}
                durationMs={tb.durationMs || tb.duration}
                defaultExpanded={tb.defaultExpanded}
              />
            </div>
          );
        }
        if (block.kind === "progress") {
          const toolInfo = parseProgressTool(block.text);
          if (toolInfo) {
            return (
              <div
                key={i}
                className="w-full max-w-[98%] sm:max-w-[88%] md:max-w-[78%] lg:max-w-[74%]"
              >
                <ToolActivityAccordion
                  toolName={toolInfo.toolName}
                  status={toolInfo.status}
                  args={toolInfo.args}
                  result={toolInfo.result}
                  durationMs={toolInfo.durationMs}
                />
              </div>
            );
          }
          return (
            <div key={i} className="flex justify-start w-full">
              <div className="w-full max-w-[98%] sm:max-w-[88%] md:max-w-[78%] lg:max-w-[74%] rounded-[20px] bg-[#1A1A1D] px-3.5 py-3 sm:px-[18px] text-[15px] sm:text-[15.5px] leading-[1.5] text-[#DFDFE2]">
                <ChatMarkdown streaming>{block.text}</ChatMarkdown>
              </div>
            </div>
          );
        }
        if (block.kind === "subagent") {
          const running = block.status === "running";
          const failed = block.status === "failed";
          return (
            <div
              key={i}
              className="w-full max-w-[98%] sm:max-w-[420px] rounded-[18px] border border-[#232326] bg-[#17171A] px-4 py-3.5 sm:px-[18px] sm:py-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-medium text-[#ECECEE]">{block.name}</span>
                <span
                  className="rounded-full px-[11px] py-1 text-[13px]"
                  style={{
                    background: failed
                      ? "rgba(239,68,68,.14)"
                      : running
                        ? "rgba(245,160,60,.14)"
                        : "rgba(48,162,75,.14)",
                    color: failed ? "#EF4444" : running ? "#F5A03C" : "#4ECB71",
                    animation: running ? "rkPulse 1.2s ease-in-out infinite" : undefined,
                  }}
                >
                  {running ? "subagent" : block.status}
                </span>
              </div>
              <div className="mt-2 text-[13.5px] text-[#85858A]">{block.task}</div>
              {block.progress || block.result ? (
                <div className="mt-2.5 text-[14.5px] leading-[1.5] text-[#A8A8AD]">
                  <ChatMarkdown streaming={running}>
                    {block.result || block.progress || ""}
                  </ChatMarkdown>
                </div>
              ) : null}
            </div>
          );
        }
        if (block.kind === "child_bot") {
          const removed = block.status === "deleted" || block.status === "archived";
          return (
            <button
              key={i}
              type="button"
              disabled={removed}
              onClick={() => onOpenBot(block.botId)}
              className="w-full max-w-[98%] sm:max-w-[340px] rounded-[18px] border border-[#232326] bg-[#17171A] px-4 py-3.5 sm:px-[18px] sm:py-4 text-left disabled:opacity-60 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-[#ECECEE]">{block.name}</span>
                <span
                  className="rounded-full px-[11px] py-1 text-[13px]"
                  style={{
                    background: removed ? "rgba(239,68,68,.14)" : "rgba(48,162,75,.14)",
                    color: removed ? "#EF4444" : "#4ECB71",
                  }}
                >
                  {block.status === "archived"
                    ? "archived"
                    : block.status === "deleted"
                      ? "deleted"
                      : "bot"}
                </span>
              </div>
              <div className="mt-2 text-[14.5px] leading-[1.5] text-[#A8A8AD]">
                {removed
                  ? block.status === "archived"
                    ? "Archived this bot. Its chat, memory, and files are preserved."
                    : "Removed this bot, including its chat, computer, and memory."
                  : block.title || "Opened its own thread. Tap to switch."}
              </div>
            </button>
          );
        }
        if (block.kind === "image") {
          return (
            <div
              key={i}
              className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <ArtifactImage botId={botId} artifactId={block.artifactId} name={block.name} />
            </div>
          );
        }
        if (block.kind === "file") {
          return (
            <div
              key={i}
              className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <button
                type="button"
                onClick={() =>
                  void openArtifact(botId, block.artifactId, block.name, block.mimeType)
                }
                className="max-w-[98%] sm:max-w-[340px] rounded-[20px] border border-[#26262A] bg-[#17171A] px-4 py-3 text-left text-[14px] text-[#DFDFE2] hover:bg-[#1F1F22] cursor-pointer"
              >
                <div className="font-medium">{block.name}</div>
                <div className="mt-1 text-[#85858A]">
                  {block.mimeType} · {formatBytes(block.size)}
                </div>
              </button>
            </div>
          );
        }
        if (block.kind === "text" && message.role === "user") {
          return (
            <div key={i} className="flex justify-end w-full">
              <div className="max-w-[92%] sm:max-w-[80%] md:max-w-[70%] rounded-[20px] bg-[#F1F1EF] px-4 py-3 sm:px-[18px] text-[15px] sm:text-[15.5px] leading-[1.45] text-[#1A1A1A]">
                {block.text}
              </div>
            </div>
          );
        }
        if (block.kind === "text") {
          return (
            <div key={i} className="flex justify-start w-full">
              <div className="w-full max-w-[98%] sm:max-w-[88%] md:max-w-[78%] lg:max-w-[74%] rounded-[20px] bg-[#1A1A1D] px-4 py-3 sm:px-[18px] text-[15px] sm:text-[15.5px] leading-[1.5] text-[#DFDFE2]">
                <ChatMarkdown>{block.text}</ChatMarkdown>
              </div>
            </div>
          );
        }
        if (block.kind === "card") {
          return (
            <div key={i} className="flex justify-start w-full">
              <div className="flex w-full max-w-[98%] sm:max-w-[88%] md:max-w-[78%] lg:max-w-[74%] flex-col gap-2 rounded-[20px] bg-[#1A1A1D] px-4 py-3.5 sm:px-5 sm:py-4">
                {block.lines.map((line) => (
                  <div key={line.k} className="flex items-baseline gap-2.5 text-[15px]">
                    <span className="text-[#30A24B]">✓</span>
                    <span className="font-semibold text-white">{line.k}</span>
                    <span className="text-[#85858A]">→</span>
                    <span>{line.v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (block.kind === "ask") {
          return (
            <AskCard
              key={i}
              block={block}
              canAnswer={canAnswer}
              onAnswer={(text) => onAnswer(message, text)}
            />
          );
        }
        if (block.kind === "skill_draft") {
          return (
            <div key={i} className="flex justify-start w-full">
              <SkillDraftCard block={block} onRefresh={onRefresh} onAddRoutine={onAddRoutine} />
            </div>
          );
        }
        if (block.kind === "computer") {
          return (
            <div
              key={i}
              className="w-full max-w-[98%] sm:max-w-[340px] rounded-[18px] border border-[#232326] bg-[#17171A] px-4 py-3.5 sm:px-[18px] sm:py-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-[#ECECEE]">Computer</span>
                <span className="rounded-full bg-[rgba(48,162,75,.14)] px-[11px] py-1 text-[13px] text-[#4ECB71]">
                  {block.state}
                </span>
              </div>
              <div className="my-2.5 text-[14.5px] leading-[1.5] text-[#A8A8AD]">
                <ChatMarkdown>{block.text}</ChatMarkdown>
              </div>
            </div>
          );
        }
        return null;
      })}
      {/* Message action bar & Timestamp badge */}
      {message.role !== "user" ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1">
          <TimestampBadge
            createdAt={message.createdAt}
            resolvedModel={executionMeta?.resolvedModel}
            resolvedProvider={executionMeta?.resolvedProvider}
            isFree={executionMeta?.isFree}
            durationMs={executionMeta?.durationMs}
            latencyMs={executionMeta?.latencyMs}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {onMemorizeSkill && textContent.trim().length > 20 ? (
              <button
                type="button"
                data-testid="memorize-as-skill-btn"
                onClick={() => onMemorizeSkill(textContent)}
                title="Mémoriser cette réponse en Compétence (Skill)"
                className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-[#2C2C34] bg-[#16161A] px-2 py-0.5 text-[11px] font-medium text-[#A78BFA] hover:border-[#8B5CF6]/40 hover:bg-[#1E1E24] hover:text-[#DDD6FE] transition-colors"
              >
                <Sparkles size={11} />
                <span>Mémoriser en Skill</span>
              </button>
            ) : null}
            <MessageActionBar text={textContent} messageId={message.id} onReact={onReact} />
          </div>
        </div>
      ) : (
        <div className="mt-1 flex justify-end px-1">
          <TimestampBadge createdAt={message.createdAt} />
        </div>
      )}
      {message.role !== "user" && executionMeta ? (
        <div className="flex justify-start w-full mt-1 px-1">
          <div
            data-testid="turn-execution-metadata"
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900/70 border border-zinc-800/80 px-2.5 py-0.5 text-[11px] text-zinc-400 font-mono"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
            <span>
              {executionMeta.resolvedModel && executionMeta.resolvedProvider
                ? `Modèle utilisé : ${executionMeta.resolvedModel} · ${executionMeta.resolvedProvider}`
                : executionMeta.resolvedModel
                  ? `Gratuit via OmniRoute · ${executionMeta.resolvedModel}`
                  : `Modèle utilisé : ${executionMeta.resolvedProvider}`}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
});

type AskBlock = Extract<ThreadMessage["blocks"][number], { kind: "ask" }>;

function AskCard({
  block,
  canAnswer,
  onAnswer,
}: {
  block: AskBlock;
  canAnswer: boolean;
  onAnswer: (text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitAnswer(value: string) {
    const text = value.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      await onAnswer(text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[98%] sm:max-w-[88%] md:max-w-[78%] lg:max-w-[74%] rounded-[20px] border border-[#242428] bg-[#141417] px-4 py-3.5 sm:px-5 sm:py-[17px]">
      <div className="text-[15.5px] leading-[1.5] text-[#ECECEE]">
        <ChatMarkdown>{block.text}</ChatMarkdown>
      </div>
      {block.detail ? (
        <pre className="mt-3 rounded-xl bg-[#0E0E10] px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] text-[#85858A]">
          {block.detail}
        </pre>
      ) : null}
      {block.status === "answered" ? (
        <div className="mt-3.5 text-[13.5px] font-medium text-[#4ECB71]">
          {block.answer ? `Answered: ${block.answer}` : "Answered"}
        </div>
      ) : !canAnswer ? (
        <div className="mt-3.5 text-[13.5px] font-medium text-[#85858A]">No longer active</div>
      ) : editing ? (
        <form
          className="mt-3.5 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAnswer(answer);
          }}
        >
          <input
            aria-label="Answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Type your answer"
            className="rounded-[11px] border border-[#303035] bg-[#0E0E10] px-3.5 py-2.5 text-[14.5px] text-[#ECECEE] outline-none focus:border-[#66666D]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!answer.trim() || submitting}
              className="rounded-[11px] bg-[#F1F1EF] px-[17px] py-2 text-[14.5px] font-medium text-[#17171A] disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send answer"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setAnswer("");
                setEditing(false);
              }}
              className="rounded-[11px] border border-[#26262A] px-[17px] py-2 text-[14.5px] text-[#C9C9CE] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitAnswer("approved")}
            className="rounded-[11px] bg-[#F1F1EF] px-[17px] py-2 text-[14.5px] font-medium text-[#17171A] disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send it"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setEditing(true)}
            className="rounded-[11px] border border-[#26262A] px-[17px] py-2 text-[14.5px] text-[#C9C9CE] disabled:opacity-50"
          >
            Edit first
          </button>
        </div>
      )}
    </div>
  );
}

function ComputerModePicker({
  value,
  onChange,
}: {
  value: ComputerMode;
  onChange: (value: ComputerMode) => void;
}) {
  return (
    <div className="mt-4">
      <div className="text-[14px] text-[#85858A]">Computer</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["team", "dedicated"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value === mode}
            onClick={() => onChange(mode)}
            className={`rounded-[11px] border px-3.5 py-3 text-[14px] capitalize ${
              value === mode
                ? "border-[#6C6C70] bg-[#1A1A1D] text-[#ECECEE]"
                : "border-[#26262A] text-[#85858A]"
            }`}
          >
            {mode === "team" ? "Team" : "Private"}
          </button>
        ))}
      </div>
    </div>
  );
}

const USAGE_TAG_OPTIONS: {
  id: InferenceUsageTag;
  label: string;
  description: string;
  badge: string;
}[] = [
  {
    id: "coding",
    label: "Code & Scripting",
    description: "Optimisé pour la génération et revue de code",
    badge: "Dev",
  },
  {
    id: "writing",
    label: "Rédaction & Synthèse",
    description: "Rédaction fluide et synthèse",
    badge: "Prose",
  },
  {
    id: "reasoning",
    label: "Raisonnement & Logique",
    description: "Optimisé pour le raisonnement logique et complexe",
    badge: "Logic",
  },
  {
    id: "fast",
    label: "Ultra Rapide & Triage",
    description: "Ultra-rapide pour requêtes courtes",
    badge: "Fast",
  },
  {
    id: "analysis",
    label: "Analyse & Données",
    description: "Analyse documentaire et extraction",
    badge: "Data",
  },
];

export function IntelligenceSelector({
  inferenceMode,
  usageTags,
  onChangeMode,
  onToggleTag,
  disabled = false,
  viewportWidth,
}: {
  inferenceMode: InferenceMode;
  usageTags: InferenceUsageTag[];
  onChangeMode: (mode: InferenceMode) => void;
  onToggleTag: (tag: InferenceUsageTag) => void;
  disabled?: boolean;
  viewportWidth?: number;
}) {
  const isMobile = typeof viewportWidth === "number" ? viewportWidth < 768 : false;

  return (
    <div
      data-testid="omniroute-intelligence-panel"
      className={`mt-6 flex flex-col gap-4 rounded-xl border border-zinc-800 bg-[#0F0F12] p-4 text-white ${
        isMobile ? "w-full max-w-full px-3 py-4" : "w-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            Moteur d'Intelligence
            {inferenceMode === "free" && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                100% Gratuit &amp; Zéro-Coût
              </span>
            )}
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Choisissez entre l'intelligence souveraine gratuite ou le modèle haute puissance.
          </p>
        </div>
      </div>

      {/* Segmented Control (Premium vs Gratuit) */}
      <div
        role="tablist"
        aria-label="Sélection du mode d'inférence"
        className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-900/90 p-1 border border-zinc-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inferenceMode === "premium"}
          data-testid="mode-premium-btn"
          disabled={disabled}
          onClick={() => onChangeMode("premium")}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
            inferenceMode === "premium"
              ? "bg-zinc-800 text-white shadow-sm border border-zinc-700 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          <span>Premium (GPT-OSS-120B)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={inferenceMode === "free"}
          data-testid="mode-free-btn"
          disabled={disabled}
          onClick={() => onChangeMode("free")}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
            inferenceMode === "free"
              ? "bg-emerald-500/15 text-emerald-300 shadow-sm border border-emerald-500/30 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Gratuit (OmniRoute Free)</span>
        </button>
      </div>

      {/* Stable Intent Presentation */}
      {inferenceMode === "free" && (
        <div
          data-testid="omniroute-stable-intent"
          className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-medium">
              Gratuit via OmniRoute · Profil :{" "}
              {usageTags.length > 0
                ? usageTags.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ")
                : "Général"}
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400/80 uppercase">Zéro-Coût</span>
        </div>
      )}

      {/* Usage Tags Section (Active only when Free mode is selected) */}
      {inferenceMode === "free" && (
        <div
          data-testid="usage-tags-container"
          className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Tags d'usage recommandés (max 3)</span>
            <span
              data-testid="tag-count-indicator"
              className={usageTags.length === 3 ? "text-amber-400 font-medium" : "text-zinc-500"}
            >
              {usageTags.length} / 3 sélectionnés
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {USAGE_TAG_OPTIONS.map((tag) => {
              const isSelected = usageTags.includes(tag.id);
              const isMaxReached = usageTags.length >= 3 && !isSelected;

              return (
                <button
                  key={tag.id}
                  type="button"
                  data-testid={`tag-chip-${tag.id}`}
                  aria-pressed={isSelected}
                  disabled={disabled || (isMaxReached && !isSelected)}
                  onClick={() => onToggleTag(tag.id)}
                  className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-all border ${
                    isSelected
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-xs cursor-pointer"
                      : isMaxReached
                        ? "border-zinc-800/40 bg-zinc-900/30 text-zinc-600 opacity-50 cursor-not-allowed"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50 cursor-pointer"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{tag.label}</span>
                    <span className="text-[10px] text-zinc-500">{tag.description}</span>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {tag.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateBotForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: {
    name: string;
    title: string;
    description: string;
    instructions?: string;
    computerMode: ComputerMode;
    skillIds?: string[];
    metadata?: Record<string, unknown>;
    inference?: BotInferenceConfig;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCompilerOpen, setIsCompilerOpen] = useState(false);
  const [computerMode, setComputerMode] = useState<ComputerMode>("team");
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [mcpConfig, setMcpConfig] = useState<BotMcpConfig>(() => getRecommendedMcpConfig());
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>("premium");
  const [usageTags, setUsageTags] = useState<InferenceUsageTag[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);

  const applyBlueprint = (bp: SovereignAgentBlueprint) => {
    setSelectedBlueprintId(bp.id);
    setName(bp.name);
    setTitle(bp.title);
    setDescription(bp.description);
    setInstructions(bp.instructions);
    setComputerMode(bp.computerMode);
    setSelectedSkillIds(getBlueprintSkillIds(bp.packId));
    setMcpConfig(buildBlueprintMcpConfig(bp.connectorIds));
    setInferenceMode(bp.inferenceMode);
    setUsageTags(bp.usageTags);
  };

  const resetBlueprint = () => {
    setSelectedBlueprintId(null);
    setName("");
    setTitle("");
    setDescription("");
    setInstructions("");
    setComputerMode("team");
    setSelectedSkillIds([]);
    setMcpConfig(getRecommendedMcpConfig());
    setInferenceMode("premium");
    setUsageTags([]);
  };

  useEffect(() => {
    void rpc.skills
      .list({})
      .then(setAvailableSkills)
      .catch(() => setAvailableSkills([]));
  }, []);

  const handleToggleTag = (tag: InferenceUsageTag) => {
    setUsageTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, tag];
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13.5px] text-[#85858A]">Nouvel agent</span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fermer"
          className="grid min-h-[40px] min-w-[40px] place-items-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* IDÉE N°1 : Galerie de Blueprints Clé en Main en 1 Clic */}
      <div
        data-testid="agent-blueprints-gallery"
        className="mb-6 rounded-xl border border-[#26262A] bg-[#141417] p-3.5 sm:p-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400 shrink-0" />
              <span className="text-xs font-semibold text-[#ECECEE]">
                Profils d'Agents Clé en Main (1 clic)
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#85858A]">
              Pré-remplit le prompt contractuel, les outils MCP et le pack de compétences (≤ 10
              skills).
            </p>
          </div>
          {selectedBlueprintId ? (
            <button
              type="button"
              data-testid="reset-blueprint-btn"
              onClick={resetBlueprint}
              className="self-start sm:self-auto min-h-[36px] rounded-lg border border-[#3F3F46] bg-[#1C1C1F] px-2.5 py-1 text-[11px] font-medium text-[#A1A1AA] hover:text-white transition-colors"
            >
              Réinitialiser à zéro
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SOVEREIGN_AGENT_BLUEPRINTS.map((bp) => {
            const isSelected = selectedBlueprintId === bp.id;
            const skillCount = getBlueprintSkillIds(bp.packId).length;
            return (
              <button
                key={bp.id}
                type="button"
                data-testid={`agent-blueprint-${bp.id}`}
                onClick={() => applyBlueprint(bp)}
                className={`flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all min-h-[76px] ${
                  isSelected
                    ? "border-indigo-500/60 bg-indigo-500/10 text-white shadow-sm"
                    : "border-[#26262A] bg-[#18181B] text-[#D4D4D8] hover:border-[#3F3F46] hover:bg-[#1E1E22]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#ECECEE] truncate">
                    {bp.name} · {bp.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isSelected
                        ? "bg-indigo-500/30 text-indigo-200 border border-indigo-400/40"
                        : "bg-[#232329] text-[#A1A1AA]"
                    }`}
                  >
                    {isSelected ? "Appliqué ✓" : bp.badge}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#85858A] line-clamp-2 leading-relaxed">
                  {bp.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[#A1A1AA]">
                  <span className="rounded bg-[#232329] px-1.5 py-0.5">
                    {bp.connectorIds.length} MCP
                  </span>
                  <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5">
                    {skillCount} skills pré-cochés
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <label className="mt-6 block text-[14px] text-[#85858A]">
        Nom de l'agent
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Samy, Rédacteur, Développeur"
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[#85858A]">
        Titre / Rôle
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Expert Marketing, Analyste de données"
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[#85858A]">
        Description courte
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brève description de la mission de l'agent"
          rows={2}
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </label>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-[#85858A]">
            Instructions personnalisées / Prompt système
          </span>
          <button
            type="button"
            data-testid="rendre-pro-btn"
            onClick={() => setIsCompilerOpen(true)}
            disabled={!instructions.trim()}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-40"
          >
            <Sparkles size={13} />
            Rendre professionnelles
          </button>
        </div>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Définissez les directives, compétences, style et comportement de votre agent..."
          rows={5}
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </div>
      <div className="mt-6 border-t border-[#26262A] pt-5">
        <BotSkillSelector
          selectedSkillIds={selectedSkillIds}
          onChange={setSelectedSkillIds}
          availableSkills={availableSkills}
        />
      </div>

      <div className="mt-6 border-t border-[#26262A] pt-5">
        <BotMcpToolSelector value={mcpConfig} onChange={setMcpConfig} />
      </div>

      <IntelligenceSelector
        inferenceMode={inferenceMode}
        usageTags={usageTags}
        onChangeMode={setInferenceMode}
        onToggleTag={handleToggleTag}
      />

      <ComputerModePicker value={computerMode} onChange={setComputerMode} />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() =>
          onCreate({
            name,
            title,
            description,
            instructions,
            computerMode,
            skillIds: selectedSkillIds,
            metadata: { mcp: mcpConfig },
            inference: {
              mode: inferenceMode,
              tags: usageTags,
            },
          })
        }
        className="mt-5 rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[#17171A] disabled:opacity-40 min-h-[44px] font-medium"
      >
        Créer l'agent
      </button>

      <PromptCompilerModal
        isOpen={isCompilerOpen}
        rawDraft={instructions}
        botName={name}
        botTitle={title}
        onClose={() => setIsCompilerOpen(false)}
        onApply={(compiled) => {
          setInstructions(compiled);
          setIsCompilerOpen(false);
        }}
      />
    </div>
  );
}

function BotSettings({
  bot,
  onSave,
  onExport,
  onClear,
}: {
  bot: Bot;
  onSave: (patch: {
    name?: string;
    title?: string;
    description?: string;
    instructions?: string;
    computerMode: ComputerMode;
    autoSpeak?: boolean;
    voiceId?: string | null;
    skillIds?: string[];
    metadata?: Record<string, unknown>;
    inference?: BotInferenceConfig;
  }) => Promise<void>;
  onExport: () => Promise<void>;
  onClear: () => void;
}) {
  const [name, setName] = useState(bot.name);
  const [title, setTitle] = useState(bot.title);
  const [description, setDescription] = useState(bot.description);
  const [instructions, setInstructions] = useState(bot.instructions || bot.description || "");
  const [isCompilerOpen, setIsCompilerOpen] = useState(false);
  const [computerMode, setComputerMode] = useState(bot.computerMode);
  const [autoSpeak, setAutoSpeak] = useState(bot.autoSpeak);
  const [voiceId, setVoiceId] = useState(bot.voiceId ?? "");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillSummary[]>([]);
  const [botSkills, setBotSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [mcpConfig, setMcpConfig] = useState<BotMcpConfig>(() => {
    const rawMcp = (bot.metadata as any)?.mcp;
    if (rawMcp && typeof rawMcp === "object") {
      return rawMcp as BotMcpConfig;
    }
    return { connectors: {}, tools: {} };
  });
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>(
    bot.inference?.mode ?? "premium",
  );
  const [usageTags, setUsageTags] = useState<InferenceUsageTag[]>(bot.inference?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    void rpc.voice
      .voices({})
      .then(setVoices)
      .catch(() => setVoices([]));

    void Promise.all([
      rpc.skills.list({}).catch(() => []),
      rpc.skills.getBotSkills({ botId: bot.id }).catch(() => []),
    ]).then(([allSkills, activeSkills]) => {
      setAvailableSkills(allSkills);
      setBotSkills(activeSkills);
      setSelectedSkillIds(activeSkills.map((s) => s.id));
    });
  }, [bot.id]);

  const handleToggleTag = (tag: InferenceUsageTag) => {
    setUsageTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, tag];
    });
  };

  return (
    <div data-testid="bot-settings">
      <div className="flex justify-center">
        <BotAvatar color={bot.color} size={64} />
      </div>
      <label className="mt-6 block text-[14px] text-[#85858A]">
        Nom
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[#85858A]">
        Titre / Rôle
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[#85858A]">
        Description courte
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </label>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-[#85858A]">
            Instructions personnalisées / Prompt système
          </span>
          <button
            type="button"
            data-testid="rendre-pro-btn"
            onClick={() => setIsCompilerOpen(true)}
            disabled={!instructions.trim()}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-40"
          >
            <Sparkles size={13} />
            Rendre professionnelles
          </button>
        </div>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Définissez les directives, compétences, style et comportement de votre agent..."
          rows={6}
          className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3.5 py-3 text-[16px] sm:text-sm text-[#ECECEE]"
        />
      </div>
      <ComputerModePicker value={computerMode} onChange={setComputerMode} />
      <div className="mt-6 border-t border-[#26262A] pt-5">
        <BotSkillSelector
          selectedSkillIds={selectedSkillIds}
          onChange={setSelectedSkillIds}
          availableSkills={availableSkills}
          botSkills={botSkills}
          disabled={saving}
        />
      </div>

      <div className="mt-6 border-t border-[#26262A] pt-5">
        <BotMcpToolSelector value={mcpConfig} onChange={setMcpConfig} />
      </div>

      <IntelligenceSelector
        inferenceMode={inferenceMode}
        usageTags={usageTags}
        onChangeMode={setInferenceMode}
        onToggleTag={handleToggleTag}
        disabled={saving}
      />

      {error ? <p className="mt-2 text-[13px] text-[#E65707]">{error}</p> : null}
      {savedSuccess ? (
        <p className="mt-2 text-[13px] font-medium text-emerald-400">
          Modifications et compétences enregistrées ✓
        </p>
      ) : null}
      <div className="mt-5 flex flex-col items-start gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setError(null);
            setSavedSuccess(false);
            void onSave({
              name,
              title,
              description,
              instructions: instructions.trim() || description,
              computerMode,
              autoSpeak,
              voiceId: voiceId || null,
              skillIds: selectedSkillIds,
              metadata: {
                ...(bot.metadata || {}),
                mcp: mcpConfig,
              },
              inference: {
                mode: inferenceMode,
                tags: usageTags,
              },
            })
              .then(async () => {
                const updatedSkills = await rpc.skills
                  .getBotSkills({ botId: bot.id })
                  .catch(() => []);
                setBotSkills(updatedSkills);
                setSelectedSkillIds(updatedSkills.map((s) => s.id));
                setSavedSuccess(true);
              })
              .catch((err) =>
                setError(err instanceof Error ? err.message : "Impossible d'enregistrer"),
              )
              .finally(() => setSaving(false));
          }}
          className="rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[#17171A] disabled:opacity-40 min-h-[44px] font-medium"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => void onExport()}
          className="text-[14px] text-[#85858A]"
        >
          Exporter l'agent
        </button>
        <button type="button" onClick={onClear} className="text-[14px] text-[#E65707]">
          Effacer la conversation
        </button>
      </div>

      <PromptCompilerModal
        isOpen={isCompilerOpen}
        rawDraft={instructions}
        botName={name}
        botTitle={title}
        onClose={() => setIsCompilerOpen(false)}
        onApply={(compiled) => {
          setInstructions(compiled);
          setIsCompilerOpen(false);
        }}
      />
    </div>
  );
}

function ClearConversationDialog({
  bot,
  onCancel,
  onConfirm,
}: {
  bot: Bot;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !clearing) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearing, onCancel]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!clearing) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-conversation-title"
        aria-describedby="clear-conversation-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[#343438] bg-[#1A1A1D] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="clear-conversation-title" className="text-[17px] font-medium text-[#F1F1F2]">
          Effacer la conversation avec {bot.name} ?
        </h2>
        <p
          id="clear-conversation-description"
          className="mt-2 text-[14px] leading-6 text-[#9A9AA0]"
        >
          Cette action supprime définitivement tous les messages échangés et arrête les tâches en
          cours. L'agent, sa mémoire et ses routines sont conservés.
        </p>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={clearing}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[#C9C9CE] hover:bg-[#29292D] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={clearing}
            onClick={() => {
              setClearing(true);
              setError(null);
              void onConfirm().catch((err: unknown) => {
                setError(
                  err instanceof Error ? err.message : "Impossible d'effacer la conversation",
                );
                setClearing(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {clearing ? "Effacement…" : "Effacer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteBotDialog({
  bot,
  onCancel,
  onConfirm,
}: {
  bot: Bot;
  onCancel: () => void;
  onConfirm: (deleteMemories: boolean) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteMemories, setDeleteMemories] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-bot-title"
        aria-describedby="delete-bot-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[#343438] bg-[#1A1A1D] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-bot-title" className="text-[17px] font-medium text-[#F1F1F2]">
          Supprimer l'agent {bot.name} ?
        </h2>
        <p id="delete-bot-description" className="mt-2 text-[14px] leading-6 text-[#9A9AA0]">
          Ses conversations, fichiers et routines seront définitivement supprimés. Les agents créés
          par cet agent restent dans votre liste.
        </p>
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-2 text-[13.5px] text-[#C9C9CE]">Que faire de ses mémoires ?</legend>
          <label className="flex cursor-pointer gap-3 rounded-[11px] border border-[#343438] p-3">
            <input
              type="radio"
              name="delete-memory"
              checked={!deleteMemories}
              onChange={() => setDeleteMemories(false)}
            />
            <span>
              <span className="block text-[14px] text-[#ECECEE]">Conserver les mémoires</span>
              <span className="mt-0.5 block text-[12.5px] text-[#85858A]">
                Les transférer dans votre mémoire partagée.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-[11px] border border-[#343438] p-3">
            <input
              type="radio"
              name="delete-memory"
              checked={deleteMemories}
              onChange={() => setDeleteMemories(true)}
            />
            <span>
              <span className="block text-[14px] text-[#ECECEE]">Supprimer aussi les mémoires</span>
              <span className="mt-0.5 block text-[12.5px] text-[#85858A]">
                Cette action est irréversible.
              </span>
            </span>
          </label>
        </fieldset>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[#C9C9CE] hover:bg-[#29292D] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setError(null);
              void onConfirm(deleteMemories).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Impossible de supprimer l'agent");
                setDeleting(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteRoutineDialog({
  routine,
  onCancel,
  onConfirm,
}: {
  routine: Routine;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-routine-title"
        aria-describedby="delete-routine-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[#343438] bg-[#1A1A1D] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-routine-title" className="text-[17px] font-medium text-[#F1F1F2]">
          Supprimer la routine {routine.name} ?
        </h2>
        <p id="delete-routine-description" className="mt-2 text-[14px] leading-6 text-[#9A9AA0]">
          Cette action est irréversible.
        </p>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[#C9C9CE] hover:bg-[#29292D] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setError(null);
              void onConfirm().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Impossible de supprimer la routine");
                setDeleting(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function embeddableScreenUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.href);
    const page = new URL(window.location.href);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const pagePort = page.port || (page.protocol === "https:" ? "443" : "80");
    if (local && parsed.port && parsed.port !== pagePort) {
      return null;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function screenIframeSandbox(url: string | null) {
  if (!url) return undefined;
  try {
    return new URL(url, window.location.href).pathname.startsWith("/novnc/")
      ? "allow-scripts allow-pointer-lock"
      : undefined;
  } catch {
    return undefined;
  }
}

function computerPlaceholder(
  state: ComputerStatus["state"] | undefined,
  booting: boolean,
  label: string,
) {
  if (state === "booting" || booting) return "Booting live desktop…";
  if (state === "running") return label;
  if (state === "suspended") return "Computer is asleep — take control to wake it";
  if (state === "error") return "Computer failed to boot";
  return "Computer is stopped";
}

function computerLabel(mode: ComputerStatus["mode"] | undefined, botName: string) {
  return mode === "dedicated" ? `${botName}’s computer` : "Team Computer";
}

function ArtifactImage({
  botId,
  artifactId,
  name,
}: {
  botId: string;
  artifactId: string;
  name: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    void rpc.artifacts
      .get({ botId, artifactId })
      .then((artifact) => {
        const bytes = decodeArtifactBase64(artifact.contentBase64);
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: artifact.mimeType }),
        );
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifactId, botId, visible]);

  return (
    <div ref={container}>
      {src ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="max-w-[240px] overflow-hidden rounded-[20px]"
        >
          <img src={src} alt={name} className="max-h-48 w-full object-cover" />
        </button>
      ) : (
        <div className="rounded-[20px] border border-[#26262A] bg-[#17171A] px-4 py-3 text-[14px] text-[#85858A]">
          {name}
        </div>
      )}
      {open && src ? (
        <button
          type="button"
          aria-label="Close image preview"
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.82)] p-6"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={name}
            className="max-h-[85vh] max-w-[90vw] rounded-[12px] object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
