# Questionnaire MCP — Extension Specifications
## Heat Map & Collaborative Multi-Agent Protocol
### Version 1.0 — April 2026

> **Scope:** This document specifies two extensions to the base Questionnaire MCP protocol. It assumes familiarity with the base spec (v1.0). These extensions are designed to be built sequentially — Heat Map first, Collaborative Protocol second.

---

## Part I: Heat Map

---

## 1. Overview

The Heat Map is a pre-audit intelligence layer that runs before Phase 1 (Deep Discovery). It analyzes the repository along three axes — churn, coupling, and coverage — and produces a structured heat map that is injected into every agent's context at session start.

Instead of agents exploring the codebase blindly, they enter Phase 1 knowing which files are fragile, which are heavily coupled, and which have no test coverage. Investigation becomes directed rather than exploratory.

### 1.1 Design Goals

- **Directed investigation** — agents spend Phase 4 escalations on files that are empirically risky, not files that happen to be read first
- **Shared situational awareness** — in collaborative sessions, all agents start from the same factual map, not independent mental models built from different reading orders
- **Zero opinion** — the heat map contains only measurements, never conclusions. It tells agents where to look, not what to find
- **Fast** — must complete before Phase 1 begins; target under 30 seconds on repos up to 500k lines

### 1.2 Position in Audit Flow

```
initialize_audit
      │
      ▼
  Phase 0.5: HEAT MAP GENERATION          ← new
      │
      ▼
  Phase 1: Deep Discovery
      │
      ▼
  Phase 2–5: existing protocol
```

The heat map runs automatically after `initialize_audit` succeeds. Agents cannot skip it. Phase 1 is not unlocked until the heat map is complete and injected.

**Immutability rule:** The heat map is generated exactly once per session, by the MCP server during Phase 0.5, immediately after `initialize_audit` succeeds. It is immutable for the lifetime of the session. No agent can trigger regeneration. The codebase is treated as static from session start — commits that land during the audit are irrelevant. Agents joining mid-session receive the stored heat map automatically as part of their `join_session` response. They do not generate their own heat map and cannot request a new one.

---

## 2. Heat Map Axes

### 2.1 Churn Score

**What it measures:** How frequently each file has changed recently, weighted toward recency.

**Why it matters:** Files that change often are either actively developed (higher bug introduction rate) or repeatedly patched (indicator of underlying instability). High-churn files near the audit domain — auth files churning in a security audit, DB files churning in a data integrity audit — are high-priority targets.

**How it is computed:**

```
churn_score(file) = Σ (commits touching file in window) × recency_weight
```

Where `recency_weight` decays by week:
- Last 1 week: 1.0
- Weeks 2–4: 0.7
- Weeks 5–8: 0.4
- Weeks 9–12: 0.2

Default window: 90 days. Configurable at `initialize_audit`.

**Data source:** `git log --follow --format="%H %ai" -- <file>`

**Output per file:**
```json
{
  "file": "src/auth/session.js",
  "churn_score": 8.4,
  "commit_count_90d": 23,
  "last_modified": "2026-04-21",
  "last_author": "dev@example.com"
}
```

---

### 2.2 Coupling Density

**What it measures:** How many other files import or depend on a given file, and how many files it depends on in return.

**Why it matters:** Highly coupled files are blast radius amplifiers. A bug in a file that 40 other files import is categorically more dangerous than a bug in a file nothing imports. Coupling also reveals architectural violations — files that shouldn't know about each other but do.

**How it is computed:**

```
coupling_score(file) = (inbound_dependencies × 1.5) + outbound_dependencies
```

Inbound is weighted higher because it represents blast radius — how many files break if this one is wrong.

**Data source:** Static import/require/use analysis. Language-specific parsers:
- JavaScript/TypeScript: AST import analysis via `@babel/parser` or `ts-morph`
- Python: AST `import` and `from` statement analysis
- Go: `import` block analysis
- Other: regex fallback on `import|require|include` patterns

**Output per file:**
```json
{
  "file": "src/db/pool.js",
  "coupling_score": 34.5,
  "inbound_count": 18,
  "inbound_files": ["src/auth/session.js", "src/api/users.js", "..."],
  "outbound_count": 7,
  "outbound_files": ["src/config/db.js", "src/utils/retry.js", "..."]
}
```

---

### 2.3 Coverage Gap

**What it measures:** Which files have no test coverage, low coverage, or no corresponding test file at all.

**Why it matters:** Uncovered code is unverified code. In an audit context, low coverage means the team has no automated tripwire for the bugs the audit might find. It also indicates which areas the developers themselves were least confident about — they either didn't test it because it was hard, or didn't test it because they didn't think about it.

**How it is computed:**

Coverage gap is computed from available sources in priority order:

1. **Coverage report file** — if `coverage/lcov.info`, `coverage.xml`, or equivalent exists, parse it directly. Most accurate.
2. **Test file heuristic** — if no coverage report, check for the existence of a corresponding test file. `src/auth/session.js` → look for `tests/auth/session.test.js`, `__tests__/session.js`, `spec/auth/session_spec.js`, etc.
3. **Directory scan** — files in directories with no `test` or `spec` sibling directory are flagged as likely uncovered.

```
coverage_gap_score(file) =
  0   if line coverage ≥ 80%
  25  if line coverage 50–79%
  50  if line coverage 1–49%
  75  if coverage report exists but file not covered
  100 if no coverage data and no test file found
```

**Output per file:**
```json
{
  "file": "src/payments/processor.js",
  "coverage_gap_score": 75,
  "coverage_source": "lcov",
  "line_coverage_pct": 12,
  "has_test_file": false
}
```

---

## 3. Composite Heat Score

Each file receives a single composite heat score combining all three axes:

```
heat_score(file) = (churn_score × W_churn) 
                 + (coupling_score × W_coupling) 
                 + (coverage_gap_score × W_coverage)
```

Default weights by audit domain:

| Domain | W_churn | W_coupling | W_coverage |
|--------|---------|------------|------------|
| security | 0.35 | 0.40 | 0.25 |
| performance | 0.40 | 0.35 | 0.25 |
| architecture | 0.25 | 0.55 | 0.20 |
| data_integrity | 0.35 | 0.35 | 0.30 |
| observability | 0.30 | 0.35 | 0.35 |
| compliance | 0.25 | 0.40 | 0.35 |

Weights are configurable at `initialize_audit` for users who want to override domain defaults.

Scores are normalized to 0–100 after computation. Files are ranked and bucketed:

| Bucket | Score range | Label |
|--------|-------------|-------|
| 🔴 Critical | 75–100 | Investigate first, escalate everything |
| 🟠 High | 50–74 | Prioritize in Phase 4 |
| 🟡 Medium | 25–49 | Cover but don't over-invest |
| 🟢 Low | 0–24 | Read in Phase 1, deprioritize in Phase 4 |

---

## 4. Heat Map Tool Interface

### 4.1 `get_heat_map`

**Read-only reference tool.** The heat map is never generated by this tool call. It is generated once by the MCP server during Phase 0.5 and stored in session state. `get_heat_map` reads from that stored state only.

Agents receive the heat map automatically in two situations and never need to call this tool proactively:
- As part of the `initialize_audit` response (session creator)
- As part of the `join_session` response (agents joining mid-session)

`get_heat_map` exists for agents that want to re-inspect the raw map data during investigation — for example, to check the coupling score of a file they just found a finding in, or to see which Critical-bucket files they have not yet covered. Calling it at any point during the session is valid. Calling it never triggers regeneration.

**Input:**
```json
{
  "session_id": "string",
  "filter_bucket": "critical | high | medium | low | all"
}
```

**Output:**
```json
{
  "session_id": "string",
  "generated_at": "ISO8601",
  "repo_stats": {
    "total_files_analyzed": 847,
    "files_with_coverage_data": 612,
    "git_window_days": 90,
    "languages_detected": ["typescript", "python"]
  },
  "heat_map": [
    {
      "file": "src/auth/session.js",
      "heat_score": 91.2,
      "bucket": "critical",
      "churn_score": 8.4,
      "coupling_score": 34.5,
      "coverage_gap_score": 75,
      "primary_risk": "coupling"
    }
  ],
  "domain_weights_used": {
    "churn": 0.35,
    "coupling": 0.40,
    "coverage": 0.25
  }
}
```

---

## 5. Heat Map Injection Into Agent Context

The heat map is delivered to agents as a structured context block appended to the `instructions` field at session initialization. Every agent that joins the session — including agents that join mid-session via `join_session` — receives the full heat map.

The injected block looks like this:

```
HEAT MAP — READ BEFORE PHASE 1

The following files have been identified as high-risk based on git churn,
coupling density, and test coverage analysis. This is measurement, not
judgment. You are not required to find problems in these files. You are
required to look harder at them than you would otherwise.

CRITICAL (investigate first, escalate everything):
  src/auth/session.js          score: 91  [coupling: extreme, coverage: 12%]
  src/payments/processor.js    score: 88  [churn: high, coverage: 8%]
  src/db/pool.js               score: 84  [coupling: extreme, churn: moderate]

HIGH (prioritize in Phase 4):
  src/api/middleware/auth.js   score: 71  [coupling: high, churn: moderate]
  src/workers/queue.js         score: 68  [churn: high, coverage: 31%]

When generating main questions in Phase 2, you must include at least
2 questions that directly target Critical-bucket files. Sub-questions
in Phase 3 must include at least one sub-question per Critical file.

Files in the Low bucket may be read in Phase 1 but should not consume
Phase 4 investigation time unless a higher-priority finding leads there.
```

---

## 6. Heat Map Validation of Findings

After `finalize_report` is called, the MCP runs a **heat map alignment check**:

- How many Critical-bucket files produced findings?
- How many Critical-bucket files were not investigated?
- Were Low-bucket files over-investigated relative to Critical files?

This data is included in the report's Methodology appendix:

```
Heat Map Alignment:
  Critical files with findings: 4/5 (80%)
  Critical files not investigated: src/config/secrets.js
  Low-bucket files investigated: 2 (acceptable)
  Heat map predictive accuracy: high — 7 of top 10 heat map files 
  produced FAIL or SUSPICIOUS verdicts
```

Over time, this alignment data feeds back into weight calibration — if the coupling weight consistently predicts findings better than churn, the domain defaults are adjusted.

---

## Part II: Collaborative Multi-Agent Protocol

---

## 7. Overview

The Collaborative Multi-Agent Protocol enables multiple AI coding agents — Claude Code, Gemini CLI, Codex, Cursor, OpenCode, or any MCP-compatible agent — to work together on a single audit session. Agents investigate simultaneously, read each other's findings, react to each other's conclusions, and challenge each other's verdicts. A human-designated Synthesizer finalizes the report.

The result is a report whose findings have been adversarially confirmed by multiple independent perspectives, with contradictions surfaced honestly rather than resolved by averaging.

### 7.1 Design Goals

- **Adversarial confirmation** — findings confirmed by multiple agents independently are treated as high-confidence; findings seen only by one agent are flagged as unverified
- **Honest disagreement** — contradictions between agents are surfaced and documented, never silently resolved
- **Human control** — the user designates the Synthesizer; no agent self-elects or auto-finalizes
- **No hallucination amplification** — agents cannot blindly confirm each other; confirmation requires independent evidence
- **One session, always** — only one active session per MCP server instance at any time

### 7.2 Agent Roles

| Role | Count | Capabilities | Restrictions |
|------|-------|--------------|--------------|
| Investigator | 1–N | All Phase 1–4 tools, `react_to_finding`, `react_to_question` | Cannot call `finalize_report` |
| Synthesizer | Exactly 1 | All Investigator capabilities + `adjudicate_finding` + `finalize_report` | Must adjudicate all contested findings before finalizing |

The Synthesizer is designated by the user at session start or reassigned explicitly before Phase 5. If no Synthesizer is designated at `initialize_audit`, all agents join as Investigators and the session cannot finalize until the user designates one.

---

## 8. Session Lifecycle

### 8.1 One Active Session Rule

Only one active session is permitted per MCP server instance at any time. This is an absolute constraint with no override.

If any agent calls `initialize_audit` while a session is already active:

```json
{
  "status": "rejected",
  "reason": "SESSION_ALREADY_ACTIVE",
  "active_session": {
    "session_id": "cq-8f3a2b",
    "repo": "/path/to/repo",
    "phase": 3,
    "started_by": "claude-code",
    "investigators": ["claude-code", "gemini-cli"],
    "started_at": "2026-04-27T09:14:00Z"
  },
  "message": "Finalize or archive the active session before starting a new one."
}
```

No options. No force flag. The active session must be resolved first.

### 8.2 Session States

```
initialized
    │
    ▼
investigating  ←──── agents join, work Phase 1–4
    │
    ▼
pending_synthesis  ←── all investigators checkpointed all questions
    │                   user designates Synthesizer
    ▼
adjudicating  ←────── Synthesizer resolves contested findings
    │
    ▼
finalized  ─────────── report delivered
    │
    ▼
archived  ──────────── read-only, queryable for delta reports
```

Additionally:

```
investigating ──── user abandons ──→ archived_incomplete
```

An `archived_incomplete` session has no report. Its findings are preserved and readable. It counts as the repo's last audit for delta comparison but is flagged as incomplete.

### 8.3 Valid Exits From an Active Session

**Finalize** — Synthesizer completes adjudication, calls `finalize_report`, session moves to `finalized` then `archived`. MCP server is now free.

**Archive without finalizing** — user explicitly calls `archive_session`. Session is marked `archived_incomplete`. MCP server is now free. No new session can reference this one for resumption — it is permanently closed.

There is no pause-and-resume. Sessions run to completion or are abandoned.

---

## 9. New Tool Interface

### 9.1 `initialize_audit` — Extended

The base `initialize_audit` is extended with collaborative fields:

**Input:**
```json
{
  "repo_path": "string",
  "domain": "security | performance | architecture | data_integrity | observability | compliance",
  "depth": "standard | deep | forensic",
  "agent_id": "string",
  "synthesizer": "string | null",
  "heat_map_window_days": 90,
  "heat_map_weights": {
    "churn": 0.35,
    "coupling": 0.40,
    "coverage": 0.25
  }
}
```

- `agent_id` — identity of the calling agent (e.g. `"claude-code"`, `"gemini-cli"`)
- `synthesizer` — agent ID to designate as Synthesizer immediately, or null to designate later
- `heat_map_window_days` — override default 90-day churn window
- `heat_map_weights` — override domain defaults

**Output:**
```json
{
  "session_id": "string",
  "status": "ready",
  "your_role": "synthesizer | investigator",
  "instructions": "string",
  "heat_map": "HeatMap"
}
```

---

### 9.2 `discover_sessions`

Called by any agent to find active sessions on a given repo. This is the primary mechanism for agents to join without the user manually passing a session ID.

**Input:**
```json
{
  "repo_path": "string"
}
```

**Output:**
```json
{
  "active_sessions": [
    {
      "session_id": "cq-8f3a2b",
      "repo": "/path/to/repo",
      "phase": 2,
      "started_by": "claude-code",
      "started_at": "2026-04-27T09:14:00Z",
      "investigators": ["claude-code"],
      "synthesizer": null,
      "questions_accepted": 4,
      "findings_submitted": 0
    }
  ]
}
```

If no active session exists for the repo, `active_sessions` is an empty array.

---

### 9.3 `join_session`

Called by an agent to join an existing session as an Investigator.

**Input:**
```json
{
  "session_id": "string",
  "agent_id": "string"
}
```

**Output:**
```json
{
  "status": "joined",
  "your_role": "investigator",
  "current_phase": 3,
  "session_state": {
    "observations": "ObservationLog",
    "main_questions": "MainQuestion[]",
    "sub_questions": "SubQuestion[][]",
    "findings": "Finding[]",
    "reactions": "Reaction[]",
    "heat_map": "HeatMap",
    "investigators": ["claude-code", "gemini-cli"],
    "synthesizer": null
  },
  "instructions": "string"
}
```

The joining agent receives the complete current session state. It can see everything every other agent has done. It reads the room before it starts working.

The heat map is included in the `join_session` response automatically — the joining agent does not call `get_heat_map` separately and cannot trigger a new heat map generation. It works from the same map generated at session start, identical to every other agent in the session.

**Constraints:**
- Cannot join a session in `pending_synthesis`, `adjudicating`, `finalized`, or `archived` state
- Cannot join if the repo path of the session does not match the agent's current working directory (prevents accidental cross-repo contamination)
- Cannot trigger heat map regeneration — the stored map is final

---

### 9.4 `designate_synthesizer`

Called by the user (via any agent) to assign the Synthesizer role. Can be called at any point before `finalize_report`.

**Input:**
```json
{
  "session_id": "string",
  "synthesizer_agent_id": "string"
}
```

**Output:**
```json
{
  "status": "synthesizer_designated",
  "synthesizer": "cursor",
  "message": "cursor is now the Synthesizer. It is the only agent authorized to call finalize_report."
}
```

All other agents are notified via their next tool call response that the Synthesizer has been designated.

---

### 9.5 `react_to_finding`

Called by any agent to respond to another agent's finding. Reactions can confirm, challenge, or extend a finding. They cannot override it.

**Input:**
```json
{
  "session_id": "string",
  "agent_id": "string",
  "finding_id": "string",
  "reaction_type": "confirm | challenge | extend",
  "content": "string",
  "evidence": {
    "file_path": "string",
    "line_start": "number",
    "line_end": "number",
    "snippet": "string"
  } | null
}
```

**Reaction types:**

| Type | Meaning | Evidence required? |
|------|---------|-------------------|
| `confirm` | Agent independently reached the same conclusion | Yes — must cite own evidence, not repeat the original |
| `challenge` | Agent believes the finding is incorrect or incomplete | Yes — must cite contradicting evidence |
| `extend` | Agent found additional evidence supporting the finding | Yes — must cite new evidence not in the original |

**The confirmation rule:** An agent cannot confirm a finding by simply agreeing. It must provide its own independent evidence — its own file path, its own snippet, its own reasoning. Confirmation without independent evidence is rejected:

```json
{
  "status": "rejected",
  "reason": "CONFIRMATION_REQUIRES_INDEPENDENT_EVIDENCE",
  "message": "Confirm reactions must include evidence from your own investigation, not a reference to the original finding's evidence."
}
```

**Output — accepted:**
```json
{
  "status": "accepted",
  "reaction_id": "string",
  "finding_status": "confirmed | contested | extended"
}
```

When a finding receives a `challenge` reaction, its status changes to `contested`. Contested findings require Synthesizer adjudication before `finalize_report` is accepted.

---

### 9.6 `react_to_question`

Called by any agent to respond to another agent's main question during Phase 2. Agents can challenge question quality, suggest improvements, or flag that they observed conflicting evidence in Phase 1.

**Input:**
```json
{
  "session_id": "string",
  "agent_id": "string",
  "question_id": "string",
  "reaction_type": "challenge_quality | flag_conflict | endorse",
  "content": "string"
}
```

**Reaction types:**

| Type | Meaning |
|------|---------|
| `challenge_quality` | Question is too shallow, binary, or misses a more important angle |
| `flag_conflict` | Agent's Phase 1 observations contradict the assumption behind the question |
| `endorse` | Agent's Phase 1 observations independently support this question as high priority |

Question reactions do not block the protocol. They are advisory — they inform the Phase 4 investigation prioritization and are included in the report's methodology appendix.

---

### 9.7 `get_session_summary`

Called by any agent at any time to get the current state of the investigation. This is what agents call when the user says "what's the state of the audit?" It is also the tool the user should prompt before designating a Synthesizer.

**Input:**
```json
{
  "session_id": "string"
}
```

**Output:**
```json
{
  "session_id": "string",
  "phase": 4,
  "session_state": "investigating",
  "investigators": ["claude-code", "gemini-cli", "codex", "cursor"],
  "synthesizer": null,
  "findings_summary": {
    "total": 31,
    "by_verdict": {
      "PASS": 8,
      "FAIL": 14,
      "SUSPICIOUS": 6,
      "UNCERTAIN": 3
    },
    "by_severity": {
      "catastrophic": 2,
      "critical": 7,
      "warning": 12,
      "info": 10
    },
    "confirmed_multi_agent": 18,
    "single_agent_unverified": 9,
    "contested": 4
  },
  "investigator_stats": [
    {
      "agent_id": "claude-code",
      "findings_submitted": 12,
      "confirmations_given": 5,
      "challenges_given": 2,
      "confirmation_rate": 0.71
    },
    {
      "agent_id": "gemini-cli",
      "findings_submitted": 11,
      "confirmations_given": 7,
      "challenges_given": 3,
      "confirmation_rate": 0.64
    }
  ],
  "synthesizer_recommendation": {
    "recommended_agent": "gemini-cli",
    "reasoning": "Highest cross-agent confirmation rate (64%), fewest single-agent unverified findings (2), most challenges upheld after investigation (3/3)"
  },
  "heat_map_alignment": {
    "critical_files_with_findings": "4/5",
    "critical_files_uninvestigated": ["src/config/secrets.js"]
  },
  "contested_findings": [
    {
      "finding_id": "F-014",
      "description": "Connection pool cleanup in error path",
      "raised_by": "claude-code",
      "challenged_by": "codex",
      "challenge_summary": "Cleanup handled by middleware"
    }
  ],
  "checkpoints_complete": {
    "claude-code": "4/6",
    "gemini-cli": "6/6",
    "codex": "5/6",
    "cursor": "3/6"
  }
}
```

---

### 9.8 `adjudicate_finding`

Called exclusively by the Synthesizer during Phase 5 to rule on contested findings. Must be called for every contested finding before `finalize_report` is accepted.

**Input:**
```json
{
  "session_id": "string",
  "finding_id": "string",
  "ruling": "uphold | merge | unresolved",
  "upheld_agent": "string | null",
  "reasoning": "string",
  "merged_finding": "MergedFinding | null",
  "unresolved_detail": "string | null"
}
```

**Ruling types:**

| Ruling | Meaning | Required fields |
|--------|---------|-----------------|
| `uphold` | One agent's position wins | `upheld_agent`, `reasoning` |
| `merge` | Both agents' evidence is valid and combined into a richer finding | `merged_finding`, `reasoning` |
| `unresolved` | Cannot be resolved from code alone | `unresolved_detail`, `reasoning` |

**The unresolved path:**

When the Synthesizer rules `unresolved`, it must provide:
- What information would be needed to resolve it
- Where that information likely exists (infrastructure config, runtime environment, etc.)
- What the severity would be under each agent's scenario

Unresolved findings appear in the report under a dedicated section — they are not dropped.

---

### 9.9 `finalize_report` — Extended

Only the designated Synthesizer can call this. The MCP enforces preconditions before accepting the call.

**Preconditions (all must be true):**
- All investigators have called `checkpoint` on all main questions they submitted findings for
- All contested findings have been adjudicated by the Synthesizer
- At least one finding exists with verdict FAIL or SUSPICIOUS
- A Synthesizer has been designated

If any precondition fails:

```json
{
  "status": "rejected",
  "reason": "PRECONDITIONS_NOT_MET",
  "failed_preconditions": [
    {
      "condition": "UNINVESTIGATED_CHECKPOINTS",
      "detail": "claude-code has not checkpointed main question Q-003",
      "action": "claude-code must submit findings for Q-003 sub-questions and call checkpoint"
    },
    {
      "condition": "UNRESOLVED_CONTESTED_FINDINGS",
      "detail": "Finding F-014 is contested and has not been adjudicated",
      "action": "Call adjudicate_finding for F-014 before finalizing"
    }
  ]
}
```

**Input:**
```json
{
  "session_id": "string"
}
```

**Output:**
```json
{
  "status": "report_authorized",
  "findings_summary": "FindingSummary",
  "cross_cutting_concerns": "CrossCuttingConcern[]",
  "escalations": "EscalationFinding[]",
  "adjudications": "AdjudicationRecord[]",
  "unresolved_findings": "UnresolvedFinding[]",
  "heat_map_alignment": "HeatMapAlignment",
  "report_schema": "ReportSchema"
}
```

---

### 9.10 `archive_session`

Called by any agent to abandon an active session without finalizing.

**Input:**
```json
{
  "session_id": "string",
  "reason": "string"
}
```

**Output:**
```json
{
  "status": "archived_incomplete",
  "session_id": "string",
  "findings_preserved": 23,
  "message": "Session archived. Findings are preserved for reference. The MCP server is now ready for a new session."
}
```

---

## 10. The Collaborative Phase Protocol

### Phase 0 — Initialize

One agent calls `initialize_audit`. It becomes the first Investigator, or the Synthesizer if designated immediately. The heat map is generated and stored in session state.

### Phase 0.5 — Heat Map Generation

Runs automatically. Takes under 30 seconds. Produces the heat map and injects it into the session. Phase 1 is locked until this completes.

### Phase 1 — Deep Discovery (Parallel)

All agents run Phase 1 independently and simultaneously. Each calls `submit_observations` with its own observation log. The MCP accepts multiple observation sets — one per agent.

Agents do not share Phase 1 observations in real time. They each build their own independent mental model first. After all connected agents have submitted observations, the MCP merges them into a unified observation log and makes it available to all agents.

The merge is additive — no observations are dropped. Conflicting observations (e.g., one agent says "auth is JWT-based," another says "auth is session-based") are flagged as Phase 1 conflicts and included in the unified log with both positions noted.

### Phase 2 — Question Generation (Blind then Pool)

Each agent generates questions independently without seeing other agents' questions first. This prevents anchoring — agents should not be influenced by what another agent decided to ask.

After all agents have submitted their questions, the MCP opens the question pool. All agents can now see all questions. Each agent may call `react_to_question` to challenge, flag, or endorse questions from other agents.

The MCP deduplicates semantically similar questions (same target file, same pattern type) and presents the Synthesizer — or if not yet designated, the session initiator — with duplicates to resolve. The surviving question set proceeds to Phase 3.

**Question count rule in collaborative mode:** The 5–7 question limit applies to the merged, deduplicated pool — not per agent. Ten agents do not produce 70 questions. The pool is refined down to 5–7 high-quality questions that the full team will investigate.

### Phase 3 — Sub-Question Generation (Parallel)

Each agent generates sub-questions for the full question set. As with Phase 2, agents work independently first, then the sub-question pool is opened for reactions.

Sub-questions from different agents targeting the same main question are merged. Unique sub-questions from one agent that others did not generate are flagged as high-value outliers — they represent something one agent noticed that others missed. Outlier sub-questions are prioritized in Phase 4.

### Phase 4 — Investigation (Parallel, Reactive)

This is the core of the collaborative protocol.

All agents investigate all questions simultaneously. There is no assignment of questions to agents — every agent is responsible for the full question set. The investigation is complete for a given finding only when at least one agent has submitted it and at least one other agent has either confirmed or challenged it.

**Coverage tracking:** The MCP tracks investigation coverage per finding:

| Status | Meaning |
|--------|---------|
| `unexamined` | No agent has submitted a finding for this sub-question |
| `single_agent` | One finding submitted, awaiting reaction from another agent |
| `confirmed` | Two or more agents independently confirmed with separate evidence |
| `contested` | At least one agent challenged the finding |
| `resolved` | Contested finding investigated further, consensus reached |

**The investigation loop for each sub-question:**
1. First agent submits a finding
2. MCP marks it `single_agent` and notifies all other agents
3. Other agents independently investigate and submit their own findings or reactions
4. If a second agent confirms with independent evidence → `confirmed`
5. If any agent challenges with contradicting evidence → `contested`
6. Contested findings are escalated — the challenging agent and the original agent must both follow the escalation path and submit further findings
7. If escalation produces consensus → `resolved`
8. If escalation does not produce consensus → remains `contested` for Synthesizer adjudication

**Checkpoints in collaborative mode:** Each agent calls `checkpoint` per main question after submitting all its findings for that question. The checkpoint is agent-specific — it confirms that agent's work is complete for that question, not that all agents are done.

The session moves to `pending_synthesis` when every agent has checkpointed every main question.

### Pending Synthesis — Human Designates Synthesizer

The MCP notifies all agents that the investigation is complete and the session is in `pending_synthesis`. All agents surface a message to the user:

```
All investigators have completed their work on session cq-8f3a2b.
31 findings submitted. 4 findings contested. 18 confirmed by multiple agents.

To finalize the report, designate a Synthesizer:
  "Use [agent name] to finalize the report for session cq-8f3a2b"

Synthesizer recommendation: gemini-cli
  (highest confirmation rate, fewest unverified findings)
```

The user goes to whichever agent they choose and says "finalize the report." That agent is designated Synthesizer via `designate_synthesizer` and proceeds to Phase 5.

### Phase 5 — Adjudication and Synthesis

The Synthesizer has two distinct jobs before calling `finalize_report`:

**Adjudication:** For each contested finding, the Synthesizer calls `adjudicate_finding` with a ruling of `uphold`, `merge`, or `unresolved`. The Synthesizer reads both sides' evidence and reasons explicitly. It cannot skip a contested finding.

**Synthesis:** The Synthesizer writes the report using the full accumulated finding set — confirmed findings, adjudicated findings, and unresolved findings. It does not re-investigate. It writes with the authority of everything the team collectively produced.

---

## 11. Contradiction Handling

Contradictions between agents come in three types. Each is handled differently.

### 11.1 Evidence Contradiction

Two agents read the same file and line range and reach opposite conclusions.

**Detection:** Automatic. The MCP flags when two findings reference the same `file_path` + `line_start` range with opposite verdicts.

**Resolution path:** The MCP surfaces both evidence sets to all agents. Agents are asked to investigate whether the contradiction is a scope question (one agent has access to a file the other doesn't) or a reading error (one agent misread the code). The deeper evidence chain wins. The Synthesizer rules.

### 11.2 Interpretation Contradiction

Both agents saw the same code but followed different paths — one stopped at the catch block, the other followed the error downstream.

**Detection:** Flagged when two findings reference the same file with different verdict severities and different evidence chains.

**Resolution path:** The fuller evidence chain wins. The agent with the shallower reading is expected to follow the deeper agent's path and update its finding. If the follow-up produces the same deeper conclusion, the finding is confirmed at the deeper severity. If the follow-up reveals the deeper conclusion was wrong, the contested finding is escalated to the Synthesizer.

### 11.3 Genuine Disagreement

Both agents read everything, followed all threads, and still reached different conclusions — because the resolution depends on information outside the repo (infrastructure config, runtime behavior, deployment environment).

**Detection:** Flagged when both agents have deep evidence chains and the contradiction cannot be resolved by reading more code.

**Resolution path:** The Synthesizer rules `unresolved`. The report documents both positions, the evidence for each, and what external information would be needed to settle it. This is a valid and honest output — it tells the team exactly what to investigate manually.

### 11.4 What the Report Says About Contradictions

Every adjudicated or unresolved contradiction appears in the report. Nothing is silently dropped.

```
Finding F-014: Connection pool cleanup on error path
Final verdict: FAIL · critical (Synthesizer: uphold claude-code)

claude-code: No cleanup in error path
  Evidence: src/db/pool.js:847 — catch block exits without releasing connection
  Verdict: FAIL · critical

codex: Cleanup handled by middleware  
  Evidence: src/app/middleware/db.js:34 — connection release on response end
  Verdict: PASS

Synthesizer ruling: Upheld claude-code. Middleware at db.js:34 handles 
  successful requests only — it fires on response end, which is not 
  reached on uncaught exceptions. The error path at pool.js:847 has 
  no guarantee of cleanup. codex's reading of the middleware is correct 
  but does not cover the failure path.

Remediation: Add finally block at pool.js:847. Verify middleware covers 
  all exit paths including unhandled exceptions.
```

---

## 12. Report Structure — Collaborative Extensions

The base report structure is extended with collaborative metadata.

### 12.1 Report Header

```
Audit session: cq-8f3a2b
Synthesizer: cursor
Investigators: claude-code, gemini-cli, codex (3 agents)
Duration: 47 minutes
Total findings: 31
  Multi-agent confirmed: 18    ← highest confidence
  Synthesizer adjudicated: 7   ← ruled on by Synthesizer
  Unresolved contradictions: 2  ← require manual verification
  Single-agent unverified: 4   ← lowest confidence
```

### 12.2 Finding Confidence Block

Every finding in the report carries a confidence block:

```
Finding F-009: Missing transaction on multi-step user creation
Severity: critical
Confidence: very high

Confirmed independently by:
  claude-code  Evidence: src/users/create.js:203
  gemini-cli   Evidence: src/users/create.js:203, src/db/queries.js:88
  codex        Evidence: src/users/create.js:203

Challenged by: none
```

```
Finding F-031: JWT secret rotation never triggered
Severity: critical (if claude-code correct) / info (if gemini-cli correct)
Confidence: medium — UNRESOLVED

claude-code: No rotation job in cron/jobs.js
gemini-cli: Rotation triggered by deployment pipeline (outside repo scope)

Resolution: Cannot verify without CI/CD pipeline access.
Manual check required: verify JWT_ROTATE_ON_DEPLOY flag in deployment config.
```

### 12.3 Unresolved Findings Section

A dedicated section lists all unresolved contradictions:

```
UNRESOLVED FINDINGS — REQUIRE MANUAL VERIFICATION

These findings could not be resolved from code alone. Both positions
are documented. The team must verify externally before treating
either as confirmed.

[Full finding blocks with both positions and external verification steps]
```

### 12.4 Agent Performance Appendix

```
INVESTIGATOR PERFORMANCE

Agent           Findings  Confirmed  Challenged  Upheld  Confirmation Rate
claude-code        12         9           1         1          75%
gemini-cli         11         8           3         2          73%
codex              10         7           2         1          70%
cursor              8         6           1         1          75%

Heat Map Accuracy: 8 of top 10 heat map files produced findings.
Files predicted hot but clean: src/config/env.js (score 82, no findings)
Files missed by heat map: src/utils/crypto.js (score 31, 2 critical findings)
```

---

## 13. Shared Store

### 13.1 Structure

All session state is persisted to a shared store accessible by all agents on the machine. Default location:

```
~/.questionnaire/
  sessions/
    cq-8f3a2b/
      session.json          ← full session state
      heat_map.json         ← heat map data
      observations/
        claude-code.json
        gemini-cli.json
        merged.json
      questions/
        pool.json
        reactions.json
      findings/
        F-001.json
        F-002.json
        ...
      reactions/
        R-001.json
        ...
      adjudications/
        A-001.json
        ...
      report.md             ← written after finalization
  archived/
    cq-7e1a9c/             ← completed sessions
```

### 13.2 Concurrency

Multiple agents write to the shared store simultaneously. The MCP server is the single writer — agents do not write directly to the store. All tool calls go through the MCP server, which serializes writes. Agents are readers of the session state; the server is the sole writer.

This prevents race conditions on contested findings and checkpoint records without requiring distributed locking.

### 13.3 Single-Machine vs. Team Use

For single-machine use (one developer, multiple agent tools), the `~/.questionnaire/` directory is sufficient. No additional infrastructure required.

For team use (multiple developers, shared audit sessions), the store is exposed as a lightweight HTTP server. The MCP server points to the remote store URL instead of the local directory. Authentication is out of scope for v1.

---

## 14. Success Criteria — Extensions

### Heat Map

1. Heat map generates in under 30 seconds on repos up to 500k lines
2. Critical-bucket files produce findings at a rate of ≥60% across audits (measured over time)
3. Every agent joining a session receives the same heat map
4. Heat map alignment is reported in every audit's methodology appendix
5. Phase 2 question generation shows measurable bias toward Critical-bucket files

### Collaborative Protocol

1. Any MCP-compatible agent can join a session via `discover_sessions` without manual session ID passing
2. No contested finding reaches the report without a recorded Synthesizer adjudication
3. No confirmation reaction is accepted without independent evidence
4. The session never moves to `finalized` without explicit human designation of the Synthesizer
5. Unresolved contradictions appear in the report with both positions fully documented
6. Multi-agent confirmed findings have a lower false-positive rate than single-agent findings (measured via post-audit feedback over time)

---

## 15. Out of Scope (These Extensions, v1)

| Feature | Rationale for Deferral |
|---------|------------------------|
| Cross-machine session sharing | Requires auth and a hosted backend. Single-machine shared store is sufficient for v1. |
| Real-time agent notifications | Agents poll for session state changes via tool calls. Push notifications deferred. |
| Heat map weight auto-calibration | Requires accumulated audit history. Calibration is a v2 feature once data exists. |
| Agent timeout enforcement | If an agent goes quiet during investigation, session stalls. Timeout and abandonment logic deferred to v2. |
| More than one active session | One session per MCP instance is a hard constraint in v1 and v2. |
| Synthesizer re-designation mid-adjudication | Once adjudication begins, the Synthesizer is locked. Re-designation before adjudication starts is allowed. |

---

## 16. Build Order

**Build the Heat Map first.** It is self-contained, requires no changes to the collaborative protocol, and ships immediately as a Phase 0.5 addition to the base spec. It also makes the collaborative protocol better — all agents start from shared situational awareness.

**Build the Collaborative Protocol second.** It depends on the shared store architecture, which is the largest new infrastructure component. The session state model, agent identity, reactions store, and convergence engine are the core implementation challenges.

**Sequence within Collaborative Protocol:**
1. Shared store + session persistence
2. `discover_sessions` + `join_session` — multi-agent can now work a session
3. `react_to_finding` + `react_to_question` — the reaction layer
4. `get_session_summary` — visibility into the investigation
5. `designate_synthesizer` + `adjudicate_finding` — the synthesis layer
6. `finalize_report` precondition enforcement — the quality gate
7. Report collaborative extensions — confidence blocks, unresolved section, agent performance appendix

---

*Questionnaire MCP — Extension Specifications · Version 1.0 · April 2026*