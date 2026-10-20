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
import type { WorkspaceTab } from "@/app/components/WorkspacePanel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/app/hooks/useNotifications";
import { useTheme } from "@/providers/ThemeProvider";
import {
  LayoutPanelLeft,
  MessagesSquare,
  Shield,
  SquarePen,
  UserCog,
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
    <div className="absolute inset-0 flex items-center justify-center bg-card/40">
      <p className="text-sm text-muted-foreground">Loading {label}…</p>
    </div>
  );
}

function HomePageInner({
  config,
  configDialogOpen,
  setConfigDialogOpen,
  handleSaveConfig,
}: HomePageInnerProps) {
  const client = useClient();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [sidebar, setSidebar] = useQueryState("sidebar");

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
      window.confirm("Discard unsaved skill changes?"),
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
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const { pendingTokenFocus, requestTokenFocus } = useNotifications();

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
    },
    [setThreadId]
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
    setAdminOpen(false);
    setExpandedPanel(null);
  }, []);

  const configDialogEverOpened = useHasBeenTrue(configDialogOpen);
  const accountDialogEverOpened = useHasBeenTrue(accountDialogOpen);

  // Notification-banner deep link: open the workspace pinned to Tokens and
  // pass the service key through so the matching input scrolls into focus.
  useEffect(() => {
    if (pendingTokenFocus) {
      setExpandedPanel(null);
      setWorkspaceOpen(true);
      setWorkspaceTab("tokens");
      setAdminOpen(false);
    }
  }, [pendingTokenFocus]);

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
          if (!cancelled) setAssistant(data);
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
      <div className="flex h-screen flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-16 flex-shrink-0 items-center justify-between gap-4 border-b border-border bg-card/70 px-6 backdrop-blur-sm max-sm:gap-2 max-sm:px-3">
          {/* Orange accent underline */}
          <div
            className="pointer-events-none absolute bottom-[-1px] left-0 h-[2px] w-24"
            style={{ background: "var(--aptiv-orange)" }}
          />

          <div className="flex min-w-0 items-center gap-4 max-sm:gap-2">
            <div className="flex items-center gap-3">
              <img
                src={
                  theme === "dark"
                    ? "/assets/aptiv_logo_rev_orange.svg"
                    : "/assets/aptiv_logo_color.svg"
                }
                alt="Aptiv"
                width={76}
                height={22}
                className="h-5 w-auto"
              />
              <span
                className="h-5 w-px bg-border max-sm:hidden"
                aria-hidden="true"
              />
              <div className="flex flex-col leading-none max-sm:hidden">
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: "var(--aptiv-orange)" }}
                >
                  VSDA
                </span>
                <h1 className="text-[15px] font-semibold tracking-tight">
                  Deep Agent
                </h1>
              </div>
            </div>
            {!sidebar && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Threads"
                onClick={() => setSidebar("1")}
                className="hover:border-primary/40 rounded-full border border-border bg-card px-3 text-foreground hover:bg-accent max-sm:px-2"
              >
                <MessagesSquare className="h-4 w-4 sm:mr-2" />
                <span className="max-sm:hidden">Threads</span>
                {interruptCount > 0 && (
                  <span
                    className="ml-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                    style={{ background: "var(--aptiv-orange)" }}
                  >
                    {interruptCount}
                  </span>
                )}
              </Button>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-1.5 max-sm:gap-1">
            {/* Assistant name surfaced over its raw ID — full ID is in tooltip
                for power users who need to copy it. Clicking opens the
                config dialog so the agent can be switched directly from
                the top bar. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setConfigDialogOpen(true)}
                  aria-label="Switch agent"
                  className="hidden items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground lg:inline-flex"
                >
                  <span className="font-semibold uppercase tracking-[0.1em]">
                    Agent
                  </span>
                  <span className="max-w-[180px] truncate text-[12px] font-medium text-foreground/80">
                    {assistant?.graph_id ||
                      assistant?.name ||
                      config.assistantId}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-mono text-[11px]">
                  {config.assistantId}
                </div>
                <div className="text-[10px] text-primary-foreground/70">
                  Click to switch agent
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="mx-1 hidden h-6 w-px bg-border md:block" />
            <span className="max-sm:hidden">
              <ThemeToggle />
            </span>
            <span className="mx-0.5 hidden h-5 w-px bg-border md:block" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (workspaceOpen && !allowWorkspaceLeave()) return;
                    setExpandedPanel(null);
                    setWorkspaceOpen((v) => {
                      const next = !v;
                      if (next) setAdminOpen(false);
                      else setWorkspaceTab(undefined);
                      return next;
                    });
                  }}
                  aria-label="Workspace"
                  aria-pressed={workspaceOpen}
                  className={
                    workspaceOpen
                      ? "border-primary/40 rounded-full border bg-primary/10 px-3 text-primary hover:bg-primary/15 max-sm:px-2"
                      : "hover:border-primary/40 rounded-full border border-border bg-card px-3 text-foreground hover:bg-accent max-sm:px-2"
                  }
                >
                  <LayoutPanelLeft className="h-4 w-4 sm:mr-2" />
                  <span className="max-sm:hidden">Workspace</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Models · Tools · Skills · Tokens · Connections
              </TooltipContent>
            </Tooltip>
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!adminOpen && workspaceOpen && !allowWorkspaceLeave())
                        return;
                      setExpandedPanel(null);
                      setAdminOpen((v) => {
                        const next = !v;
                        if (next) {
                          setWorkspaceOpen(false);
                          setWorkspaceTab(undefined);
                        }
                        return next;
                      });
                    }}
                    aria-label="Admin console"
                    aria-pressed={adminOpen}
                    className={
                      adminOpen
                        ? "border-[var(--aptiv-orange)]/50 bg-[var(--aptiv-orange)]/10 hover:bg-[var(--aptiv-orange)]/15 rounded-full border text-[var(--aptiv-orange)]"
                        : "hover:border-[var(--aptiv-orange)]/50 rounded-full border border-border bg-card text-foreground hover:text-[var(--aptiv-orange)]"
                    }
                  >
                    <Shield className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Admin console</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAccountDialogOpen(true)}
                  aria-label="Account settings"
                  className="hover:border-primary/40 rounded-full border border-border bg-card text-foreground hover:text-primary max-sm:hidden"
                >
                  <UserCog className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Account settings</TooltipContent>
            </Tooltip>
            <Button
              variant="default"
              size="sm"
              onClick={() => setThreadId(null)}
              disabled={!threadId}
              className="max-sm:hidden"
            >
              <SquarePen className="h-4 w-4" />
              New Thread
            </Button>
            <AccountMenu />
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="standalone-chat"
          >
            {sidebar && (
              <>
                <ResizablePanel
                  id="thread-history"
                  order={1}
                  defaultSize={25}
                  minSize={20}
                  className="relative min-w-[380px]"
                  inert={expandedPanel !== null}
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
                  className={expandedPanel ? "invisible" : undefined}
                />
              </>
            )}

            <ResizablePanel
              id="chat"
              className="relative flex flex-col"
              order={2}
              inert={expandedPanel !== null}
            >
              <ChatProvider
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
                  className={expandedPanel ? "invisible" : undefined}
                />
                <ResizablePanel
                  id="right-panel"
                  order={3}
                  defaultSize={28}
                  minSize={22}
                  className={cn(
                    "relative min-w-[360px] max-sm:absolute max-sm:inset-0 max-sm:z-50 max-sm:!w-full max-sm:min-w-0 max-sm:bg-background",
                    expandedPanel === "workspace" &&
                      "!absolute inset-0 z-50 !w-full !min-w-0 bg-background"
                  )}
                >
                  <Suspense fallback={<PanelFallback label="Workspace" />}>
                    <WorkspacePanel
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
                  className={cn("max-sm:hidden", expandedPanel && "invisible")}
                />
                <ResizablePanel
                  id="admin-panel"
                  order={4}
                  defaultSize={34}
                  minSize={30}
                  className={cn(
                    "relative min-w-[500px] max-sm:absolute max-sm:inset-0 max-sm:z-50 max-sm:!w-full max-sm:min-w-0",
                    expandedPanel === "admin" &&
                      "!absolute inset-0 z-50 !w-full !min-w-0 bg-background"
                  )}
                >
                  <Suspense fallback={<PanelFallback label="Admin console" />}>
                    <AdminPanel
                      onClose={handleAdminClose}
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
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    const savedConfig = getConfig();
    if (savedConfig && savedConfig.assistantId) {
      setConfig(savedConfig);
    } else if (getDeploymentUrl()) {
      setConfigDialogOpen(true);
    }
  }, []);

  useEffect(() => {
    // nuqs URL writes can cancel an in-flight login redirect. Restore the
    // saved assistant only after authentication permits staying on this page.
    if (!authLoading && user && config && !assistantId) {
      setAssistantId(config.assistantId);
    }
  }, [authLoading, user, config, assistantId, setAssistantId]);

  const handleSaveConfig = useCallback((newConfig: StandaloneConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
  }, []);

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

  if (!config || !config.assistantId) {
    return (
      <>
        {configDialogEverOpened && (
          <Suspense fallback={null}>
            <ConfigDialog
              open={configDialogOpen}
              onOpenChange={setConfigDialogOpen}
              onSave={handleSaveConfig}
              initialConfig={config || undefined}
            />
          </Suspense>
        )}
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome to VSDA Deep Agent</h1>
            <p className="mt-2 text-muted-foreground">
              Select an assistant to get started
            </p>
            <Button
              onClick={() => setConfigDialogOpen(true)}
              className="mt-4"
            >
              Open Configuration
            </Button>
          </div>
        </div>
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
        config={config}
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
