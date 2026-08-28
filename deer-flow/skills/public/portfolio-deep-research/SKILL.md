---
name: portfolio-deep-research
description: Use for a user's personal investment portfolios, portfolio strategy versions, daily strategy analysis and feedback, valuation snapshots, fact packs, history attribution, or isolated simulation sandboxes. Orchestrates DeerFlow research with dynamically discovered finance Agent capabilities and audited direct execution for local work.
---

# Portfolio Deep Research

Use DeerFlow's native research and finance tools together. Finance capability names,
schemas, ownership rules, and action levels come from the live capability catalog;
never route by keywords or reproduce portfolio business logic in the prompt.

## Start with discovery

1. Call `finance_capability_catalog` once with `environment=recorded` for portfolio,
   strategy, snapshot, fact-pack, history-attribution, and daily-review work.
2. Call it once with `environment=simulation` for virtual orders, fills, ledgers, and
   simulation-only comparisons.
3. Build a per-run name/schema lookup from each result and reuse it. Do not fetch
   the same environment's complete catalog again unless an exact returned schema is
   rejected as stale; in that case refresh at most once.
4. Use only exact capability names and input schemas returned by that call. Never
   shorten, paraphrase, or infer an alias from a resource name.
5. Obtain portfolio, strategy, snapshot, review, sandbox, branch, run, and intent
   IDs from prior tool results. Never invent or infer an ID.

DeerFlow injects the authenticated user and current task into every tool call.
Neither field is a model argument. Never ask the user for an internal user ID.

## Interaction policy

- Treat a short request such as “复盘这个组合” or “创建模拟沙盘” as a complete
  intent. Tool discovery, ownership checks, and workflow details are Agent work;
  do not ask the user to restate them.
- When the prompt already includes an exact portfolio ID, use it directly after
  validating it with the owner-scoped tools. Do not ask the user to select it again.
- Read available context before asking questions. Make conservative defaults for
  reversible, isolated simulations and clearly report those defaults afterward.
- Ask at most one concise clarification at a time, and only when a missing value
  materially changes the result or is required by the live input schema.
- Batch related reads and continue through local read, draft, and auto actions in the
  same run. Do not narrate every internal tool step or request ceremonial approval.

## Portfolio strategy workflow

- From the cached recorded catalog, use the exact returned capabilities for the
  selected portfolio, account state, and strategy versions before giving
  portfolio-specific advice.
- Keep recorded facts, deterministic calculations, researched interpretation,
  assumptions, and recommendations visibly separate.
- Strategy drafts, approval, and activation are versioned local actions. Execute them
  directly when the user's intent is clear and the catalog marks them `draft` or `auto`.
- Never invent holdings, prices, FX rates, cost basis, targets, or performance.

## Daily analysis and feedback

For a durable daily review:

1. Read the active strategy and current account state.
2. Capture/read the relevant immutable snapshot with the exact cached capability
   and schema when requested and appropriate.
3. Build/read the deterministic daily Fact Pack with the exact cached capability
   before interpreting performance.
4. Use DeerFlow deep research for current market, sector, company, policy, and
   counterevidence. Cite sources in the final response.
5. Distinguish Fact Pack metrics from researched interpretation and disclose data gaps.
6. Save and publish the daily review after the evidence is sufficient when the user's
   request clearly asks for a durable review. Do not add a separate approval turn for
   `draft` or `auto` capabilities.

## Simulation sandbox

- Simulations are isolated and must always be labeled as simulation, not recorded
  portfolio performance.
- Prefer cloning an immutable final snapshot when the user wants a sandbox based on
  their actual allocation.
- Scenarios must stay declarative and bounded. Do not execute model-generated code.
- Compare baseline and experiment branches without declaring a winner when evidence
  is insufficient. Report fees, turnover, drawdown, volatility availability, cash
  utilization, and data gaps when returned by the tools.

## Execution policy

- `read`: execute immediately.
- `draft`: save the reversible local draft immediately.
- `auto`: execute immediately in the same tool call. The finance service still creates
  and resolves a durable intent internally, preserving idempotency, owner scope,
  resource-version checks, and audit history.
- `confirm`: reserve for a future external, destructive, or otherwise high-impact
  capability. Only this action level uses the confirmation flow below.

After a `confirm` result:

1. Show the preview, affected resource, and `actionIntentId` to the user.
2. Call `ask_clarification` with `clarification_type=risk_confirmation` and ask the
   user to reply exactly `确认执行 <actionIntentId>` or `取消 <actionIntentId>`.
3. Stop. Do not call `finance_action_intent` in the same run.
4. On the resumed run, call `finance_action_intent` only when the latest real user
   message exactly matches the required phrase. The tool enforces this check.
5. Claim success only when the returned intent status is `executed`; claim cancellation
   only when it is `cancelled`.

Never call Finance API endpoints directly. Use the DeerFlow tools so identity,
task binding, validation, idempotency, and audit rules remain intact.
