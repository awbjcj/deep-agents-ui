import type { Dispatch, SetStateAction } from "react";
import type { AnalysisEngine } from "@/lib/code-analysis";
import type {
  Comparison,
  SourcePage,
  SourceQuery,
  SourceResource,
} from "@/lib/code-workspace";

export type BrowseState = { query: SourceQuery; page: SourcePage };
export type SourceDraft = {
  serverId: string;
  repository: string;
  selector: string;
  resource: SourceResource;
};
export type AnalysisDraft = {
  question: string;
  engine?: AnalysisEngine;
  comparisons: Comparison[];
  questions?: { id: string; question: string }[];
};
export type AnalysisFormDraft = {
  question: string;
  engine: AnalysisEngine | "";
  pairs: { id: number; base: string; target: string }[];
  checklist: string;
};
export type DraftSetter<T> = Dispatch<SetStateAction<T>>;
export type WorkspaceTab = "repositories" | "analysis";

export const resourceLabels: Record<SourceResource, string> = {
  repositories: "Repositories",
  branches: "Branches",
  tags: "Tags / labels",
  reviews: "Reviews",
  commits: "Changesets",
  externals: "External repositories",
};
