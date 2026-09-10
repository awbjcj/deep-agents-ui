# Agent step limit

Open **LLM & Models → Maximum agent steps** to set the execution budget for long tasks. The default is 1,000 steps; accepted values are whole numbers from 100 to 10,000. Click **Save limit** to apply it to the next message, checkpoint retry, or continuation.

This preference is stored per username in this browser. It applies across model presets and agent choices. Other browsers and direct API clients keep their own configuration. Existing running tasks are unaffected.

The UI sends the value as the top-level LangGraph run config `recursion_limit`, replacing the former hardcoded 100 on sends and continuations. It preserves the assistant's other config and the current user and analysis-engine context. If browser storage is unavailable or the saved value is invalid, runs use 1,000.

The limit counts graph steps, not output tokens, exact LLM calls, or tool calls. Increasing it gives long workflows more room but does not repair an infinite loop or guarantee completion. Runs that reach the selected limit can still report `GraphRecursionError`; inspect repeated work before increasing it further.

Reference: [LangGraph recursion limit](https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT).
