"use client";

import React from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ScrollText,
  ClipboardCheck,
  CodeXml,
  Download,
  FileSearch,
  FileText,
  GitCompare,
  Gauge,
  Hammer,
  History,
  Inbox,
  LayoutTemplate,
  Library,
  ListChecks,
  ListTree,
  Mail,
  MessagesSquare,
  Network,
  NotebookText,
  Reply,
  Search,
  Send,
  SlidersHorizontal,
  TestTubeDiagonal,
  Ticket,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { agentWelcome, type WelcomeIcon } from "@/lib/agent-welcome";
import { useAuth } from "@/providers/AuthProvider";

const ICONS: Record<WelcomeIcon, LucideIcon> = {
  agents: Waypoints,
  checklist: ClipboardCheck,
  ticket: Ticket,
  search: Search,
  history: History,
  grade: Gauge,
  chat: MessagesSquare,
  decision: ListChecks,
  send: Send,
  card: LayoutTemplate,
  mail: Mail,
  reply: Reply,
  inbox: Inbox,
  calendar: CalendarDays,
  schedule: CalendarPlus,
  file: FileSearch,
  download: Download,
  library: Library,
  pattern: Network,
  wiki: BookOpen,
  requirement: FileText,
  testRun: TestTubeDiagonal,
  page: NotebookText,
  pageTree: ListTree,
  build: Hammer,
  parameters: SlidersHorizontal,
  code: CodeXml,
  compare: GitCompare,
  report: ScrollText,
};

/**
 * First view of a new conversation, specific to the selected agent: states
 * what it can do and offers editable starter prompts. Choosing one fills the
 * composer; it never sends on its own.
 */
export function WelcomeState({
  graphId,
  onSelectPrompt,
}: {
  graphId?: string | null;
  onSelectPrompt: (prompt: string) => void;
}) {
  const { user } = useAuth();
  const welcome = agentWelcome(graphId, user);
  const Mark = ICONS[welcome.icon];
  return (
    <section
      aria-labelledby="welcome-title"
      data-agent={welcome.name}
      className="welcome-state @container/welcome mx-auto flex w-full max-w-[760px] flex-col items-center px-1 py-4 text-center sm:py-12"
    >
      <span
        className="welcome-mark"
        aria-hidden="true"
      >
        <Mark
          size={22}
          strokeWidth={1.75}
        />
      </span>
      <h2
        id="welcome-title"
        className="mt-4 text-2xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:mt-5 sm:text-3xl"
      >
        {welcome.headline}
      </h2>
      <p className="text-muted-foreground mt-2.5 max-w-136 text-sm leading-relaxed font-normal text-balance sm:mt-3">
        {welcome.lede}
      </p>

      <div className="mt-5 grid w-full max-w-160 gap-2 text-left @lg/welcome:mt-7 @lg/welcome:grid-cols-2 @lg/welcome:gap-3">
        {welcome.prompts.map(({ title, prompt, icon }) => {
          const Icon = ICONS[icon];
          return (
            <button
              key={title}
              type="button"
              onClick={() => onSelectPrompt(prompt)}
              className="starter-card group/starter bg-card/70 focus-visible:ring-ring flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:outline-none sm:p-3"
            >
              <span
                className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--color-primary)"
                aria-hidden="true"
              >
                <Icon size={16} />
              </span>
              <span className="text-foreground min-w-0 flex-1 text-sm font-medium wrap-anywhere">
                {title}
              </span>
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="text-muted-foreground shrink-0 transition-colors duration-150 group-hover/starter:text-(--color-primary)"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
