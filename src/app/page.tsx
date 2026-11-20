"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Suspense,
  lazy,
} from "react";
import { useQueryState } from "nuqs";
import { useDefaultLayout } from "react-resizable-panels";
import { panelStorage } from "@/lib/panel-storage";
import {
  canonicalAssistantId,
  canonicalSystemAssistant,
} from "@/lib/assistant-identity";
import {
  agentAccessKnown,
  allowedAssistantId,
  canUseAgent,
} from "@/lib/agent-access";
import { DEFAULT_ASSISTANT_ID } from "@/lib/chat-links";
import { useRouter } from "next/navigation";
import {
  getConfig,
  saveConfig,
  getDeploymentUrl,
  getLangsmithApiKey,
  StandaloneConfig,
} from "@/lib/config";
import { AccountMenu } from "@/app/components/AccountMenu";
import { LoadingScreen } from "@/app/components/LoadingScreen";
import { useHasBeenTrue } from "@/app/hooks/useHasBeenTrue";
import { useCompactLayout } from "@/app/hooks/useCompactLayout";
import { usePanelLayout } from "@/app/hooks/usePanelLayout";
import { loginUrlForConversation } from "@/app/utils/navigationRecovery";
import type { WorkspaceTab } from "@/app/components/WorkspacePanel";
import { cn } from "@/lib/utils";
import { HeaderButton } from "@/app/components/HeaderButton";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/app/hooks/useNotifications";
import { useTheme } from "@/providers/ThemeProvider";
import {
  Bot,
  ChevronDown,
  LayoutPanelLeft,
  MessagesSquare,
  Shield,
  SquarePen,
  UserCog,
  CalendarClock,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ThreadList } from "@/app/components/ThreadList";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { ChatProvider } from "@/providers/ChatProvider";
import { ChatInterface } from "@/app/components/ChatInterface";
import {
  createSkillAuthoringRequest,
  type SkillAuthoringRequest,
} from "@/lib/skill-authoring-request";

// Heavy, rarely-opened surfaces are code-split out of the initial chunk. The
// admin console alone is the largest component in the app and is only reachable
// by admins; the workspace panel pulls in three independent sidebars; the
// dialogs are closed on first paint. Keeping them out of the critical path cuts
// the JS the chat view has to parse before it becomes interactive.
const AdminPanel = lazy(() =>
  import("@/app/components/AdminPanel").then((m) => ({ default: m.AdminPanel }))
);
const WorkspacePanel = lazy(() =>
  import("@/app/components/WorkspacePanel").then((m) => ({
    default: m.WorkspacePanel,
  }))
);
const ConfigDialog = lazy(() =>
  import("@/app/components/ConfigDialog").then((m) => ({
    default: m.ConfigDialog,
  }))
);
const ChangeProfileDialog = lazy(() =>
  import("@/app/components/ChangeProfileDialog").then((m) => ({
    default: m.ChangeProfileDialog,
  }))
);
const TokenSetupWizard = lazy(() =>
  import("@/app/components/TokenSetupWizard").then((m) => ({
    default: m.TokenSetupWizard,
  }))
);

interface HomePageInnerProps {
  config: StandaloneConfig;
  configDialogOpen: boolean;
  setConfigDialogOpen: (open: boolean) => void;
  handleSaveConfig: (config: StandaloneConfig) => void;
}

/** Placeholder shown while a lazily-loaded side panel's chunk is fetched. */
function PanelFallback({ label }: { label: string }) {
  return (
    <div className="bg-card/40 absolute inset-0 flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading {label}…</p>
    </div>
  );
}

function HomePageInner({
  config,
  configDialogOpen,
  setConfigDialogOpen,
  handleSaveConfig,
}: HomePageInnerProps) {
  const router = useRouter();
  const client = useClient();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [sidebar, setSidebar] = useQueryState("sidebar");
  const compactLayout = useCompactLayout();

  const [interruptCount, setInterruptCount] = useState(0);
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<
    "workspace" | "admin" | null
  >(null);
  const handleSkillEditingChange = useCallback((editing: boolean) => {
    setExpandedPanel((current) =>
      editing ? "workspace" : current === "workspace" ? null : current
    );
  }, []);
  const workspaceDirty = useRef<{ accountId: string | null; value: boolean }>({
    accountId: null,
    value: false,
  });
  const [skillAuthoringRequest, setSkillAuthoringRequest] =
    useState<SkillAuthoringRequest | null>(null);
  const handleWorkspaceDirtyChange = useCallback(
    (value: boolean) => {
      workspaceDirty.current = { accountId: user?.user_id ?? null, value };
    },
    [user?.user_id]
  );
  const allowWorkspaceLeave = useCallback(
    () =>
      workspaceDirty.current.accountId !== user?.user_id ||
      !workspaceDirty.current.value ||
      window.confirm("Discard unsaved settings changes?"),
    [user?.user_id]
  );
  const consumeSkillAuthoringRequest = useCallback(
    (id: string) =>
      setSkillAuthoringRequest((previous) =>
        previous?.id === id ? null : previous
      ),
    []
  );
  const createWithAgent = useCallback(() => {
    if (!user || !allowWorkspaceLeave()) return;
    setSkillAuthoringRequest(
      createSkillAuthoringRequest(user.user_id, threadId)
    );
    workspaceDirty.current = { accountId: user.user_id, value: false };
    setWorkspaceOpen(false);
    setExpandedPanel(null);
    setWorkspaceTab(undefined);
  }, [allowWorkspaceLeave, user, threadId]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab | undefined>(
    undefined
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const adminDirty = useRef<{ accountId: string | null; value: boolean }>({
    accountId: null,
    value: false,
  });
  const handleAdminDirtyChange = useCallback(
    (value: boolean) => {
      adminDirty.current = { accountId: user?.user_id ?? null, value };
    },
    [user?.user_id]
  );
  const allowAdminLeave = useCallback(
    () =>
      adminDirty.current.accountId !== user?.user_id ||
      !adminDirty.current.value ||
      window.confirm("Discard unsaved settings changes?"),
    [user?.user_id]
  );
  const allowSettingsLeave = useCallback(
    () =>
      (!workspaceOpen || allowWorkspaceLeave()) &&
      (!adminOpen || allowAdminLeave()),
    [workspaceOpen, adminOpen, allowWorkspaceLeave, allowAdminLeave]
  );
  const sidePanel = usePanelLayout({
    openPanel: workspaceOpen ? "workspace" : adminOpen ? "admin" : null,
    compact: compactLayout,
    threadsOpen: !!sidebar,
  });
  const panelIds = useMemo(
    () => [
      ...(sidebar ? ["thread-history"] : []),
      "chat",
      ...(workspaceOpen
        ? ["right-panel"]
        : adminOpen && user?.role === "admin"
          ? ["admin-panel"]
          : []),
    ],
    [sidebar, workspaceOpen, adminOpen, user?.role]
  );
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "standalone-chat",
    panelIds,
    storage: panelStorage,
  });
  const overlayPanel =
    expandedPanel ??
    (compactLayout
      ? workspaceOpen
        ? "workspace"
        : adminOpen
          ? "admin"
          : sidebar
            ? "threads"
            : null
      : null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const { pendingTokenFocus, requestTokenFocus, refreshNotifications } =
    useNotifications();

  // `mutateThreads` is swapped in by ThreadList after it mounts. Reading it
  // through a ref keeps `handleHistoryRevalidate` referentially stable, so
  // ChatProvider (and every memoized consumer below it) is not torn down and
  // re-created the moment the thread list finishes loading.
  const mutateThreadsRef = useRef<(() => void) | null>(null);
  const handleMutateReady = useCallback((fn: () => void) => {
    mutateThreadsRef.current = fn;
  }, []);
  const handleHistoryRevalidate = useCallback(() => {
    mutateThreadsRef.current?.();
  }, []);
  const handleThreadSelect = useCallback(
    (id: string | null) => {
      void setThreadId(id);
      if (compactLayout) void setSidebar(null);
    },
    [setThreadId, setSidebar, compactLayout]
  );
  const handleSidebarClose = useCallback(() => {
    void setSidebar(null);
  }, [setSidebar]);
  const handleWorkspaceClose = useCallback(() => {
    if (!allowWorkspaceLeave()) return;
    workspaceDirty.current = { accountId: user?.user_id ?? null, value: false };
    setWorkspaceOpen(false);
    setExpandedPanel(null);
    setWorkspaceTab(undefined);
  }, [allowWorkspaceLeave, user?.user_id]);
  const handleTokenFocusConsumed = useCallback(
    () => requestTokenFocus(null),
    [requestTokenFocus]
  );
  const handleAdminClose = useCallback(() => {
    if (!allowAdminLeave()) return;
    setAdminOpen(false);
    setExpandedPanel(null);
  }, [allowAdminLeave]);

  // Keep focus inside a visible panel across responsive/expanded layout changes;
  // only return it to the trigger when the panel actually closes.
  useEffect(() => {
    if (!overlayPanel) return;
    const panelId =
      overlayPanel === "threads"
        ? "thread-history"
        : overlayPanel === "workspace"
          ? "right-panel"
          : "admin-panel";
    const panel = document.getElementById(panelId);
    const active = document.activeElement;
    const triggerLabel =
      overlayPanel === "threads"
        ? "Threads"
        : overlayPanel === "workspace"
          ? "Workspace"
          : "Admin console";
    const previous = panel?.contains(active)
      ? document.querySelector<HTMLButtonElement>(
          `button[aria-label="${triggerLabel}"]`
        )
      : active;
    if (!panel?.contains(active)) panel?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      )
        return;
      event.preventDefault();
      if (overlayPanel === "threads") handleSidebarClose();
      else if (overlayPanel === "workspace") handleWorkspaceClose();
      else handleAdminClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        !panel?.isConnected &&
        previous instanceof HTMLElement &&
        previous.isConnected
      )
        previous.focus();
    };
  }, [
    overlayPanel,
    handleSidebarClose,
    handleWorkspaceClose,
    handleAdminClose,
  ]);

  const configDialogEverOpened = useHasBeenTrue(configDialogOpen);
  const accountDialogEverOpened = useHasBeenTrue(accountDialogOpen);

  // Notification-banner deep link: open the workspace pinned to Tokens and
  // pass the service key through so the matching input scrolls into focus.
  useEffect(() => {
    if (pendingTokenFocus) {
      if (adminOpen && !allowAdminLeave()) {
        requestTokenFocus(null);
        return;
      }
      setExpandedPanel(null);
      setWorkspaceOpen(true);
      setWorkspaceTab("tokens");
      setAdminOpen(false);
    }
  }, [pendingTokenFocus, adminOpen, allowAdminLeave, requestTokenFocus]);

  useEffect(() => {
    // Cancellation guard: `config.assistantId`/`client` can change (or the page
    // can unmount) while a request is in flight. Without this, a slow response
    // for the *previous* assistant could land after the new one and overwrite
    // it. The timeout handle is cleared explicitly so we don't keep a 15s timer
    // alive per request.
    let cancelled = false;
    const controller = new AbortController();

    const synthesizeAssistant = (name: string): Assistant => ({
      assistant_id: config.assistantId,
      graph_id: config.assistantId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      config: {},
      metadata: {},
      version: 1,
      name,
      context: {},
    });

    // Guard against a hung request leaving `assistant` null forever (the chat
    // input stays disabled with no recovery). On timeout we fall through to the
    // synthetic-assistant fallback below so the UI stays usable.
    const withTimeout = <T,>(promise: Promise<T>, ms = 15000): Promise<T> => {
      let timer: ReturnType<typeof setTimeout>;
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Assistant request timed out")),
            ms
          );
        }),
      ]).finally(() => clearTimeout(timer));
    };

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        config.assistantId
      );

    const run = async () => {
      if (isUUID) {
        try {
          const data = await withTimeout(
            client.assistants.get(config.assistantId, {
              signal: controller.signal,
            })
          );
          if (!cancelled) setAssistant(canonicalSystemAssistant(data));
        } catch (error) {
          if (cancelled) return;
          console.error("Failed to fetch assistant:", error);
          setAssistant(synthesizeAssistant("Assistant"));
        }
        return;
      }

      try {
        const assistants = await withTimeout(
          client.assistants.search({
            graphId: config.assistantId,
            limit: 100,
            signal: controller.signal,
          })
        );
        const defaultAssistant = assistants.find(
          (candidate) => candidate.metadata?.["created_by"] === "system"
        );
        if (defaultAssistant === undefined) {
          throw new Error("No default assistant found");
        }
        if (!cancelled) setAssistant(defaultAssistant);
      } catch (error) {
        if (cancelled) return;
        console.error(
          "Failed to find default assistant from graph_id: try setting the assistant_id directly:",
          error
        );
        setAssistant(synthesizeAssistant(config.assistantId));
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, config.assistantId]);

  // A custom or UUID-addressed assistant can resolve to a restricted graph only
  // after it loads; switch to the default once access is confirmed missing.
  useEffect(() => {
    if (
      assistant &&
      config.assistantId !== DEFAULT_ASSISTANT_ID &&
      agentAccessKnown(user) &&
      !canUseAgent(assistant.graph_id, user)
    )
      handleSaveConfig({ ...config, assistantId: DEFAULT_ASSISTANT_ID });
  }, [assistant, config, user, handleSaveConfig]);

  const agentName = canonicalAssistantId(
    assistant?.graph_id || assistant?.name || config.assistantId
  );

  return (
    <>
      {/* Dialogs are lazily mounted on first open (so their chunks stay off the
          initial load path) and then kept mounted — see useHasBeenTrue for why
          unmounting a Radix dialog on close is unsafe. */}
      {configDialogEverOpened && (
        <Suspense fallback={null}>
          <ConfigDialog
            open={configDialogOpen}
            onOpenChange={setConfigDialogOpen}
            onSave={handleSaveConfig}
            initialConfig={config}
          />
        </Suspense>
      )}
      {accountDialogEverOpened && (
        <Suspense fallback={null}>
          <ChangeProfileDialog
            open={accountDialogOpen}
            onOpenChange={setAccountDialogOpen}
          />
        </Suspense>
      )}
      {/* Self-managing: owns its own open state and listens for a global
          re-open event, so it stays mounted — but its chunk loads lazily
          after first paint instead of blocking it. */}
      <Suspense fallback={null}>
        <TokenSetupWizard />
      </Suspense>
      {!overlayPanel && (
        <a
          href="#conversation"
          className="bg-card text-primary focus:ring-ring sr-only z-90 rounded-lg px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:outline-none"
        >
          Skip to conversation
        </a>
      )}
      <div className="flex h-dvh min-h-0 flex-col">
        {/* Header */}
        <header className="border-border bg-card/70 sticky top-0 z-40 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-4 border-b px-6 py-2 backdrop-blur-sm max-[430px]:flex-col max-[430px]:items-stretch max-sm:gap-2 max-sm:px-3">
          {/* Orange accent underline */}
          <div
            className="pointer-events-none absolute -bottom-px left-0 h-[2px] w-24"
            style={{ background: "var(--aptiv-orange)" }}
          />

          <div className="flex min-w-0 items-center gap-4 max-[430px]:justify-between max-sm:gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={
                  theme === "dark"
                    ? "/assets/aptiv_logo_rev_orange.svg"
                    : "/assets/aptiv_logo_color.svg"
                }
                alt="Aptiv"
                width={76}
                height={22}
                className="h-[20px] w-auto shrink-0"
              />
              <span
                className="bg-border h-5 w-px max-lg:hidden"
                aria-hidden="true"
              />
              <h1 className="sr-only min-w-0 text-sm font-semibold tracking-tight wrap-break-word max-[430px]:not-sr-only xl:not-sr-only">
                VSDA Deep Agent
              </h1>
            </div>
            {!sidebar && (
              <HeaderButton
                variant="ghost"
                aria-label="Threads"
                onClick={() => {
                  if (compactLayout) {
                    if (!allowSettingsLeave()) return;
                    setWorkspaceOpen(false);
                    setAdminOpen(false);
                    setExpandedPanel(null);
                  }
                  void setSidebar("1");
                }}
                className="max-lg:size-touch max-lg:p-0"
              >
                <MessagesSquare className="h-4 w-4" />
                <span className="max-lg:hidden">Threads</span>
                {interruptCount > 0 && (
                  <span
                    className="ml-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white"
                    style={{ background: "var(--aptiv-orange)" }}
                  >
                    {interruptCount}
                  </span>
                )}
              </HeaderButton>
            )}
          </div>

          <div
            ref={sidePanel.headerActionsRef}
            className="flex min-w-0 flex-wrap items-center gap-2 max-[430px]:ml-0 max-[430px]:justify-between max-sm:ml-auto max-sm:gap-1"
          >
            <HeaderButton
              variant="ghost"
              aria-label="Scheduled tasks"
              onClick={() => {
                if (!allowSettingsLeave()) return;
                router.push("/tasks");
              }}
              className="max-lg:size-touch max-lg:p-0"
            >
              <CalendarClock className="h-4 w-4" />
              <span className="max-lg:hidden">Tasks</span>
            </HeaderButton>
            {/* Keep the agent picker reachable when the toolbar becomes compact. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <HeaderButton
                  type="button"
                  onClick={() => setConfigDialogOpen(true)}
                  aria-label="Switch agent"
                  className="max-xl:size-touch max-xl:p-0"
                >
                  <Bot
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                  <span className="hidden max-w-44 truncate font-medium xl:inline">
                    {agentName.replace(/^VSDA /, "")}
                  </span>
                  <ChevronDown
                    className="text-muted-foreground hidden h-3.5 w-3.5 xl:block"
                    aria-hidden="true"
                  />
                </HeaderButton>
              </TooltipTrigger>
              <TooltipContent>{agentName}</TooltipContent>
            </Tooltip>
            <span
              ref={sidePanel.boundaryRef}
              aria-hidden="true"
              className="bg-border mx-1 hidden h-6 w-px md:block"
            />
            <span className="max-sm:hidden">
              <ThemeToggle variant="icon" />
            </span>
            <HeaderButton
              variant="ghost"
              onClick={() => {
                if (!allowSettingsLeave()) return;
                setExpandedPanel(null);
                setWorkspaceOpen(!workspaceOpen);
                if (!workspaceOpen) {
                  setAdminOpen(false);
                  if (compactLayout) void setSidebar(null);
                } else setWorkspaceTab(undefined);
              }}
              aria-label="Workspace"
              aria-pressed={workspaceOpen}
              className={
                workspaceOpen
                  ? "bg-primary/10 text-primary hover:bg-primary/15 max-lg:size-touch max-lg:p-0"
                  : "max-lg:size-touch max-lg:p-0"
              }
            >
              <LayoutPanelLeft className="h-4 w-4" />
              <span className="max-lg:hidden">Workspace</span>
            </HeaderButton>
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HeaderButton
                    variant="ghost"
                    iconOnly
                    onClick={() => {
                      if (!allowSettingsLeave()) return;
                      setExpandedPanel(null);
                      setAdminOpen(!adminOpen);
                      if (!adminOpen) {
                        setWorkspaceOpen(false);
                        setWorkspaceTab(undefined);
                        if (compactLayout) void setSidebar(null);
                      }
                    }}
                    aria-label="Admin console"
                    aria-pressed={adminOpen}
                    className={
                      adminOpen
                        ? "bg-primary/10 text-primary hover:bg-primary/15"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  >
                    <Shield className="h-4 w-4" />
                  </HeaderButton>
                </TooltipTrigger>
                <TooltipContent>Admin console</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <HeaderButton
                  variant="ghost"
                  iconOnly
                  onClick={() => setAccountDialogOpen(true)}
                  aria-label="Account settings"
                  className="text-muted-foreground hover:text-foreground max-sm:hidden"
                >
                  <UserCog className="h-4 w-4" />
                </HeaderButton>
              </TooltipTrigger>
              <TooltipContent>Account settings</TooltipContent>
            </Tooltip>
            <HeaderButton
              variant="default"
              onClick={() => {
                void setThreadId(null);
                refreshNotifications();
              }}
              disabled={!threadId}
              aria-label="New Thread"
              className="max-lg:size-touch max-lg:p-0"
            >
              <SquarePen
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span className="max-lg:hidden">New Thread</span>
            </HeaderButton>
            <AccountMenu
              toolbar
              onOpenSettings={() => setAccountDialogOpen(true)}
              onBeforeSignOut={allowSettingsLeave}
            />
          </div>
        </header>

        <div
          ref={sidePanel.containerRef}
          role="main"
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
          >
            {sidebar && (
              <>
                <ResizablePanel
                  id="thread-history"
                  panelRef={sidePanel.threadsRef}
                  data-compact-overlay="true"
                  {...sidePanel.threads}
                  className="bg-background relative min-w-0 max-xl:absolute! max-xl:inset-0 max-xl:z-30 max-xl:w-full!"
                  tabIndex={-1}
                  role="region"
                  aria-label="Thread history"
                  inert={overlayPanel !== null && overlayPanel !== "threads"}
                >
                  <ThreadList
                    onThreadSelect={handleThreadSelect}
                    onMutateReady={handleMutateReady}
                    onClose={handleSidebarClose}
                    onInterruptCountChange={setInterruptCount}
                    userId={user?.user_id}
                  />
                </ResizablePanel>
                <ResizableHandle
                  aria-label="Resize thread history"
                  className={cn("max-xl:hidden", expandedPanel && "invisible")}
                />
              </>
            )}

            <ResizablePanel
              id="chat"
              {...sidePanel.chat}
              className="relative flex min-w-0 flex-col max-xl:w-full!"
              inert={overlayPanel !== null}
            >
              <ChatProvider
                key={user?.user_id ?? "signed-out"}
                activeAssistant={assistant}
                onHistoryRevalidate={handleHistoryRevalidate}
                userId={user?.user_id}
                username={user?.username}
                analysisEngine={config.analysisEngine}
              >
                <ChatInterface
                  key={user?.user_id ?? "signed-out"}
                  assistant={assistant}
                  userId={user?.user_id}
                  skillAuthoringRequest={skillAuthoringRequest}
                  onSkillAuthoringRequestConsumed={consumeSkillAuthoringRequest}
                />
              </ChatProvider>
            </ResizablePanel>

            {workspaceOpen && (
              <>
                <ResizableHandle
                  aria-label="Resize workspace panel"
                  className={cn("max-xl:hidden", expandedPanel && "invisible")}
                />
                <ResizablePanel
                  id="right-panel"
                  panelRef={sidePanel.settingsRef}
                  data-compact-overlay="true"
                  data-expanded={
                    expandedPanel === "workspace" ? "true" : undefined
                  }
                  {...sidePanel.settings}
                  className={cn(
                    "max-xl:bg-background relative min-w-0 max-xl:absolute! max-xl:inset-0 max-xl:z-30 max-xl:w-full!",
                    expandedPanel === "workspace" &&
                      "bg-background absolute! inset-0 z-50 w-full! min-w-0!"
                  )}
                  tabIndex={-1}
                  role="region"
                  aria-label="Workspace"
                >
                  <Suspense fallback={<PanelFallback label="Workspace" />}>
                    <WorkspacePanel
                      key={user?.user_id ?? "signed-out"}
                      initialTab={workspaceTab}
                      initialTokenFocus={pendingTokenFocus}
                      onTokenFocusConsumed={handleTokenFocusConsumed}
                      onClose={handleWorkspaceClose}
                      onCreateWithAgent={createWithAgent}
                      onDirtyChange={handleWorkspaceDirtyChange}
                      expanded={expandedPanel === "workspace"}
                      onToggleExpanded={() =>
                        setExpandedPanel((current) =>
                          current === "workspace" ? null : "workspace"
                        )
                      }
                      onEditingChange={handleSkillEditingChange}
                    />
                  </Suspense>
                </ResizablePanel>
              </>
            )}
            {adminOpen && isAdmin && (
              <>
                <ResizableHandle
                  aria-label="Resize admin panel"
                  className={cn("max-xl:hidden", expandedPanel && "invisible")}
                />
                <ResizablePanel
                  id="admin-panel"
                  panelRef={sidePanel.settingsRef}
                  data-compact-overlay="true"
                  data-expanded={expandedPanel === "admin" ? "true" : undefined}
                  {...sidePanel.settings}
                  className={cn(
                    "max-xl:bg-background relative min-w-0 max-xl:absolute! max-xl:inset-0 max-xl:z-30 max-xl:w-full!",
                    expandedPanel === "admin" &&
                      "bg-background absolute! inset-0 z-50 w-full! min-w-0!"
                  )}
                  tabIndex={-1}
                  role="region"
                  aria-label="Admin console"
                >
                  <Suspense fallback={<PanelFallback label="Admin console" />}>
                    <AdminPanel
                      key={user?.user_id ?? "signed-out"}
                      onClose={handleAdminClose}
                      onDirtyChange={handleAdminDirtyChange}
                      expanded={expandedPanel === "admin"}
                      onToggleExpanded={() =>
                        setExpandedPanel((current) =>
                          current === "admin" ? null : "admin"
                        )
                      }
                    />
                  </Suspense>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  );
}

function HomePageContent() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [config, setConfig] = useState<StandaloneConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [assistantId, setAssistantId] = useQueryState("assistantId");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(loginUrlForConversation(window.location.href));
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const savedConfig = getConfig();
    if (savedConfig && (assistantId || savedConfig.assistantId)) {
      setConfig({
        ...savedConfig,
        assistantId: canonicalAssistantId(
          assistantId || savedConfig.assistantId
        ),
      });
    } else if (getDeploymentUrl()) {
      setConfigDialogOpen(true);
    }
  }, [assistantId]);

  // Restricted graphs render as the default supervisor until the profile
  // confirms access; the stored selection is replaced only once access is known.
  const effectiveAssistantId = config?.assistantId
    ? allowedAssistantId(config.assistantId, user)
    : undefined;
  const effectiveConfig = useMemo(
    () =>
      config &&
      effectiveAssistantId &&
      effectiveAssistantId !== config.assistantId
        ? { ...config, assistantId: effectiveAssistantId }
        : config,
    [config, effectiveAssistantId]
  );

  useEffect(() => {
    if (
      !user ||
      !config?.assistantId ||
      !agentAccessKnown(user) ||
      canUseAgent(config.assistantId, user)
    )
      return;
    const fallback = { ...config, assistantId: DEFAULT_ASSISTANT_ID };
    const saved = getConfig();
    if (saved && !canUseAgent(saved.assistantId, user))
      saveConfig({ ...saved, assistantId: DEFAULT_ASSISTANT_ID });
    setConfig(fallback);
    void setAssistantId(DEFAULT_ASSISTANT_ID);
  }, [config, user, setAssistantId]);

  useEffect(() => {
    // nuqs URL writes can cancel an in-flight login redirect. Restore the
    // saved assistant only after authentication permits staying on this page.
    if (
      !authLoading &&
      user &&
      config &&
      (!assistantId || assistantId !== canonicalAssistantId(assistantId))
    ) {
      setAssistantId(
        assistantId ? canonicalAssistantId(assistantId) : config.assistantId
      );
    }
  }, [authLoading, user, config, assistantId, setAssistantId]);

  const handleSaveConfig = useCallback(
    (newConfig: StandaloneConfig) => {
      saveConfig(newConfig);
      setConfig(newConfig);
      void setAssistantId(newConfig.assistantId);
    },
    [setAssistantId]
  );

  // Both values come from build-time env vars, so read them once instead of on
  // every render — `deploymentUrl`/`apiKey` identity churn would otherwise
  // rebuild the LangGraph client inside ClientProvider.
  const deploymentUrl = useMemo(() => getDeploymentUrl(), []);
  const langsmithApiKey = useMemo(() => getLangsmithApiKey(), []);
  const configDialogEverOpened = useHasBeenTrue(configDialogOpen);

  if (authLoading || !user) {
    // Redirect to /login is in flight (or auth is still resolving). The
    // recoverable variant is used deliberately: if the redirect ever fails to
    // land, the user gets a reload affordance instead of a permanent spinner.
    return <LoadingScreen />;
  }

  if (!effectiveConfig || !effectiveConfig.assistantId) {
    return (
      <>
        {configDialogEverOpened && (
          <Suspense fallback={null}>
            <ConfigDialog
              open={configDialogOpen}
              onOpenChange={setConfigDialogOpen}
              onSave={handleSaveConfig}
              initialConfig={effectiveConfig || undefined}
            />
          </Suspense>
        )}
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Start a conversation</h1>
            <Button
              onClick={() => setConfigDialogOpen(true)}
              className="mt-4"
            >
              Choose an agent
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <ClientProvider
      deploymentUrl={deploymentUrl}
      apiKey={langsmithApiKey}
      accessToken={user.access_token}
    >
      <HomePageInner
        config={effectiveConfig}
        configDialogOpen={configDialogOpen}
        setConfigDialogOpen={setConfigDialogOpen}
        handleSaveConfig={handleSaveConfig}
      />
    </ClientProvider>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HomePageContent />
    </Suspense>
  );
}
