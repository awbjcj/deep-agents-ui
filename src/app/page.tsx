"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { getConfig, saveConfig, StandaloneConfig } from "@/lib/config";
import { AccountMenu } from "@/app/components/AccountMenu";
import { AdminSidebar } from "@/app/components/AdminSidebar";
import { ConfigDialog } from "@/app/components/ConfigDialog";
import { ModelSidebar } from "@/app/components/ModelSidebar";
import { TokenManagementSidebar } from "@/app/components/TokenManagementSidebar";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider, useClient } from "@/providers/ClientProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { Cpu, Key, MessagesSquare, Settings, Shield, SquarePen } from "lucide-react";
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
  const [showAdminSidebar, setShowAdminSidebar] = useState(false);
  const [showModelSidebar, setShowModelSidebar] = useState(false);
  const [showTokenSidebar, setShowTokenSidebar] = useState(false);

  const fetchAssistant = useCallback(async () => {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        config.assistantId
      );

    if (isUUID) {
      try {
        const data = await client.assistants.get(config.assistantId);
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
        const assistants = await client.assistants.search({
          graphId: config.assistantId,
          limit: 100,
        });
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
            <div className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex">
              <span className="font-semibold uppercase tracking-[0.1em]">Agent</span>
              <span className="max-w-[140px] truncate font-mono text-[11px] text-foreground/60">
                {config.assistantId}
              </span>
            </div>
            <span className="mx-1 hidden h-6 w-px bg-border md:block" />
            <ThemeToggle />
            <span className="mx-0.5 hidden h-5 w-px bg-border md:block" />
            {user?.role === "admin" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowAdminSidebar(!showAdminSidebar)}
                    aria-label="Admin"
                    aria-pressed={showAdminSidebar}
                    className={showAdminSidebar ? "bg-primary/10 text-primary ring-1 ring-primary/40 hover:bg-primary/15" : ""}
                  >
                    <Shield className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Admin</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowModelSidebar(!showModelSidebar)}
                  aria-label="Models"
                  aria-pressed={showModelSidebar}
                  className={showModelSidebar ? "bg-primary/10 text-primary ring-1 ring-primary/40 hover:bg-primary/15" : ""}
                >
                  <Cpu className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Models</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowTokenSidebar(!showTokenSidebar)}
                  aria-label="Token management"
                  aria-pressed={showTokenSidebar}
                  className={showTokenSidebar ? "bg-primary/10 text-primary ring-1 ring-primary/40 hover:bg-primary/15" : ""}
                >
                  <Key className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tokens</TooltipContent>
            </Tooltip>
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

            {showAdminSidebar && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  id="admin"
                  order={3}
                  defaultSize={25}
                  minSize={20}
                  className="relative min-w-[320px]"
                >
                  <AdminSidebar onClose={() => setShowAdminSidebar(false)} />
                </ResizablePanel>
              </>
            )}

            {showModelSidebar && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  id="models"
                  order={4}
                  defaultSize={25}
                  minSize={20}
                  className="relative min-w-[320px]"
                >
                  <ModelSidebar onClose={() => setShowModelSidebar(false)} />
                </ResizablePanel>
              </>
            )}

            {showTokenSidebar && (
              <>
                <ResizableHandle />
                <ResizablePanel
                  id="token-management"
                  order={5}
                  defaultSize={25}
                  minSize={20}
                  className="relative min-w-[320px]"
                >
                  <TokenManagementSidebar
                    onClose={() => setShowTokenSidebar(false)}
                  />
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
    if (savedConfig) {
      setConfig(savedConfig);
      if (!assistantId) {
        setAssistantId(savedConfig.assistantId);
      }
    } else {
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

  const langsmithApiKey =
    config?.langsmithApiKey || process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!config) {
    return (
      <>
        <ConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleSaveConfig}
        />
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome to VSDA Deep Agent</h1>
            <p className="mt-2 text-muted-foreground">
              Configure your deployment to get started
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
      deploymentUrl={config.deploymentUrl}
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
