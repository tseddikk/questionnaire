# Critical Questionnaire MCP Server

A Model Context Protocol (MCP) server that orchestrates forensic-depth codebase audits.

## Overview

The Critical Questionnaire MCP is a **procedural constraint engine**, not an oracle. It enforces how an AI agent thinks, what kinds of questions it asks, and how deeply it investigates. All analytical intelligence resides in the agent. The server ensures that intelligence is applied with the rigor of a paranoid senior engineer.

## Key Features

- **6-Phase Audit Protocol**: Structured discovery, questioning, investigation, and synthesis
- **Structural Validation**: Fast, deterministic validation of questions and findings
- **Escalation Enforcement**: FAIL/SUSPICIOUS verdicts must trigger deeper investigation
- **Evidence Discipline**: Every claim requires exact file paths and line numbers
- **Cross-Cutting Analysis**: Detects patterns across multiple investigation areas

## Installation

```bash
npm install
npm run build
```

## Usage

### Running the Server

```bash
npm start
```

Or with stdio transport:

```bash
node dist/index.js
```

### Integration with Claude Code

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "questionnaire": {
      "command": "node",
      "args": ["/path/to/questionnaire/dist/index.js"]
    }
  }
}
```

## The 6-Phase Protocol

### Phase 0: Initialize
- `initialize_audit(repo_path, domain, depth)`
- Creates session, returns instructions

### Phase 1: Deep Discovery
- `submit_observations(session_id, observations)`
- Pure observation, no judgments
- Every observation requires file citation

### Phase 2: Generate Main Questions
- `submit_question(session_id, question)` (5-7 times)
- Each question validated for:
  - Non-binary (probes failure modes, not presence)
  - Specific target files
  - Suspicion rationale
  - Edge case targeting

### Phase 3: Generate Sub-Questions
- `submit_sub_questions(session_id, main_question_id, sub_questions)`
- Decompose into answerable units
- 3-6 sub-questions per main question (varies by depth)
- Each needs escalation path

### Phase 4: Investigation
- `submit_finding(session_id, sub_question_id, finding)` (per sub-question)
- `checkpoint(session_id, main_question_id)` (per main question)
- File-level precision required
- FAIL/SUSPICIOUS requires escalation finding

### Phase 5: Synthesize Report
- `finalize_report(session_id)`
- Returns accumulated findings and cross-cutting concerns
- Agent writes final report independently

## Audit Domains

- **security**: Attack surface, trust boundaries, validation depth
- **performance**: Blocking operations, memory leaks, N+1 queries
- **architecture**: Layering violations, coupling, hidden dependencies
- **data_integrity**: Transactions, partial writes, orphaned records
- **observability**: Silent failures, missing metrics, alerting gaps
- **compliance**: PII exposure, encryption, access control

## Audit Depths

| Depth | Main Questions | Sub-Qs/Main | Escalation Paths |
|-------|---------------|-------------|------------------|
| standard | 5-7 | 3-4 | ≥1 per sub-Q |
| deep | 5-7 | 4-5 | ≥2 per sub-Q |
| forensic | 5-7 | 5-6 | ALL sub-Qs |

## Question Patterns

Each main question must use one of these patterns:

- **ASYNC_FAILURE**: "What happens when async operations fail mid-flight?"
- **ACCIDENTAL_COUPLING**: "Why does this module know about unrelated concerns?"
- **VALIDATION_BYPASS**: "Where is input validated, and what if bypassed?"
- **IMPLICIT_MUTATION**: "What state does this function mutate?"
- **DEPENDENCY_COMPROMISE**: "If a dependency is compromised, what does it access?"
- **DATA_LEAKAGE**: "Where is sensitive data logged or leaked?"
- **INVARIANT_MISSING**: "What invariant should hold, and where is it enforced?"

## Development

```bash
# Run in development mode
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Testing
npm test
```

## Project Structure

```
src/
├── types/           # Domain models and Zod schemas
├── state/           # Session store and errors
├── validation/      # Question and finding validators
├── tools/           # MCP tool implementations (7 tools)
├── protocol/        # Instructions and prompts
├── server.ts        # MCP server setup
└── index.ts         # Entry point
```

## License

MIT
