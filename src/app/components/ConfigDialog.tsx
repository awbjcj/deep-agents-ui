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
import { StandaloneConfig, getDeploymentUrl, getLangsmithApiKey } from "@/lib/config";
import { toast } from "sonner";
import { Client } from "@langchain/langgraph-sdk";
import { Loader2 } from "lucide-react";

interface AssistantOption {
  id: string;
  name: string;
  graphId: string;
}

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
    description:
      "Reads, searches, summarizes, and edits Jira tickets.",
    useCases: [
      "Summarize the status, blockers, and recent activity of a specific ticket (e.g. CADM-1234).",
      "Find all open tickets matching a query — by assignee, sprint, priority, or label.",
      "Build a JQL query from a plain-language description of what you're looking for.",
      "Grade a VSDA ticket for completeness, or apply edits to a ticket's fields.",
    ],
  },
  "VSDA Teams Agent": {
    description:
      "Reads, summarizes, and sends Microsoft Teams chat messages.",
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
    description:
      "Monitors, queries, and triggers Jenkins CI/CD build jobs.",
    useCases: [
      "Check the current status or recent build history of a Jenkins job.",
      "List available jobs or look up the parameters a job accepts.",
      "Retrieve the console output of a build to diagnose a failure.",
      "Trigger a Jenkins build job with specific parameters.",
    ],
  },
};

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
    initialConfig?.assistantId || ""
  );
  const [assistants, setAssistants] = useState<AssistantOption[]>([]);
  const [loading, setLoading] = useState(false);

  const deploymentUrl = getDeploymentUrl();
  const langsmithApiKey = getLangsmithApiKey();

  const fetchAssistants = useCallback(async () => {
    if (!deploymentUrl) return;
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
      setAssistants(options);
    } catch (error) {
      console.error("Failed to fetch assistants:", error);
      toast.error("Failed to fetch assistants from deployment");
    } finally {
      setLoading(false);
    }
  }, [deploymentUrl, langsmithApiKey]);

  useEffect(() => {
    if (open) {
      fetchAssistants();
      if (initialConfig) {
        setAssistantId(initialConfig.assistantId);
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
    });

    const selected = assistants.find((a) => a.id === assistantId);
    toast.success(
      selected
        ? `Configuration saved — using ${selected.graphId}`
        : "Configuration saved"
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <span className="aptiv-eyebrow">Settings</span>
          <DialogTitle className="mt-1">Configuration</DialogTitle>
          <span className="aptiv-rule" aria-hidden="true" />
          <DialogDescription>
            Deployment settings are configured via environment variables.
            Select an assistant to get started.
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
            {loading ? (
              <div className="flex items-center gap-2 h-10 px-3 text-sm text-muted-foreground border rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assistants...
              </div>
            ) : (
              <Select value={assistantId} onValueChange={setAssistantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an assistant" />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.graphId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {assistantId && (() => {
            const selected = assistants.find((a) => a.id === assistantId);
            const info = selected ? AGENT_INFO[selected.graphId] : undefined;
            if (!info) return null;
            return (
              <div className="grid gap-2">
                <Label>Agent Details</Label>
                <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-3">
                  <p className="text-muted-foreground">{info.description}</p>
                  <div>
                    <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
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
                    <p className="rounded-md border-l-2 border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Tip:</span>{" "}
                      If your task is simple and only needs one source, select
                      that sub-agent directly instead of the supervisor — it's
                      faster and more focused. Use VSDA Deep Agent when the work
                      spans multiple sources or several steps.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !assistantId}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
