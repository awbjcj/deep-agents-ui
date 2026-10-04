# AG-UI opt-in trial

Implemented October 4, 2026. The normal chat remains the default.

Expanded on the same date: see the [complete applicable component map](../../ag-ui-component-coverage.md) for structured results, clarification forms, reasoning disclosure, task/activity/file panels and explicit file context. Verification counts below describe the initial trial; the component map records the expanded test results.

## Enable and use

1. Build or start the frontend with `NEXT_PUBLIC_ENABLE_AG_UI_TRIAL=1`. This is a public build-time feature flag, not a secret. Restart/rebuild after changing it.
2. Sign in normally and select **Try AG-UI**, or add `chatTransport=ag-ui` to the existing chat URL. The flag must be enabled for the URL parameter to take effect.
3. Select an existing conversation, or start a trial conversation. Use **Standard chat** to return to the existing interface. Switching views detaches the browser stream without cancelling the server run.
4. Use **Reconnect** after a dropped connection. It reads the saved checkpoint and joins any active run; it does not submit another message or approval.
5. Review each pending approval, then select **Resume reviewed actions**. The existing approve/edit/reject controls and allowed-decision policy are reused.
6. To try agent-directed previews, run the companion backend containing `src/deep_agent/tools/ui_tools.py`, save an artifact in conversation state, and ask the supervisor to use `preview_artifact` with its exact path. Existing root text files can be edited when the conversation is idle; source images and binary attachments remain read-only. Without the trial, this tool returns the available path.

## Implementation boundaries

- `@ag-ui/client` and `@ag-ui/core` are pinned to 1.0.1; RxJS is pinned to 7.8.1.
- `VsdaTrialAgent` adapts the existing authenticated LangGraph SDK client into AG-UI events in the browser. There is no new public AG-UI HTTP endpoint, second graph instance, persistence store, Next.js server route, or CopilotKit runtime.
- The normal ChatProvider and trial are mutually exclusive. The trial reuses existing message rendering, search evidence cards, composer, attachment integration, source images and approval forms.
- Run config preserves execution limits, username and analysis engine, and adds `configurable.ag_ui_trial=true`. Only the new message or an interrupt-ID-keyed resume command is submitted. Runs never resubmit browser state as authoritative graph state; explicit user file edits use a separate one-file delta update after preflight checks.
- Reconnect restores root/nested files and pending approvals. Partial message/tool-argument chunks are accumulated with the SDK's message manager and published as AG-UI message snapshots.
- Cancellation calls the server cancellation API with acknowledgement. Stream errors and incomplete runs are visible and require explicit reconnect; mutations are not automatically retried.
- Browser actions open a file already in the current thread state or reveal the tasks/activity/files panel. Unknown actions/paths are ignored; action IDs are deduplicated within the mounted view, and custom actions/notifications are suppressed on reconnect replay.
- Existing account credentials and ownership enforcement remain in ClientProvider and backend authentication. This change does not grant additional thread access.

## Verification

- `npm test`: 274 passed, 13 opt-in tests skipped at the full-suite checkpoint.
- `node --import tsx/esm --test tests/ag-ui-trial.test.mjs`: real AG-UI client, fake LangGraph SDK service. Covers checkpoint restoration, config forwarding, exact multi-interrupt resume mapping, active-run refusal, reconnect replay suppression, partial text/tool arguments, nested file tombstones, cancellation, terminal errors and file action validation.
- TypeScript and scoped ESLint passed.
- Production static exports passed with the trial flag enabled and disabled during initial implementation. The post-review local export uses `NEXT_PUBLIC_ENABLE_AG_UI_TRIAL=1`; rebuild with `0` to hide the switch.
- Both browser fixtures passed separately with `AG_UI_BROWSER_TEST=1` and `TOOL_INTERACTIONS_BROWSER_TEST=1`. They use real React components and AG-UI client with mocked service boundaries. `TOOL_INTERACTIONS_PLAYWRIGHT_MODULE` can point at an installed Playwright module.
- Trial browser coverage includes React StrictMode mount, restored approval, staged review without submission, ID-mapped resume, custom file preview, read-only reconnect without action replay, follow-up send and exit. The existing interaction fixture covers evidence selection, typed edit validation, draft retention and desktop/mobile layout.
- Desktop and 390px mobile screenshots are saved alongside this document. No horizontal page overflow was observed.
- Backend UI tool, runtime annotation, compiled harness and tool permission suites: 165 passed (including 4 UI tool tests); Ruff passed for changed Python files. One pre-existing LangChain Community deprecation warning was emitted.

## Remaining promotion checks

This is a trial, not a replacement for the default chat. The browser tests mock authenticated services; a real multi-account backend session, interrupted-run reload, live uploads/source images and real tool approvals have not been exercised end to end here. Existing backend ownership checks are reused, but this is not a new live isolation audit.

The expanded trial supports task/subagent activity panels, clarification forms and existing root text-file edits with conflict preflight checks. Unsupported custom interrupt payloads still require their owning interface. No performance or bundle-size improvement is claimed. Deploying and enabling the trial is a separate operation from Git delivery. See the component map for post-review fixes and validation.
