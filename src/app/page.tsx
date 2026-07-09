"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { getConfig, saveConfig, getDeploymentUrl, getLangsmithApiKey, StandaloneConfig } from "@/lib/config";
import { AccountMenu } from "@/app/components/AccountMenu";
import { ConfigDialog } from "@/app/components/ConfigDialog";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { TokenSetupWizard } from "@/app/components/TokenSetupWizard";
import {
  WorkspacePanel,
  type WorkspaceTab,
} from "@/app/components/WorkspacePanel";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/app/hooks/useNotifications";
import { useTheme } from "@/providers/ThemeProvider";
import {
  LayoutPanelLeft,
  MessagesSquare,
  Settings,
  Shield,
  SquarePen,
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
import { ChatProvider } from "@/providers/ChatProvider";
import { ChatInterface } from "@/app/components/ChatInterface";
import { AdminPanel } from "@/app/components/AdminPanel";

interface HomePageInnerProps {
  config: StandaloneConfig;
  configDialogOpen: boolean;
  setConfigDialogOpen: (open: boolean) => void;
  handleSaveConfig: (config: StandaloneConfig) => void;
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

  const [mutateThreads, setMutateThreads] = useState<(() => void) | null>(null);
  const [interruptCount, setInterruptCount] = useState(0);
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab | undefined>(
    undefined,
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const { pendingTokenFocus, requestTokenFocus } = useNotifications();

  // Notification-banner deep link: open the workspace pinned to Tokens and
  // pass the service key through so the matching input scrolls into focus.
  useEffect(() => {
    if (pendingTokenFocus) {
      setWorkspaceOpen(true);
      setWorkspaceTab("tokens");
      setAdminOpen(false);
    }
  }, [pendingTokenFocus]);

  const fetchAssistant = useCallback(async () => {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        config.assistantId
      );

    // Guard against a hung request leaving `assistant` null forever (the chat
    // input stays disabled with no recovery). On timeout we fall through to the
    // synthetic-assistant fallback below so the UI stays usable.
    const withTimeout = <T,>(promise: Promise<T>, ms = 15000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error("Assistant request timed out")),
            ms
          )
        ),
      ]);

    if (isUUID) {
      try {
        const data = await withTimeout(client.assistants.get(config.assistantId));
        setAssistant(data);
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
        setAssistant({
          assistant_id: config.assistantId,
          graph_id: config.assistantId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          config: {},
          metadata: {},
          version: 1,
          name: "Assistant",
          context: {},
        });
      }
    } else {
      try {
        const assistants = await withTimeout(
          client.assistants.search({
            graphId: config.assistantId,
            limit: 100,
          })
        );
        const defaultAssistant = assistants.find(
          (assistant) => assistant.metadata?.["created_by"] === "system"
        );
        if (defaultAssistant === undefined) {
          throw new Error("No default assistant found");
        }
        setAssistant(defaultAssistant);
      } catch (error) {
        console.error(
          "Failed to find default assistant from graph_id: try setting the assistant_id directly:",
          error
        );
        setAssistant({
          assistant_id: config.assistantId,
          graph_id: config.assistantId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          config: {},
          metadata: {},
          version: 1,
          name: config.assistantId,
          context: {},
        });
      }
    }
  }, [client, config.assistantId]);

  useEffect(() => {
    fetchAssistant();
  }, [fetchAssistant]);

  return (
    <>
      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveConfig}
        initialConfig={config}
      />
      <TokenSetupWizard />
      <div className="flex h-screen flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 flex h-16 flex-shrink-0 items-center justify-between gap-4 border-b border-border bg-card/70 px-6 backdrop-blur-sm">
          {/* Orange accent underline */}
          <div
            className="pointer-events-none absolute bottom-[-1px] left-0 h-[2px] w-24"
            style={{ background: "var(--aptiv-orange)" }}
          />

          <div className="flex min-w-0 items-center gap-4">
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
              <span className="h-5 w-px bg-border" aria-hidden="true" />
              <div className="flex flex-col leading-none">
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
                onClick={() => setSidebar("1")}
                className="rounded-full border border-border bg-card px-3 text-foreground hover:border-primary/40 hover:bg-accent"
              >
                <MessagesSquare className="mr-2 h-4 w-4" />
                Threads
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

          <div className="flex items-center gap-1.5">
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
                    {assistant?.graph_id || assistant?.name || config.assistantId}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-mono text-[11px]">{config.assistantId}</div>
                <div className="text-[10px] text-muted-foreground">
                  Click to switch agent
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="mx-1 hidden h-6 w-px bg-border md:block" />
            <ThemeToggle />
            <span className="mx-0.5 hidden h-5 w-px bg-border md:block" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
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
                      ? "rounded-full border border-primary/40 bg-primary/10 px-3 text-primary hover:bg-primary/15"
                      : "rounded-full border border-border bg-card px-3 text-foreground hover:border-primary/40 hover:bg-accent"
                  }
                >
                  <LayoutPanelLeft className="mr-2 h-4 w-4" />
                  Workspace
                </Button>
              </TooltipTrigger>
              <TooltipContent>Models · Tokens · Connectivity</TooltipContent>
            </Tooltip>
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
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
                        ? "rounded-full border border-[var(--aptiv-orange)]/50 bg-[var(--aptiv-orange)]/10 text-[var(--aptiv-orange)] hover:bg-[var(--aptiv-orange)]/15"
                        : "rounded-full border border-border bg-card text-foreground hover:border-[var(--aptiv-orange)]/50 hover:text-[var(--aptiv-orange)]"
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
                  onClick={() => setConfigDialogOpen(true)}
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
            <Button
              variant="default"
              size="sm"
              onClick={() => setThreadId(null)}
              disabled={!threadId}
            >
              <SquarePen className="h-4 w-4" />
              New Thread
            </Button>
            <AccountMenu />
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
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
                >
                  <ThreadList
                    onThreadSelect={async (id) => {
                      await setThreadId(id);
                    }}
                    onMutateReady={(fn) => setMutateThreads(() => fn)}
                    onClose={() => setSidebar(null)}
                    onInterruptCountChange={setInterruptCount}
                    userId={user?.user_id}
                  />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            <ResizablePanel
              id="chat"
              className="relative flex flex-col"
              order={2}
            >
              <ChatProvider
                activeAssistant={assistant}
                onHistoryRevalidate={() => mutateThreads?.()}
                userId={user?.user_id}
                username={user?.username}
              >
                <ChatInterface
                  assistant={assistant}
                  userId={user?.user_id}
                />
              </ChatProvider>
            </ResizablePanel>

            {workspaceOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  id="right-panel"
                  order={3}
                  defaultSize={28}
                  minSize={22}
                  className="relative min-w-[360px]"
                >
                  <WorkspacePanel
                    initialTab={workspaceTab}
                    initialTokenFocus={pendingTokenFocus}
                    onTokenFocusConsumed={() => requestTokenFocus(null)}
                    onClose={() => {
                      setWorkspaceOpen(false);
                      setWorkspaceTab(undefined);
                    }}
                  />
                </ResizablePanel>
              </>
            )}
            {adminOpen && isAdmin && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  id="admin-panel"
                  order={4}
                  defaultSize={30}
                  minSize={24}
                  className="relative min-w-[380px]"
                >
                  <AdminPanel onClose={() => setAdminOpen(false)} />
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
      if (!assistantId) {
        setAssistantId(savedConfig.assistantId);
      }
    } else if (getDeploymentUrl()) {
      setConfigDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (config && !assistantId) {
      setAssistantId(config.assistantId);
    }
  }, [config, assistantId, setAssistantId]);

  const handleSaveConfig = useCallback((newConfig: StandaloneConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const langsmithApiKey = getLangsmithApiKey();

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!config || !config.assistantId) {
    return (
      <>
        <ConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleSaveConfig}
          initialConfig={config || undefined}
        />
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
      deploymentUrl={getDeploymentUrl()}
      apiKey={langsmithApiKey}
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
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
