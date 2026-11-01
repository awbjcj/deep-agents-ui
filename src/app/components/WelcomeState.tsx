"use client";

import React from "react";
import {
  ArrowUpRight,
  BookOpen,
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
      className="welcome-state mx-auto flex w-full max-w-[760px] flex-col items-center px-1 py-4 text-center sm:py-12"
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
      <p className="aptiv-eyebrow mt-4 sm:mt-5">{welcome.name}</p>
      <h2
        id="welcome-title"
        className="mt-2 text-balance text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2rem]"
      >
        {welcome.headline}
      </h2>
      <p className="mt-2.5 max-w-[34rem] text-balance text-sm font-normal leading-relaxed text-muted-foreground sm:mt-3 sm:text-[15px]">
        {welcome.lede}
      </p>

      <ul
        aria-label={welcome.chipsLabel}
        className="m-0 mt-5 flex max-w-[40rem] list-none flex-wrap justify-center gap-1.5 p-0 max-sm:hidden"
      >
        {welcome.chips.map((name) => (
          <li
            key={name}
            className="m-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary/70"
              aria-hidden="true"
            />
            {name}
          </li>
        ))}
      </ul>

      <div className="mt-6 grid w-full gap-2 text-left sm:mt-8 sm:grid-cols-2 sm:gap-3">
        {welcome.prompts.map(({ title, prompt, icon }) => {
          const Icon = ICONS[icon];
          return (
            <button
              key={title}
              type="button"
              onClick={() => onSelectPrompt(prompt)}
              className="starter-card group/starter relative flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card/80 p-3 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:items-start sm:p-4"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--color-primary)]"
                aria-hidden="true"
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1 pr-5">
                <span className="block text-sm font-semibold text-foreground">
                  {title}
                </span>
                <span className="mt-1 line-clamp-2 text-[13px] font-normal leading-5 text-muted-foreground max-sm:hidden">
                  {prompt}
                </span>
              </span>
              <ArrowUpRight
                size={15}
                aria-hidden="true"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors duration-150 group-hover/starter:text-[var(--color-primary)] sm:top-4 sm:translate-y-0"
              />
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs font-normal text-muted-foreground max-sm:hidden">
        Prompts fill the message box so you can edit them before sending.
      </p>
    </section>
  );
}
