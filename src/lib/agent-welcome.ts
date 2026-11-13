import {
  canUseAgent,
  CODE_ANALYZER_AGENT_ID,
  TASK_AGENT_ID,
  type AgentAccess,
} from "@/lib/agent-access";
import {
  canonicalAssistantId,
  KNOWLEDGE_BASE_ASSISTANT_ID,
  OUTLOOK_ASSISTANT_ID,
} from "@/lib/assistant-identity";

/** Icon names resolved to Lucide components by `WelcomeState`. */
export type WelcomeIcon =
  | "agents"
  | "checklist"
  | "ticket"
  | "search"
  | "history"
  | "grade"
  | "chat"
  | "decision"
  | "send"
  | "card"
  | "mail"
  | "reply"
  | "inbox"
  | "calendar"
  | "schedule"
  | "file"
  | "download"
  | "library"
  | "pattern"
  | "wiki"
  | "requirement"
  | "testRun"
  | "page"
  | "pageTree"
  | "build"
  | "parameters"
  | "code"
  | "compare"
  | "report";

export interface StarterPrompt {
  title: string;
  /** Bracketed placeholders are left for the user to fill in before sending. */
  prompt: string;
  icon: WelcomeIcon;
}

export interface AgentWelcome {
  /** Built-in graph name. */
  name: string;
  icon: WelcomeIcon;
  headline: string;
  lede: string;
  prompts: readonly StarterPrompt[];
}

export const DEFAULT_WELCOME_AGENT = "VSDA Deep Agent";

// Scope and wording follow the agent catalog in ConfigDialog and the backend
// Subagent specs; keep the three in step when an agent's abilities change.
const AGENT_WELCOME: Record<string, AgentWelcome> = {
  [DEFAULT_WELCOME_AGENT]: {
    name: DEFAULT_WELCOME_AGENT,
    icon: "agents",
    headline: "What should your agents work on?",
    lede: "The supervisor delegates work across your connected tools.",
    prompts: [
      {
        title: "Triage open Jira tickets",
        prompt:
          "Summarize the open VSDA Jira tickets for [component], grouped by priority, and flag anything blocked.",
        icon: "ticket",
      },
      {
        title: "Trace requirement coverage",
        prompt:
          "Find the Polarion requirements for [component] and list which ones have no linked test case.",
        icon: "requirement",
      },
      {
        title: "Diagnose a failed build",
        prompt:
          "Look at the latest failed Jenkins build for [job] and explain the most likely root cause.",
        icon: "build",
      },
      {
        title: "Search engineering knowledge",
        prompt:
          "Search the knowledge base and Confluence for [topic] and summarize the current guidance with sources.",
        icon: "library",
      },
    ],
  },
  [TASK_AGENT_ID]: {
    name: TASK_AGENT_ID,
    icon: "checklist",
    headline: "Which task should be finished and verified?",
    lede: "Each requirement gets evidence before the task counts as done.",
    prompts: [
      {
        title: "Build verified release notes",
        prompt:
          "Build release notes from [ticket list], link every ticket, and flag any without a fix version.",
        icon: "ticket",
      },
      {
        title: "Find requirement gaps",
        prompt:
          "Check the Polarion requirements in [project or document] against Jira and list the gaps, with the source for each.",
        icon: "requirement",
      },
      {
        title: "Run and confirm a build",
        prompt:
          "Start the Jenkins build for [job] with [parameters], follow it to the end, and report the result you actually saw.",
        icon: "build",
      },
      {
        title: "Audit with evidence",
        prompt:
          "For [topic], collect the evidence from each source and tell me which requirements are met, blocked or need input.",
        icon: "checklist",
      },
    ],
  },
  "VSDA Jira Agent": {
    name: "VSDA Jira Agent",
    icon: "ticket",
    headline: "What do you need from Jira?",
    lede: "Search live tickets with JQL and review each query before it runs.",
    prompts: [
      {
        title: "Check where a ticket stands",
        prompt:
          "Summarize where [TICKET-KEY] stands, what is blocking it, and what changed this week.",
        icon: "ticket",
      },
      {
        title: "Search with JQL",
        prompt:
          "Find my open P1 bugs in the current sprint and group them by component.",
        icon: "search",
      },
      {
        title: "See who changed what",
        prompt:
          "Show the change history of [TICKET-KEY]: who changed which field, and when.",
        icon: "history",
      },
      {
        title: "Grade a triage ticket",
        prompt:
          "Grade [TICKET-KEY] for triage completeness and list what is missing.",
        icon: "grade",
      },
    ],
  },
  "VSDA Teams Agent": {
    name: "VSDA Teams Agent",
    icon: "chat",
    headline: "What should we catch up on in Teams?",
    lede: "Catch up on chats. Messages, cards and chat changes wait for your review.",
    prompts: [
      {
        title: "Catch up on a chat",
        prompt:
          "Catch me up on the last day of the [chat name] chat: decisions, open questions and anything addressed to me.",
        icon: "chat",
      },
      {
        title: "Find a decision",
        prompt:
          "Find out what the team decided about [topic] and who agreed to it.",
        icon: "decision",
      },
      {
        title: "Send a status update",
        prompt:
          "Draft a short status update for [teammate] about [topic] and show it to me before sending.",
        icon: "send",
      },
      {
        title: "Draft an Adaptive Card",
        prompt:
          "Draft an Adaptive Card that announces [event] with a summary, owner and a link to [URL].",
        icon: "card",
      },
    ],
  },
  [OUTLOOK_ASSISTANT_ID]: {
    name: OUTLOOK_ASSISTANT_ID,
    icon: "mail",
    headline: "What’s on your Outlook agenda?",
    lede: "Catch up on email, find calendar events, and review drafts and meeting changes.",
    prompts: [
      {
        title: "Summarize new mail",
        prompt:
          "Summarize what came into my [folder] folder since yesterday and flag anything that needs a reply.",
        icon: "inbox",
      },
      {
        title: "Draft a reply",
        prompt:
          "Draft a reply to the latest email from [sender] about [topic], keeping it short and specific.",
        icon: "reply",
      },
      {
        title: "Check your calendar",
        prompt: "What’s on my Outlook calendar for [date] in [time zone]?",
        icon: "calendar",
      },
      {
        title: "Schedule a Teams meeting",
        prompt:
          "Schedule a Teams meeting about [topic] with [email addresses] on [date] from [start time] to [end time] in [time zone].",
        icon: "schedule",
      },
    ],
  },
  "VSDA SharePoint Agent": {
    name: "VSDA SharePoint Agent",
    icon: "file",
    headline: "Which document are you looking for?",
    lede: "Search and quote files you can already access in SharePoint or OneDrive.",
    prompts: [
      {
        title: "Find the latest version",
        prompt:
          "Find the latest version of the [document name] spec or slide deck and tell me where it lives.",
        icon: "search",
      },
      {
        title: "Check recent changes",
        prompt: "Who last changed [file name], and when?",
        icon: "history",
      },
      {
        title: "Quote a document",
        prompt:
          "Download [file name] into the chat and summarize its [section] with exact quotes.",
        icon: "download",
      },
      {
        title: "Browse by topic",
        prompt:
          "List the documents about [topic] modified in the last [number] weeks.",
        icon: "file",
      },
    ],
  },
  [KNOWLEDGE_BASE_ASSISTANT_ID]: {
    name: KNOWLEDGE_BASE_ASSISTANT_ID,
    icon: "library",
    headline: "What should we look up in the knowledge base?",
    lede: "Search the document library and the shared LLM Wiki when configured.",
    prompts: [
      {
        title: "Find similar problems",
        prompt:
          "Find past tickets or work items that look like this problem: [describe the symptom].",
        icon: "search",
      },
      {
        title: "Gather documents on a concept",
        prompt:
          "Pull together internal documents about [concept], filtered to [source or type] from [date range].",
        icon: "library",
      },
      {
        title: "Spot recurring patterns",
        prompt:
          "Look across documents about [component] and describe the issues that keep coming back.",
        icon: "pattern",
      },
      {
        title: "Read the LLM Wiki",
        prompt:
          "Search the LLM Wiki for [topic] and summarize the most relevant page.",
        icon: "wiki",
      },
    ],
  },
  "VSDA Polarion Agent": {
    name: "VSDA Polarion Agent",
    icon: "requirement",
    headline: "What do you need from Polarion?",
    lede: "Look up LiveDocs, work items, and test results. You review each query.",
    prompts: [
      {
        title: "Summarize a work item",
        prompt:
          "Summarize [WORK-ITEM-ID] with its links, comments and attachments.",
        icon: "requirement",
      },
      {
        title: "Find uncovered requirements",
        prompt:
          "List the requirements in [project] for [component] that have no linked test case.",
        icon: "search",
      },
      {
        title: "Check a test run",
        prompt:
          "Show the verdicts and failed step results for test run [TEST-RUN-ID].",
        icon: "testRun",
      },
      {
        title: "Draft verification cases",
        prompt:
          "Draft verification cases for [WORK-ITEM-ID] based on its acceptance criteria.",
        icon: "checklist",
      },
    ],
  },
  "VSDA Confluence Agent": {
    name: "VSDA Confluence Agent",
    icon: "page",
    headline: "What should we find or write in Confluence?",
    lede: "Read pages and attachments, or review drafts before publishing.",
    prompts: [
      {
        title: "Summarize a runbook",
        prompt:
          "Find the runbook for [service] and summarize the steps in order.",
        icon: "page",
      },
      {
        title: "Map a space",
        prompt:
          "List the child pages under [space or parent page] with a one-line summary each.",
        icon: "pageTree",
      },
      {
        title: "Turn notes into a page",
        prompt:
          "Turn these meeting notes into a formatted wiki page draft: [paste notes].",
        icon: "card",
      },
      {
        title: "Refresh a component page",
        prompt:
          "Check the [component] page against current Jira and Polarion evidence and draft the updates it needs.",
        icon: "history",
      },
    ],
  },
  "VSDA Jenkins Agent": {
    name: "VSDA Jenkins Agent",
    icon: "build",
    headline: "Which build should we look at?",
    lede: "Inspect jobs and build logs. Starting a build requires approval.",
    prompts: [
      {
        title: "Diagnose a failed build",
        prompt:
          "Read the console output of the last failed build of [job] and point to the error.",
        icon: "build",
      },
      {
        title: "Check a job's history",
        prompt:
          "Show the status and the last [number] builds of [job], with durations.",
        icon: "history",
      },
      {
        title: "Explain build parameters",
        prompt: "Which parameters does [job] take, and what does each one do?",
        icon: "parameters",
      },
      {
        title: "Trigger a build",
        prompt:
          "Trigger [job] with [parameters] and follow it through the queue to the result.",
        icon: "send",
      },
    ],
  },
  [CODE_ANALYZER_AGENT_ID]: {
    name: CODE_ANALYZER_AGENT_ID,
    icon: "code",
    headline: "Which code should we analyze?",
    lede: "Get file-and-line evidence tied to an exact repository revision.",
    prompts: [
      {
        title: "Explain a code path",
        prompt:
          "In [repository] at [revision], explain how [feature or function] works, with file and line references.",
        icon: "code",
      },
      {
        title: "Compare two revisions",
        prompt:
          "Compare [revision A] and [revision B] in [repository] and describe what changed in behavior.",
        icon: "compare",
      },
      {
        title: "Find where it happens",
        prompt:
          "Where in [repository] is [behavior] implemented? Cite the files and lines.",
        icon: "search",
      },
      {
        title: "Run a full analysis",
        prompt:
          "Run a background analysis of [module] in [repository] for [concern] and give me the Markdown report.",
        icon: "report",
      },
    ],
  },
};

/** Built-in agents with their own welcome view. */
export const WELCOME_AGENT_IDS = Object.keys(AGENT_WELCOME);

/**
 * Return welcome copy for a graph ID. Custom assistants built on a known
 * graph use that graph's copy; anything unrecognized, or a restricted graph
 * the account may not use, gets the supervisor's.
 */
export function agentWelcome(
  graphId: string | null | undefined,
  access?: AgentAccess | null
): AgentWelcome {
  const id = graphId ? canonicalAssistantId(graphId) : DEFAULT_WELCOME_AGENT;
  return (
    (canUseAgent(id, access) ? AGENT_WELCOME[id] : undefined) ??
    AGENT_WELCOME[DEFAULT_WELCOME_AGENT]
  );
}
