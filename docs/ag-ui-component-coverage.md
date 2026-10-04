# AG-UI chat component coverage

Expanded October 4, 2026, using the existing LangGraph backend, following the requested scope: all applicable chat features, without a separate A2UI or CopilotKit runtime.

AG-UI is an event protocol, not a package of drop-in React widgets. These are authored application components using the existing authenticated client and AG-UI trial bridge. The [official event documentation](https://docs.ag-ui.com/sdk/js/core/events) and [LangGraph interrupt documentation](https://docs.langchain.com/oss/python/langgraph/interrupts) informed the implementation. No claim is made that every AG-UI event type has a producer in this backend.

## Capability map

| Capability                | Available implementation                                                              | Source of truth / limitation                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming chat            | Existing markdown, code, math, attachments and source-image viewers                   | LangGraph message chunks and saved messages                                                                                                                            |
| Reasoning disclosure      | Collapsed provider reasoning/summary text                                             | Only text actually supplied in assistant content blocks; encrypted/opaque data is ignored                                                                              |
| Backend tool results      | Existing tool/argument/raw-result views and code-analysis job component               | Unknown, partial, failed or invalid structured results keep the generic renderer                                                                                       |
| Search evidence           | Selectable source cards and draft insertion                                           | Existing search tool output parser                                                                                                                                     |
| Structured result catalog | Markdown, tables, metrics, nonnegative bar charts, source links, suggested follow-ups | Validated `present_result` tool result, restored from conversation history                                                                                             |
| Human approval            | Approve/edit/reject, typed argument validation and before/after review                | Existing server review config and exact interrupt ID mapping                                                                                                           |
| Clarification forms       | Text, number, yes/no, single-select and multi-select; optional fields and skip        | `request_clarification` uses durable LangGraph interrupts; frontend and backend validate responses                                                                     |
| Mixed human requests      | Review all pending approvals/forms, then resume together                              | Each answer is mapped to its own interrupt ID; reviewing alone sends nothing                                                                                           |
| Shared task state         | Completed/total progress and pending/in-progress/completed tasks                      | Server `todos`; the UI does not invent or optimistically mark tasks complete                                                                                           |
| Tool/subagent activity    | Tool results, delegated agent names/status, recent node updates                       | Durable tool messages plus bounded observed stream updates; node updates are not an inferred timing trace                                                              |
| File workspace            | Preview, copy/download, existing text-file editing                                    | Existing thread files; root-only edit preflight, one-file delta writes, source/binary attachments remain read-only                                                     |
| Explicit user context     | Select up to five current conversation file paths for the next message                | Paths are visibly appended to that user message and recorded in `additional_kwargs.ui_context`; contents are not automatically copied; selection is consumed on submit |
| Frontend actions          | Open an existing artifact; reveal tasks/activity/files                                | `preview_artifact` and `focus_chat_panel`; allowlisted actions, stable IDs, no replay on reconnect                                                                     |
| Notifications             | Existing notification ingestion and live toasts                                       | Existing custom events; replayed custom events are suppressed                                                                                                          |
| Run lifecycle             | Stop, reconnect, errors, active-run guard and history restoration                     | Existing authenticated SDK/server execution and checkpoints                                                                                                            |

Structured result rendering and provider reasoning disclosure also work in standard chat. The new workspace panels, clarification forms and frontend actions are scoped to the opt-in trial. The form tool detects unsupported clients and returns instructions to ask a normal chat question instead of interrupting them.

## Tool contracts

The supervisor registers these tools in the companion backend:

- `present_result(presentation)`: version 1 `ui_presentation`, a title and 1–12 blocks. At most 100 table rows, 12 columns, 12 metrics, 30 chart bars, 20 links or 6 suggestions per block. Chart values are finite, nonnegative and bounded. Total serialized output is limited to 200,000 characters. Invalid input is rejected by Pydantic and the frontend retains raw fallback.
- `request_clarification(form, runtime)`: version 1 `clarification`, title, optional description and 1–10 fields. Fields have unique IDs, a label, a type, required/optional state, and up to 12 options for selection controls. Number answers are finite and bounded; `0` and `false` remain valid answers. Unknown keys and invalid choices are rejected. Skip returns a cancelled result, not an action approval.
- `focus_chat_panel(panel, runtime)`: `tasks`, `activity` or `files` only. This reveals an existing panel; it cannot navigate to admin pages or external sites.
- `preview_artifact(path, runtime)`: opens only a file already in that thread's state.

Example presentation argument:

```json
{
  "presentation": {
    "kind": "ui_presentation",
    "version": 1,
    "title": "Source comparison",
    "blocks": [
      {
        "type": "table",
        "columns": ["Source", "Count"],
        "rows": [["Jira", "3"]]
      },
      {
        "type": "chart",
        "unit": "records",
        "items": [{ "label": "Jira", "value": 3 }]
      },
      { "type": "suggestions", "items": ["Compare these sources"] }
    ]
  }
}
```

Example clarification argument:

```json
{
  "form": {
    "kind": "clarification",
    "version": 1,
    "title": "Choose analysis scope",
    "fields": [
      {
        "id": "project",
        "label": "Project",
        "type": "select",
        "options": ["A", "B"]
      },
      {
        "id": "include_closed",
        "label": "Include closed items",
        "type": "boolean"
      }
    ]
  }
}
```

## Deliberate boundaries

- A2UI schemas, arbitrary generated React/HTML, CopilotKit widgets, voice/realtime media and A2A/MCP-app embedding require different services or contracts and are outside the chosen current-backend scope.
- Predictive state updates are not fabricated. Task/file state is authoritative; ordinary form and composer drafts stay local until submitted.
- File-edit checks detect active/paused runs, missing files, changed contents and protected source attachments before writing. The current state API has no atomic compare-and-swap, so a simultaneous write after that check remains possible. Only one file delta is submitted, never the whole snapshot or an old checkpoint. Creation, renaming, deletion and edits to pending subagent files are not added here.
- Recent node updates are a live diagnostic view, not persisted telemetry. Restored tool/subagent statuses come from saved messages. No duration or performance claims are inferred.
- The trial retains the same authentication boundary but has not been validated against a live multi-account backend deployment in this task.

## Verification

- Frontend full suite after review: 284 passed, 13 opt-in tests skipped. Both new opt-in browser fixtures also passed separately on desktop and mobile.
- Targeted backend UI tool, form/catalog, runtime annotation, compiled harness and permission suites: 185 passed. The form test executes a real checkpointed LangGraph interrupt/resume with `InMemorySaver`, without an LLM or remote backend.
- Expanded browser fixture: real React/AG-UI components with mocked SDK services. Exercises all six result types, reasoning disclosure, draft-only suggestions, validation, a mixed form/approval resume, task progress, file edit, selected-file context, preview/panel actions, reconnect and mobile containment. Existing evidence/typed-approval browser fixture also passes.
- TypeScript, scoped ESLint, Ruff and production static export passed. Screenshots: [desktop](evidence/ag-ui-trial/components-desktop.png), [mobile](evidence/ag-ui-trial/components-mobile.png).

## Review fixes

| Before                                                                                                                   | After                                                                                                             | Why                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| File edits replaced backend file records with bare strings.                                                              | Save a structured file record, preserve creation metadata, update modification time, and refuse binary encodings. | Subsequent agent reads require the backend file-data contract.               |
| Reconnect joined only future stream events.                                                                              | Replay the buffered run from event `-1` before accumulating new chunks.                                           | Preserve partial text and tool arguments after disconnects.                  |
| Invalid clarification submissions left focus on the submit button; checkbox errors were not associated with their group. | Focus the first invalid control and associate errors with each group.                                             | Keyboard and assistive-technology users can locate and correct the response. |
| Clarification controls had small mobile text and limited checkbox hit areas.                                             | Use 16px mobile control text, larger checkbox labels, and explicit focus rings.                                   | Improve touch interaction and avoid mobile input zoom.                       |

UI design review followed the `emil-design-eng` skill. Full ESLint, TypeScript, and the production static export with the trial enabled passed. Browser fixtures use mocked authenticated service boundaries; live multi-account validation remains a separate promotion check.

Enablement remains `NEXT_PUBLIC_ENABLE_AG_UI_TRIAL=1` before starting/building the frontend, then **Try AG-UI**. Deploy the companion backend changes to make the new tools available. Git delivery does not enable or deploy the trial.
