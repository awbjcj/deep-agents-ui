# Agent step limit

Open **LLM & Models → Maximum agent steps** to set the execution budget for long tasks. The default is 1,000 steps; accepted values are whole numbers from 600 to 10,000. Click **Save limit** to apply it to the next message, checkpoint retry, or continuation.

This preference is stored per username in this browser. It applies across model presets and agent choices. Other browsers and direct API clients keep their own configuration. Existing running tasks are unaffected.

The UI sends the value as the top-level LangGraph run config `recursion_limit`, replacing the former hardcoded 100 on sends and continuations. It preserves the assistant's other config and the current user and analysis-engine context. If browser storage is unavailable or the saved value is invalid, runs use 1,000. Values saved before the minimum rose to 600 (100–599) count as invalid, so those runs also use 1,000 until you save a new value.

The limit counts graph steps, not output tokens, exact LLM calls, or tool calls. The backend separately bounds each agent run to a model-call budget (`AGENT_MODEL_CALL_RUN_LIMIT`, default 50). Near the end of that budget the agent is told how many calls remain, and its last call writes a final answer without tools, listing remaining steps if the task is unfinished. Measured runs use about 9–10 graph steps per model call (453 steps for 50 calls), so the 600-step minimum lets that final answer arrive instead of a `GraphRecursionError`. If an administrator raises the model-call budget, allow about 10 steps per call. Increasing the step limit does not repair an infinite loop or guarantee completion; inspect repeated work before increasing it further.

Reference: [LangGraph recursion limit](https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT).
