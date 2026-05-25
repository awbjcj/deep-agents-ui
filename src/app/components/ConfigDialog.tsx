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
          <DialogTitle>Configuration</DialogTitle>
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
                      {a.name} ({a.graphId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="langsmithApiKey">
              LangSmith API Key{" "}
              <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Input
              id="langsmithApiKey"
              type="password"
              value={langsmithApiKey ? "••••••••" : ""}
              disabled
              className="bg-muted"
            />
          </div>
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
