# Questionnaire MCP Server

A Model Context Protocol (MCP) server that orchestrates forensic-depth codebase audits through a structured 6-phase protocol.

## Overview

The Questionnaire MCP is a **procedural constraint engine** that enforces how AI agents conduct codebase audits. It ensures investigations follow the rigor of a "paranoid senior engineer" through structured phases, validation rules, and evidence requirements. All analytical intelligence resides in the agent; the server ensures that intelligence is applied with discipline and consistency.

## Key Features

### Core Protocol

- **6-Phase Audit Protocol**: Structured discovery, questioning, investigation, and synthesis
- **Structural Validation**: Fast, deterministic validation of questions and findings (no LLM-based judgment)
- **Escalation Enforcement**: FAIL/SUSPICIOUS verdicts must include deeper investigation findings
- **Evidence Discipline**: Every claim requires exact file paths, line numbers, and code snippets
- **Cross-Cutting Analysis**: Detects patterns across multiple investigation areas

### Extensions

- **Heat Map Analysis**: Automatic churn, coupling, and coverage analysis to guide re-inspection
- **Collaborative Multi-Agent Protocol**: Support for multiple investigators with Synthesizer adjudication
- **Comprehensive Error Response Contract**: Every failure returns structured, actionable error responses

## Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd questionnaire
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## Usage

### Running the Server

**Stdio Transport (for MCP clients):**
```bash
npm start
# or
node dist/index.js
```

**Integration with Claude Code:**

Add to your Claude Code configuration (`.opencode/opencode.jsonc`):

```json
{
  "mcpServers": {
    "questionnaire": {
      "command": "node",
      "args": ["/absolute/path/to/questionnaire/dist/index.js"]
    }
  }
}
```

**Integration with other MCP clients:**

Configure the server with stdio transport pointing to `dist/index.js`.

## The 6-Phase Protocol

### Phase 0: Initialize
**Tool:** `initialize_audit(repo_path, domain, depth)`

Creates a new audit session and returns domain-specific instructions. Automatically generates a heat map of high-churn, high-coupling, and low-coverage areas to guide Phase 1 discovery.

**Parameters:**
- `repo_path`: Absolute path to repository
- `domain`: One of `security`, `performance`, `architecture`, `data_integrity`, `observability`, `compliance`
- `depth`: One of `standard`, `deep`, `forensic`

### Phase 1: Deep Discovery
**Tool:** `submit_observations(session_id, observations)`

Accepts the agent's raw observation log from codebase exploration. Every observation must cite specific files observed. No judgments, only structured observation.

**Observation Categories:**
- `purpose`: What the codebase does
- `tech_stack`: Frameworks, libraries, versions
- `entry_points`: API endpoints, UI components, CLI commands
- `data_flows`: Input sources, transformations, destinations
- `auth_mechanisms`: Authentication and authorization patterns
- `error_patterns`: Error handling strategies
- `test_coverage`: Test presence and quality indicators
- `config_secrets`: Configuration and secret management
- `deployment`: Deployment and infrastructure details

### Phase 2: Generate Main Questions
**Tool:** `submit_question(session_id, question)` (5-7 questions)

Each main question is validated for:
- **Non-binary**: Must probe failure modes, not just presence
- **Specific targets**: Cites files observed in Phase 1
- **Suspicion rationale**: Explains WHY this area is suspected
- **Edge case targeting**: Names specific failure scenarios
- **Required pattern**: Uses one of 7 domain-specific patterns

**Question Patterns:**
- `ASYNC_FAILURE`: Cleanup, rollback, partial state
- `ACCIDENTAL_COUPLING`: Layering violations, hidden dependencies
- `VALIDATION_BYPASS`: Trust boundaries, defense in depth
- `IMPLICIT_MUTATION`: Shared mutable state, race conditions
- `DEPENDENCY_COMPROMISE`: Supply chain risk, blast radius
- `DATA_LEAKAGE`: PII exposure, secret sprawl
- `INVARIANT_MISSING`: Implicit contracts, missing guards

### Phase 3: Generate Sub-Questions
**Tool:** `submit_sub_questions(session_id, main_question_id, sub_questions)`

Decomposes each main question into 3-6 sub-questions (varies by depth). Each sub-question includes:
- `text`: Specific, answerable question
- `target_files`: 1-3 specific files to read
- `pass_criteria`: What constitutes a PASS verdict
- `fail_criteria`: What constitutes a FAIL verdict
- `evidence_pattern`: What to look for in code
- `escalation_question`: Follow-up if FAIL/SUSPICIOUS

### Phase 4: Investigation
**Tools:**
- `submit_finding(session_id, sub_question_id, finding)` (per sub-question)
- `checkpoint(session_id, main_question_id)` (per main question)

**Finding Requirements:**
- File-level precision: exact path, line numbers, code snippet
- Verdict: `PASS`, `FAIL`, `SUSPICIOUS`, or `UNCERTAIN`
- Severity: `info`, `warning`, `critical`, `catastrophic`
- Evidence: Must cite specific code locations
- Escalation: FAIL/SUSPICIOUS requires escalation_finding

**Checkpoint:** Called after all sub-questions for a main question have findings. Triggers cross-cutting signal analysis.

### Phase 5: Synthesize Report
**Tool:** `finalize_report(session_id)`

Validates all preconditions and returns accumulated findings. The agent writes the final report independently based on:
- All findings across all sub-questions
- Cross-cutting concerns detected at checkpoints
- Escalation findings from deep investigations
- Heat map alignment analysis

## Audit Domains and Depths

### Domains

| Domain | Focus Areas | Primary Patterns |
|--------|-------------|------------------|
| security | Attack surface, trust boundaries, validation | VALIDATION_BYPASS, DATA_LEAKAGE, DEPENDENCY_COMPROMISE |
| performance | Blocking, memory leaks, N+1 queries | ASYNC_FAILURE, IMPLICIT_MUTATION |
| architecture | Layering violations, coupling, dependencies | ACCIDENTAL_COUPLING, IMPLICIT_MUTATION |
| data_integrity | Transactions, partial writes, orphans | ASYNC_FAILURE, INVARIANT_MISSING |
| observability | Silent failures, missing metrics | INVARIANT_MISSING |
| compliance | PII exposure, encryption, access | DATA_LEAKAGE, VALIDATION_BYPASS |

### Depths

| Depth | Main Qs | Sub-Qs/Main | Escalation Paths | Use Case |
|-------|---------|-------------|------------------|----------|
| standard | 5-7 | 3-4 | >=1 per sub-Q | Quick assessment |
| deep | 5-7 | 4-5 | >=2 per sub-Q | Thorough review |
| forensic | 5-7 | 5-6 | ALL sub-Qs | Incident investigation |

## Heat Map Extension

The Heat Map automatically analyzes the codebase before Phase 1 to guide discovery:

### Analysis Dimensions

- **Churn**: Files changed frequently in recent git history (weighted by recency)
- **Coupling**: Files with high import/dependency connections
- **Coverage**: Files with low or missing test coverage

### Heat Map Buckets

Files are classified into buckets to prioritize investigation:
- **Hot**: High churn + high coupling (risky, frequently modified)
- **Cold**: High coverage + low churn (stable, well-tested)
- **Risky**: High churn + low coverage (dangerous change zones)
- **Complex**: High coupling + high coverage (stable but complex)

### Heat Map Integration

The heat map is automatically injected into Phase 1 instructions, highlighting:
- Top 10 files by churn
- Top 10 files by coupling (architectural hotspots)
- Top 10 files with coverage gaps
- High-risk files appearing in multiple categories

## Collaborative Multi-Agent Protocol

Supports multiple AI agents investigating the same codebase simultaneously.

### Roles

- **Investigator**: Default role, submits questions and findings
- **Synthesizer**: Designated agent with authority to finalize reports and adjudicate contested findings

### Workflow

1. **Session Creation**: One agent calls `initialize_audit`
2. **Discovery**: All agents call `join_session` and submit observations collaboratively
3. **Investigation**: Agents work in parallel on different questions
4. **Cross-Validation**: Agents call `react_to_finding` to confirm, challenge, or extend findings
5. **Adjudication**: Synthesizer calls `adjudicate_finding` on contested findings
6. **Finalization**: Synthesizer calls `finalize_report` when complete

### Reaction Types

- **confirm**: Agree with finding (requires independent evidence)
- **challenge**: Disagree with finding (requires contradictory evidence)
- **extend**: Add supporting evidence to existing finding

## Error Response Contract

Every tool failure returns a structured error response that answers:

1. **What went wrong?** - Machine-readable error code
2. **Why did it go wrong?** - Specific context for this call
3. **What was wrong with the submission?** - Field-level precision with submitted values
4. **What do I do next?** - Concrete, actionable recovery instruction

### Error Response Format

**Single Failure:**
```json
{
  "status": "error",
  "code": "BINARY_QUESTION",
  "phase": 2,
  "tool": "submit_question",
  "message": "Question is answerable yes/no.",
  "detail": {
    "field": "text",
    "submitted_value": "Is authentication implemented?",
    "expected": "Question probing failure modes, not presence"
  },
  "action": "Rewrite using VALIDATION_BYPASS pattern: 'Where is [user input] validated, and what happens if validation is bypassed at a lower layer?'"
}
```

**Multiple Failures:**
```json
{
  "status": "error",
  "code": "MULTIPLE_VALIDATION_FAILURES",
  "phase": 2,
  "tool": "submit_question",
  "message": "Question validation failed with 2 issue(s).",
  "failures": [
    {
      "code": "BINARY_QUESTION",
      "field": "text",
      "submitted_value": "Is authentication implemented?",
      "expected": "Question probing failure modes",
      "action": "Rewrite using VALIDATION_BYPASS pattern..."
    },
    {
      "code": "MISSING_TARGET_FILES",
      "field": "target_files",
      "submitted_value": [],
      "expected": "At least one specific file path",
      "action": "Add file paths from Phase 1 observations"
    }
  ],
  "action": "Fix all failures listed above and resubmit. Do not resubmit until all are resolved."
}
```

### Phase Violation Special Format

Phase violations include session state context:
```json
{
  "status": "error",
  "code": "PHASE_VIOLATION",
  "phase": 3,
  "tool": "submit_finding",
  "message": "submit_finding cannot be called during Phase 3.",
  "detail": { "current_phase": 3, "required_phase": 4 },
  "session_state": {
    "current_phase": 3,
    "current_phase_name": "Generate Sub-Questions",
    "main_questions_accepted": 6,
    "sub_question_sets_submitted": 2,
    "sub_question_sets_remaining": 4,
    "next_required_tool": "submit_sub_questions",
    "next_required_action": "Submit sub-questions for main questions Q-003 through Q-006."
  },
  "action": "Call submit_sub_questions for the 4 remaining main questions."
}
```

## Complete Tool Reference

### Core Protocol Tools

1. **initialize_audit** - Create new session with heat map generation
2. **submit_observations** - Submit Phase 1 observation log
3. **submit_question** - Submit main questions (Phase 2)
4. **submit_sub_questions** - Submit sub-questions for a main question (Phase 3)
5. **submit_finding** - Submit finding for a sub-question (Phase 4)
6. **checkpoint** - Checkpoint a main question after all findings (Phase 4)
7. **finalize_report** - Generate final report (Phase 5)

### Heat Map Tools

8. **get_heat_map** - Retrieve current session heat map

### Collaborative Protocol Tools

9. **discover_sessions** - Find active sessions for a repo
10. **join_session** - Join an existing session as an investigator
11. **react_to_finding** - React to another agent's finding
12. **react_to_question** - Challenge or endorse a question
13. **get_session_summary** - Get current session state and progress
14. **designate_synthesizer** - Designate the Synthesizer agent
15. **adjudicate_finding** - Rule on contested findings (Synthesizer only)
16. **archive_session** - Archive an incomplete session

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Run tests
npm test

# Run specific test file
npx vitest run tests/question-validator.test.ts

# Watch mode
npx vitest --watch
```

## Project Structure

```
src/
├── types/              # Domain models and Zod schemas
│   ├── domain.ts       # Core type definitions
│   └── schemas.ts      # Zod validation schemas
├── state/              # Session management
│   ├── session-store.ts       # Base session storage
│   ├── collaborative-store.ts # Multi-agent extensions
│   └── errors.ts       # Error classes and response formatting
├── validation/         # Validation logic
│   ├── question-validator.ts  # Main/sub-question validation
│   ├── finding-validator.ts   # Finding validation
│   └── observation-validator.ts # Observation validation
├── tools/              # MCP tool implementations
│   ├── initialize-audit.ts
│   ├── submit-observations.ts
│   ├── submit-question.ts
│   ├── submit-sub-questions.ts
│   ├── submit-finding.ts
│   ├── checkpoint.ts
│   ├── finalize-report.ts
│   ├── get-heat-map.ts
│   ├── discover-sessions.ts
│   ├── join-session.ts
│   ├── react-to-finding.ts
│   ├── react-to-question.ts
│   ├── get-session-summary.ts
│   ├── designate-synthesizer.ts
│   ├── adjudicate-finding.ts
│   └── archive-session.ts
├── heat-map/           # Heat map analysis
│   ├── churn-analyzer.ts
│   ├── coupling-analyzer.ts
│   ├── coverage-analyzer.ts
│   └── heat-map-generator.ts
├── protocol/           # Instructions and prompts
│   ├── instructions.ts # Domain/depth-specific instructions
│   └── prompts.ts      # Phase transition prompts
├── server.ts           # MCP server setup
└── index.ts            # Entry point

tests/                  # Test suite
├── question-validator.test.ts
├── finding-validator.test.ts
├── observation-validator.test.ts
├── session-store.test.ts
└── tools.test.ts
```

## Philosophy

### Structural Validation Over Semantic Judgment

The server validates question shape and finding structure, not quality. This is fast, deterministic, and unjammable. Question quality emerges from the protocol constraints, not from LLM-based evaluation.

### Escalation Enforcement

FAIL or SUSPICIOUS verdicts MUST include `escalation_finding`. The server rejects submissions without it. This ensures deep investigation of actual problems.

### Evidence Discipline

Every finding must cite:
- `file_path`: Exact file location
- `line_start`, `line_end`: Line numbers
- `snippet`: Code excerpt

Or explicitly mark `evidence_found: false` with explanation.

### Cross-Cutting Analysis

Patterns that appear across multiple findings are elevated to cross-cutting concerns:
- Missing cleanup patterns
- Error handling gaps
- Unvalidated input
- Resource leaks
- Silent failures

## License

MIT
