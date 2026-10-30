"use client";

import { DEFAULT_ASSISTANT_ID } from "@/lib/chat-links";
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
import { getAuthUser } from "@/lib/auth";
import { toast } from "sonner";
import { Client } from "@langchain/langgraph-sdk";
import { AlertCircle, CheckCircle2, Loader2, Route } from "lucide-react";
import {
  getAnalysisEngines,
  analysisBlockerMessage,
  COPILOT_USAGE_EXPLANATION,
  type EngineCatalog,
} from "@/lib/code-analysis";

interface AssistantOption {
  id: string;
  name: string;
  graphId: string;
}

interface AgentInfo {
  /** Short plain-language introduction to the agent. */
  description: string;
  /** Concrete tasks the agent handles well, written as user goals, not tool names. */
  useCases: string[];
  /** Availability or scope caveat shown under the use cases. */
  note?: string;
  /** True for the orchestrating supervisors that work across every source. */
  isSupervisor?: boolean;
}

const AGENT_INFO: Record<string, AgentInfo> = {
  "VSDA Deep Agent": {
    description:
      "The general-purpose assistant and the right default. It plans the work, hands each part to the specialist that owns that system, and combines what comes back into one answer. Anything that writes to another system waits for your approval first.",
    isSupervisor: true,
    useCases: [
      "Read a Jira ticket next to its Confluence design page and tell me where they disagree.",
      "Trace a problem through Polarion requirements, a Teams thread and the related email chain.",
      "Search the document library for a topic, then draft an email summarizing what turned up.",
      "Write a report or diagram from several sources and attach it to the conversation.",
    ],
  },
  "VSDA Task Agent": {
    description:
      "A stricter take on the Deep Agent for jobs with a clear finish line. Before it starts, it writes your request down as a checklist of requirements. It attaches evidence to each item as it goes, and a grader checks the answer before the task counts as done. If something is missing, it tells you what is missing instead of papering over it.",
    isSupervisor: true,
    useCases: [
      "Build release notes from a list of tickets, link every one, and flag any without a fix version.",
      "Check a set of Polarion requirements against Jira and list the gaps, with the source for each.",
      "Start a Jenkins build, follow it to the end, and report the result you actually saw.",
      'Any multi-part request where you would rather hear "blocked" or "needs input" than get a confident guess.',
    ],
    note: "Only for accounts an administrator has enrolled; anyone else gets an access error. It runs within a fixed budget of model calls, tool calls and time, and finishes with a status: completed, needs input, blocked, budget exhausted or unverified. A conversation that starts here stays here.",
  },
  "VSDA Jira Agent": {
    description:
      "Works with live Jira data: exact ticket keys, current status and comments, and JQL searches. When it writes a query for you, you see it before it runs.",
    useCases: [
      "Summarize where CADM-1234 stands, what is blocking it and what changed this week.",
      'Turn "my open P1 bugs in the current sprint" into JQL and run it.',
      "Grade a VSDA triage ticket for completeness.",
      "Draft a ticket from a Polarion requirement. Creating, editing, linking and transitioning tickets is limited to administrators and needs a review.",
    ],
    note: 'For "find tickets like this one", use the Database Agent instead.',
  },
  "VSDA Teams Agent": {
    description:
      "Reads and summarizes your Microsoft Teams chats, and sends messages once you approve them. It can also draft Adaptive Cards.",
    useCases: [
      "Catch me up on the last day of a group chat.",
      "Find out what the team decided about the release date.",
      "Send a status update to a teammate, or start a new chat with them.",
      "Draft an Adaptive Card for a bot or workflow notification.",
    ],
  },
  "VSDA Email Agent": {
    description:
      "Reads your Outlook mailbox and writes email for you. Drafts go to your Drafts folder after you review them, and nothing is sent until you approve it.",
    useCases: [
      "Summarize what came into a folder since yesterday.",
      "Draft a reply to a specific message, or a follow-up to a stakeholder.",
      "Send a saved draft, or a new message you have checked.",
    ],
  },
  "VSDA SharePoint Agent": {
    description:
      "Searches the SharePoint and OneDrive files you already have access to. It can pull a file into the conversation so its contents can be read and quoted.",
    useCases: [
      "Find the latest version of a spec or slide deck by name or topic.",
      "Check who changed a file last, and when.",
      "Download a document or image into the chat so the answer can quote it.",
    ],
    note: "Read-only. Search snippets come from an index, so ask it to download the file when the exact wording matters.",
  },
  "VSDA Database Agent": {
    description:
      "Semantic search over the OpenSearch document library (the vsda_* shelves). It finds things by meaning, not by exact ID.",
    useCases: [
      "Find past tickets or work items that look like a new problem.",
      "Pull together internal documents on a concept, filtered by source, type or date.",
      "Spot recurring patterns across many documents.",
    ],
    note: "The library is a snapshot. For exact IDs or current status, ask the Jira, Polarion or Confluence agent.",
  },
  "VSDA Polarion Agent": {
    description:
      "Works with live Polarion data: work items, LiveDocs, links and comments, plus test runs, verdicts and step results. You review its Lucene queries before they run.",
    useCases: [
      "Summarize a work item with its links, comments and attachments.",
      "List the requirements or test cases in a project that match a condition.",
      "Check a test run's verdicts and step results.",
      "Draft requirements or verification cases from source evidence. Changes in Polarion are limited to administrators and need a review.",
    ],
  },
  "VSDA Confluence Agent": {
    description:
      "Finds, reads and summarizes Confluence pages, including their comments and attachments. It also drafts and formats pages, and keeps feature or component pages up to date from source evidence.",
    useCases: [
      "Find the runbook for a service and summarize the steps.",
      "List the child pages under a space or parent page.",
      "Turn meeting notes or a set of tickets into a formatted wiki page.",
      "Create or update a page, or attach a file, once an administrator approves it.",
    ],
  },
  "VSDA Jenkins Agent": {
    description:
      "Looks up Jenkins jobs and builds, and starts builds after you approve the job and parameters.",
    useCases: [
      "Show the status and recent history of a job.",
      "Explain which parameters a job takes and what they do.",
      "Read the console output of a failed build and point to the error.",
      "Trigger a build with specific parameters and follow it through the queue.",
    ],
  },
  "VSDA Code Analyzer Agent": {
    description:
      "Answers questions about code in the configured Gerrit repositories. It pins each answer to an exact revision and cites files and lines. Analysis runs in an isolated worker that never builds the code or runs its scripts or tests.",
    useCases: [
      "Explain how a code path works at a given revision, with file-and-line evidence.",
      "Compare two revisions and describe what changed in behavior.",
      "Run a longer analysis as a background job and download the Markdown report.",
    ],
    note: "Plastic SCM is not supported yet. The Copilot engine and MATLAB/Simulink inspection appear only where an administrator has enabled them.",
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
    initialConfig?.assistantId || DEFAULT_ASSISTANT_ID
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
  const accessToken = getAuthUser()?.access_token;

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
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
  }, [accessToken, deploymentUrl, langsmithApiKey]);

  useEffect(() => {
    if (open) {
      fetchAssistants();
      if (initialConfig) {
        setAssistantId(initialConfig.assistantId || DEFAULT_ASSISTANT_ID);
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
  const defaultEngine = engineCatalog?.engines.find(
    (engine) => engine.id === engineCatalog.default_engine
  );

  useEffect(() => {
    if (!open || !isCodeAnalyzer || !engineCatalog) return;
    const effectiveEngine =
      analysisEngine === "__default__"
        ? engineCatalog.default_engine
        : analysisEngine;
    const selectedEngine = engineCatalog.engines.find(
      (engine) => engine.id === effectiveEngine
    );
    if (selectedEngine?.ready) return;
    const fallback = engineCatalog.engines.find((engine) => engine.ready);
    if (fallback) setAnalysisEngine(fallback.id);
  }, [analysisEngine, engineCatalog, isCodeAnalyzer, open]);

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
                    {info.note && (
                      <p className="text-xs text-muted-foreground">
                        {info.note}
                      </p>
                    )}
                    {info.isSupervisor && (
                      <p className="border-primary/40 rounded-md border-l-2 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Tip:
                        </span>{" "}
                        If the job only touches one system, pick that agent
                        directly. It will be faster and stay on topic. Keep a
                        supervisor for work that crosses systems or takes
                        several steps.
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
                      <SelectItem
                        value="__default__"
                        disabled={defaultEngine?.ready === false}
                      >
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
                            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                              {engine.ready
                                ? engine.id === "copilot" && engine.quota
                                  ? engine.quota.unlimited
                                    ? "Ready · Unlimited premium interactions"
                                    : `Ready · ${engine.quota.remaining_percentage.toFixed(
                                        1
                                      )}% premium interactions remaining`
                                  : "Ready"
                                : engine.blockers
                                    .map(analysisBlockerMessage)
                                    .join(" ") || "Unavailable"}
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
                  {COPILOT_USAGE_EXPLANATION} This choice applies only to new
                  analysis submissions; it does not change the administrator
                  policy.
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
