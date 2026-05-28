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

const AGENT_INFO: Record<string, { description: string; tools: string[] }> = {
  "VSDA Deep Agent": {
    description:
      "Supervisor agent that routes queries to specialized sub-agents for Jira, Teams, Email, Database, Polarion, and Confluence.",
    tools: [
      "record_user_history",
      "save_user_preference",
      "recall_user_history",
      "list_user_preferences",
      "save_scope_note",
      "prepare_workspace",
      "run_python",
    ],
  },
  "VSDA Jira Agent": {
    description:
      "Specializes in retrieving and summarizing Jira tickets based on user queries.",
    tools: [
      "extract_jira_context",
      "search_jira_tickets",
      "get_jira_ticket",
      "create_jql_query",
      "grade_vsda_ticket",
      "edit_jira_ticket",
    ],
  },
  "VSDA Teams Agent": {
    description:
      "Specializes in retrieving, summarizing, and managing Microsoft Teams chat messages.",
    tools: [
      "list_chat_topics",
      "get_chat_messages",
      "send_chat_message",
      "create_chat_with_user",
      "get_user_id",
    ],
  },
  "VSDA Email Agent": {
    description:
      "Specializes in retrieving, reading, and sending emails based on user queries.",
    tools: [
      "list_email_folders",
      "list_emails",
      "get_email_content",
      "create_draft_email",
      "send_draft_email",
      "get_user_email_address",
      "send_email",
    ],
  },
  "VSDA Database Agent": {
    description:
      "Specializes in searching the Elasticsearch vector knowledge base to retrieve relevant documents with optional metadata filtering.",
    tools: [
      "list_database_indices",
      "get_database_info",
      "search_database",
      "search_database_with_filter",
      "rewrite_search_query",
      "evaluate_search_results",
    ],
  },
  "VSDA Polarion Agent": {
    description:
      "Specializes in retrieving and summarizing Polarion ALM work items and project information.",
    tools: [
      "resolve_polarion_project",
      "create_polarion_query",
      "search_polarion_work_items",
      "get_polarion_work_item",
      "get_polarion_project_info",
    ],
  },
  "VSDA Confluence Agent": {
    description:
      "Retrieves and summarizes Confluence spaces, pages, and attachments for wiki and knowledge-base content.",
    tools: [
      "list_confluence_spaces",
      "get_confluence_space",
      "create_confluence_query",
      "search_confluence_pages",
      "get_confluence_page",
      "get_confluence_page_by_title",
      "list_confluence_child_pages",
      "get_confluence_page_comments",
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
                <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-2">
                  <p className="text-muted-foreground">{info.description}</p>
                  <div>
                    <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                      Tools
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {info.tools.map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
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
