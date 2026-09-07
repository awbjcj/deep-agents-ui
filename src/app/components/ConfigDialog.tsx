"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StandaloneConfig,
  getDeploymentUrl,
  getLangsmithApiKey,
} from "@/lib/config";
import { toast } from "sonner";
import { Client } from "@langchain/langgraph-sdk";
import { AlertCircle, CheckCircle2, Loader2, Route } from "lucide-react";
import { getAnalysisEngines, type EngineCatalog } from "@/lib/code-analysis";

interface AssistantOption {
  id: string;
  name: string;
  graphId: string;
}

const DEFAULT_ASSISTANT = "VSDA Deep Agent";

interface AgentInfo {
  /** One-line summary of what the agent is for. */
  description: string;
  /** Concrete tasks the agent handles well — written as user goals, not tool names. */
  useCases: string[];
  /** True for the orchestrating supervisor that routes across every source. */
  isSupervisor?: boolean;
}

const AGENT_INFO: Record<string, AgentInfo> = {
  "VSDA Deep Agent": {
    description:
      "The supervisor. Plans multi-step work and coordinates the specialized sub-agents below, combining results from several sources into a single answer.",
    isSupervisor: true,
    useCases: [
      "Cross-reference a Jira ticket with its related Confluence documentation and summarize both together.",
      "Investigate an issue that spans Polarion requirements, Teams discussions, and email threads.",
      "Research a topic in the knowledge base, then draft and send a summary email about it.",
      "Any request that needs more than one source, or several steps coordinated in order.",
    ],
  },
  "VSDA Jira Agent": {
    description: "Reads, searches, summarizes, and edits Jira tickets.",
    useCases: [
      "Summarize the status, blockers, and recent activity of a specific ticket (e.g. CADM-1234).",
      "Find all open tickets matching a query — by assignee, sprint, priority, or label.",
      "Build a JQL query from a plain-language description of what you're looking for.",
      "Grade a VSDA ticket for completeness, or apply edits to a ticket's fields.",
    ],
  },
  "VSDA Teams Agent": {
    description: "Reads, summarizes, and sends Microsoft Teams chat messages.",
    useCases: [
      "Catch up on the latest messages in a specific chat or channel.",
      "Find what was decided or discussed in a recent group conversation.",
      "Send a message or status update to a teammate or group chat.",
    ],
  },
  "VSDA Email Agent": {
    description:
      "Reads, summarizes, drafts, and sends email from your mailbox.",
    useCases: [
      "Summarize unread or recent emails in a folder.",
      "Draft a reply to a specific message, or a follow-up to a stakeholder.",
      "Send a new email or a saved draft on your behalf.",
    ],
  },
  "VSDA Database Agent": {
    description:
      "Searches the Elasticsearch vector knowledge base of internal documents.",
    useCases: [
      "Find internal documentation or reference material on a topic.",
      "Retrieve the most relevant documents for a question, with optional metadata filters (date, source, type).",
      "Answer a question grounded strictly in indexed knowledge-base content.",
    ],
  },
  "VSDA Polarion Agent": {
    description:
      "Reads and summarizes Polarion ALM work items and project information.",
    useCases: [
      "Retrieve and summarize a specific Polarion work item.",
      "List requirements, test cases, or other work items for a project.",
      "Look up project metadata or build a query against a Polarion project.",
    ],
  },
  "VSDA Confluence Agent": {
    description:
      "Reads and summarizes Confluence spaces, pages, and attachments.",
    useCases: [
      "Find and summarize a wiki page by title or topic within a space.",
      "List the pages or child pages under a given space or parent page.",
      "Pull comments or attachments tied to a specific Confluence page.",
    ],
  },
  "VSDA Jenkins Agent": {
    description: "Monitors, queries, and triggers Jenkins CI/CD build jobs.",
    useCases: [
      "Check the current status or recent build history of a Jenkins job.",
      "List available jobs or look up the parameters a job accepts.",
      "Retrieve the console output of a build to diagnose a failure.",
      "Trigger a Jenkins build job with specific parameters.",
    ],
  },
  "VSDA Code Analyzer Agent": {
    description:
      "Read-only analysis of configured Gerrit code, with immutable revision evidence and persistent reports. Plastic analysis is not yet supported.",
    useCases: [
      "Resolve a repository revision and explain a code path with file-and-line evidence.",
      "Compare two explicit revisions without running repository scripts, builds, or tests.",
      "Track a managed code-analysis job and download its durable Markdown report.",
    ],
  },
};

const BUILT_IN_ASSISTANTS: AssistantOption[] = Object.keys(AGENT_INFO).map(
  (graphId) => ({ id: graphId, name: graphId, graphId })
);

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: StandaloneConfig) => void;
  initialConfig?: StandaloneConfig;
}

export function ConfigDialog({
  open,
  onOpenChange,
  onSave,
  initialConfig,
}: ConfigDialogProps) {
  const [assistantId, setAssistantId] = useState(
    initialConfig?.assistantId || DEFAULT_ASSISTANT
  );
  const [assistants, setAssistants] =
    useState<AssistantOption[]>(BUILT_IN_ASSISTANTS);
  const [loading, setLoading] = useState(false);
  const [analysisEngine, setAnalysisEngine] = useState(
    initialConfig?.analysisEngine ?? "__default__"
  );
  const [engineCatalog, setEngineCatalog] = useState<EngineCatalog | null>(
    null
  );

  const deploymentUrl = getDeploymentUrl();
  const langsmithApiKey = getLangsmithApiKey();

  const fetchAssistants = useCallback(async () => {
    const catalogPromise = getAnalysisEngines()
      .then(setEngineCatalog)
      .catch(() => setEngineCatalog(null));
    if (!deploymentUrl) {
      await catalogPromise;
      return;
    }
    setLoading(true);
    try {
      const client = new Client({
        apiUrl: deploymentUrl,
        defaultHeaders: {
          "Content-Type": "application/json",
          ...(langsmithApiKey ? { "X-Api-Key": langsmithApiKey } : {}),
        },
      });
      const results = await client.assistants.search({ limit: 100 });
      const options: AssistantOption[] = results.map((a) => ({
        id: a.assistant_id,
        name: a.name || a.graph_id || a.assistant_id,
        graphId: a.graph_id,
      }));
      if (options.length > 0) {
        setAssistantId((current) => {
          const resolved = options.find((item) => item.graphId === current);
          return resolved?.id ?? current;
        });
        setAssistants(options);
      }
    } catch (error) {
      // A cold or temporarily unreachable deployment must not break the first
      // login flow. Built-in graph IDs remain valid SDK assistant identifiers,
      // so keep the local list usable and let HomePage resolve it later.
      console.warn(
        "Using built-in assistants until deployment responds:",
        error
      );
    } finally {
      await catalogPromise;
      setLoading(false);
    }
  }, [deploymentUrl, langsmithApiKey]);

  useEffect(() => {
    if (open) {
      fetchAssistants();
      if (initialConfig) {
        setAssistantId(initialConfig.assistantId || DEFAULT_ASSISTANT);
        setAnalysisEngine(initialConfig.analysisEngine ?? "__default__");
      }
    }
  }, [open, initialConfig, fetchAssistants]);

  const handleSave = () => {
    if (!assistantId) {
      toast.error("Please select an assistant");
      return;
    }

    onSave({
      deploymentUrl,
      assistantId,
      langsmithApiKey: langsmithApiKey || undefined,
      ...(analysisEngine !== "__default__"
        ? {
            analysisEngine: analysisEngine as "deep_agent" | "copilot",
          }
        : {}),
    });

    const selected = assistants.find((a) => a.id === assistantId);
    toast.success(
      selected
        ? `Configuration saved — using ${selected.graphId}`
        : "Configuration saved"
    );
    onOpenChange(false);
  };

  const selectedAssistant = assistants.find((item) => item.id === assistantId);
  const isCodeAnalyzer =
    selectedAssistant?.graphId === "VSDA Code Analyzer Agent";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <span className="aptiv-eyebrow">Settings</span>
          <DialogTitle className="mt-1">Configuration</DialogTitle>
          <span
            className="aptiv-rule"
            aria-hidden="true"
          />
          <DialogDescription>
            Deployment settings are configured via environment variables. Select
            an assistant to get started.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="deploymentUrl">Deployment URL</Label>
            <Input
              id="deploymentUrl"
              value={deploymentUrl}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="assistantId">Assistant</Label>
            {loading && assistants.length === 0 ? (
              <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assistants...
              </div>
            ) : (
              <Select
                value={assistantId}
                onValueChange={setAssistantId}
              >
                <SelectTrigger id="assistantId">
                  <SelectValue placeholder="Select an assistant" />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                    >
                      {a.graphId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {assistantId &&
            (() => {
              const selected = assistants.find((a) => a.id === assistantId);
              const info = selected ? AGENT_INFO[selected.graphId] : undefined;
              if (!info) return null;
              return (
                <div className="grid gap-2">
                  <Label>Agent Details</Label>
                  <div className="space-y-3 rounded-md border bg-muted/50 p-3 text-sm">
                    <p className="text-muted-foreground">{info.description}</p>
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        What it's good for
                      </span>
                      <ul className="mt-1.5 space-y-1.5">
                        {info.useCases.map((useCase) => (
                          <li
                            key={useCase}
                            className="flex gap-2 text-muted-foreground"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary"
                            />
                            <span>{useCase}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {info.isSupervisor && (
                      <p className="border-primary/40 rounded-md border-l-2 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Tip:
                        </span>{" "}
                        If your task is simple and only needs one source, select
                        that sub-agent directly instead of the supervisor — it's
                        faster and more focused. Use VSDA Deep Agent when the
                        work spans multiple sources or several steps.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          {isCodeAnalyzer && (
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-start gap-2.5 border-b border-border/70 bg-muted/25 px-3 py-2.5">
                <Route
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-sm font-semibold">Analysis route</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Choose how new code-analysis requests run in this session.
                  </p>
                </div>
              </header>
              <div className="space-y-3 p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="analysisEngine">Engine</Label>
                  <Select
                    value={analysisEngine}
                    onValueChange={setAnalysisEngine}
                  >
                    <SelectTrigger id="analysisEngine">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        Administrator default
                        {engineCatalog
                          ? ` · ${
                              engineCatalog.default_engine === "deep_agent"
                                ? "Deep Agent"
                                : "Copilot"
                            }`
                          : ""}
                      </SelectItem>
                      {(engineCatalog?.engines ?? []).map((engine) => (
                        <SelectItem
                          key={engine.id}
                          value={engine.id}
                          disabled={!engine.ready}
                        >
                          {engine.id === "deep_agent"
                            ? "Deep Agent"
                            : "Copilot"}
                          {!engine.ready ? " — unavailable" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {engineCatalog ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {engineCatalog.engines.map((engine) => {
                      const Icon = engine.ready ? CheckCircle2 : AlertCircle;
                      return (
                        <div
                          key={engine.id}
                          className={`flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 ${
                            engine.ready
                              ? "border-success/35 bg-success-primary/60"
                              : "border-warning/35 bg-warning-primary/60"
                          }`}
                        >
                          <Icon
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              engine.ready
                                ? "text-success dark:text-emerald-300"
                                : "text-warning dark:text-amber-300"
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold">
                              {engine.id === "deep_agent"
                                ? "Deep Agent"
                                : "Copilot"}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {engine.ready
                                ? "Ready"
                                : engine.blockers.join(" · ") || "Unavailable"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Live readiness is unavailable. The administrator default
                    remains the safest choice.
                  </p>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  This choice applies only to new analysis submissions; it does
                  not change the administrator policy.
                </p>
              </div>
            </section>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!assistantId}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
