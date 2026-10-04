# AG-UI feasibility for deep-agents-ui

Research date: October 4, 2026. Scope: source inspection and current documentation; no integration, browser acceptance, or dependency compatibility tests performed.

## Recommendation

AG-UI is a viable interoperability layer for this application. CopilotKit supplies the React UI and interaction hooks commonly demonstrated with it. Start with richer domain-specific tool renderers in the existing UI, then trial an AG-UI adapter behind a feature flag. Do not replace the main chat runtime merely to obtain better cards or forms.

The highest-value first slice is a structured search-result card with source links, selection controls, and an action to use selected evidence in the next request. This delivers visible value while keeping the existing thread lifecycle. Add an editable approval form next, preserving the backend's existing decision contract.

## Current implementation, verified locally

| Area                          | Evidence                                                                                                                                                 | Implication                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat transport                | `src/app/hooks/useChat.ts`: LangGraph `useStream`, values/messages-tuple/updates/custom streams, reconnect, history, checkpoint submission, cancellation | Transport replacement requires behavioral parity, not just message conversion.                                                               |
| Tool UI                       | `src/app/components/ToolCallBox.tsx`: generic arguments/results, `LoadExternalComponent`, dedicated code-analysis job rendering                          | There is already a natural extension point for a renderer registry. Generative UI is not wholly new here.                                    |
| Human review                  | `ToolApprovalInterrupt.tsx`, `BatchToolApprovalInterrupt.tsx`, `src/app/utils/interruptResume.ts`                                                        | Approve/edit/reject and batches already exist; resume is bound to the rendered interrupt ID and rejects stale approvals.                     |
| Agent work                    | `ChatInterface.tsx`, `ChatMessage.tsx`, `TasksFilesSidebar.tsx`                                                                                          | Tasks, subagents, files and source-image interactions already exist. Improve their presentation and interaction rather than rebuilding them. |
| State                         | `useChat.ts`: todos/files/source images; namespaced subagent file overlay                                                                                | A new adapter must preserve pending files before the parent task returns.                                                                    |
| Authentication                | `src/providers/ClientProvider.tsx`: JWT and API-key headers                                                                                              | Any additional endpoint must preserve user identity, ownership and refreshed credentials.                                                    |
| Deployment                    | `next.config.ts`: production static export at `/chat`; backend `src/backends/main.py` mounts it                                                          | Copying a Next.js server-route starter will not work in the deployed static frontend.                                                        |
| Existing migration constraint | `docs/superpowers/specs/2026-05-28-v3-stream-migration-design.md` and `useChat.ts`                                                                       | Event-stream migration is explicitly deferred; AG-UI should be tested independently.                                                         |

The UI currently has no AG-UI or CopilotKit dependency in package.json. The inspected AG-UI checkout is commit `97f789cc1`; its Dojo pins CopilotKit packages at 1.76.0. These are checkout facts, not a claim about the latest published compatible versions.

## Useful capabilities and proposed features

| Priority | Proposed experience                                                   | Applicable mechanism                                                                             | Project-specific work                                                                                                               |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Search evidence cards: title, source, excerpt, select, open           | CopilotKit v2 `useRenderTool`; or an equivalent local renderer registry                          | Define validated result schemas for actual tool outputs, source identifiers and a generic fallback.                                 |
| 1        | Readable approval forms and before/after previews                     | Existing review components; AG-UI interrupts and CopilotKit `useInterrupt` if transport migrates | Preserve allowed decisions, batch ordering, interrupt IDs and server-side permission checks.                                        |
| 2        | Clarification forms: choose project, scope, files or analysis options | `useHumanInTheLoop` for frontend interactive tools; backend interrupts for durable server pauses | Persist answers through the appropriate backend contract; distinguish clarification from approval.                                  |
| 2        | Agent opens a report, focuses a file or selects a workspace tab       | `useFrontendTool`                                                                                | Register a small set of typed browser actions. Reopening history must not execute an action again.                                  |
| 2        | Agent understands the selected artifact and chosen evidence           | `useAgentContext`, plus deliberate backend context mapping                                       | Send relevant IDs/selection and bounded content; exclude tokens and administration secrets.                                         |
| 3        | Editable plan or report alongside the conversation                    | AG-UI state snapshots/deltas                                                                     | Establish field ownership, revisions and conflict behavior. Existing files are already editable; focus on structured collaboration. |
| 3        | Clearer execution timeline spanning subagents                         | AG-UI lifecycle, step, tool and application events                                               | Add backend semantic progress where needed; protocol events alone do not supply a complete trace.                                   |
| Later    | Agent-selected layouts from an approved UI catalog                    | A2UI rendering over AG-UI                                                                        | Separate evaluation; start with authored React components rather than arbitrary generated UI.                                       |

These are proposed additions or enhancements, not features supplied automatically by installing AG-UI.

## Integration choices

1. **Extend the present LangGraph UI first.** Add validated tool renderers around ToolCallBox, reuse existing styles and approval behavior, and keep useChat as the lifecycle owner. Lowest disruption; no AG-UI interoperability yet.
2. **Use AG-UI client primitives with the custom UI.** Investigate a protected adapter to the existing LangGraph runtime, consumed through `@ag-ui/client`. This fits a static frontend but requires maintaining the React binding and renderer layer. Prefer preserving the existing execution/checkpoint service over creating a second graph instance with a separate persistence lifecycle.
3. **Use CopilotKit headless React with a runtime service.** Its hooks and rendering registries can support the existing visual shell. A runtime can run separately from the static frontend and adapt the existing LangGraph deployment. This adds a service and requires JWT/ownership/config forwarding.
4. **Connect CopilotKit directly to a self-managed AG-UI endpoint.** Current official documentation lists production `selfManagedAgents` under Enterprise Intelligence licensing. `agents__unsafe_dev_only` is explicitly for prototypes. Do not assume this is a free, supported production shortcut; evaluate the licensing or choose another route.

Recommendation: option 1 for immediate product improvement, then compare options 2 and 3 in an isolated trial. Do not maintain both LangGraph useStream and CopilotKit/AG-UI as simultaneous owners of one active run.

## Compatibility details that need a trial

- CopilotKit v2 `useRenderToolCall()` consumes renderers; `useRenderTool(...)` registers them. Older examples use the same hook name with a different API. Pin and test the actual package set rather than mixing examples.
- Current LangGraph adapter documentation describes opt-in structured interrupt outcomes and legacy compatibility. The existing application submits an interrupt-ID-keyed decisions map. Standard AG-UI resumes, cancellation sentinels and parallel-interrupt mapping must be translated deliberately; a boolean approval demo is insufficient.
- Preserve thread ownership, history, cancellation, reload/reconnect, per-run settings, custom notifications, upload references, source images, subagent pending files and backend error visibility.
- Shared state is not automatic concurrency control or persistence. Browser selection state and server-owned execution state need different write rules.
- A2UI is a separate declarative rendering layer. AG-UI alone does not furnish a safe, complete component catalog.

## Proposed trial and acceptance

Create an opt-in chat route using an actual existing tool and authenticated backend. Implement one search card, one browser action and one durable approval. Reuse existing thread storage and keep the normal route available.

Require evidence for: streamed partial tool arguments; malformed/unknown output fallback; restored cards after reload; no duplicate actions on replay; correct approve/edit/reject for multiple pending interrupts; stale-approval rejection; reconnect without duplicate messages or missing pending files; cancellation and terminal errors; user isolation; unchanged execution budgets; static build deployment; keyboard and mobile usability.

No performance or bundle-size improvement is claimed. Measure both against the current route before promoting the trial.

## Implementation follow-through

The initial tool evidence cards and typed approval improvements are implemented in the default chat. An optional AG-UI client trial is now implemented behind `NEXT_PUBLIC_ENABLE_AG_UI_TRIAL=1`; see [trial usage, evidence and limits](evidence/ag-ui-trial/README.md). It uses a browser bridge over the current authenticated LangGraph client. It does not expose an AG-UI wire endpoint or replace the production chat runtime. Live backend promotion checks remain explicitly outstanding.

## Sources consulted

- [AG-UI introduction](https://docs.ag-ui.com/introduction)
- [AG-UI state management](https://docs.ag-ui.com/concepts/state)
- [Official LangGraph TypeScript adapter](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/typescript/README.md)
- [Official LangGraph Python adapter](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/python/README.md)
- [CopilotKit v2 tool rendering and v1/v2 distinction](https://docs.copilotkit.ai/reference/v2/hooks/useRenderToolCall)
- [Frontend tools](https://docs.copilotkit.ai/reference/v2/hooks/useFrontendTool)
- [Backend interrupts](https://docs.copilotkit.ai/reference/v2/hooks/useInterrupt)
- [Interactive frontend tools](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop)
- [Application context](https://docs.copilotkit.ai/reference/v2/hooks/useAgentContext)
- [Self-managed agent configuration and licensing](https://docs.copilotkit.ai/backend/self-managed-agents)

Context7 was queried for AG-UI and CopilotKit, followed by primary documentation checks. No Nx MCP tool was available; local source inspection was used for the AG-UI checkout.
