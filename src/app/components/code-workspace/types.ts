import type { Dispatch, SetStateAction } from "react";
import type { AnalysisEngine } from "@/lib/code-analysis";
import type {
  Comparison,
  SourcePage,
  SourceQuery,
  SourceResource,
} from "@/lib/code-workspace";
import type { ScmProvider } from "@/lib/scm";

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

const resourceLabels: Record<SourceResource, string> = {
  repositories: "Repositories",
  branches: "Branches",
  tags: "Tags",
  reviews: "Reviews",
  commits: "Commits",
  externals: "External repositories",
};

export function sourceResourceLabel(
  resource: SourceResource,
  provider: ScmProvider
) {
  if (provider === "gitlab" && resource === "reviews") return "Merge requests";
  if (provider === "github" && resource === "reviews") return "Pull requests";
  if (provider === "plastic" && resource === "tags") return "Labels";
  if (provider === "plastic" && resource === "commits") return "Changesets";
  return resourceLabels[resource];
}
