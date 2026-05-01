# AGENTS.md - Questionnaire MCP

## Project Overview

This is a Model Context Protocol (MCP) server that orchestrates forensic-depth codebase audits through a structured 6-phase protocol.

**Purpose**: Force AI agents to operate at "paranoid senior engineer" depth.
**Philosophy**: Structural validation over semantic judgment; evidence discipline; escalation obligation.

## Quick Start

```bash
npm install
npm run build
npm test
npm start
```

## Architecture

```
src/
├── types/           # Domain models and Zod schemas
├── state/           # Session store and error handling
├── validation/      # Question, finding, observation validators
├── tools/           # 7 MCP tool implementations
├── protocol/        # Instructions and prompts
├── server.ts        # MCP server setup
└── index.ts         # Entry point
```

Each file is under 500 lines and follows single-responsibility principle.

## The 6-Phase Protocol

1. **Phase 0**: Initialize (`initialize_audit`) - Creates session, returns instructions
2. **Phase 1**: Deep Discovery (`submit_observations`) - Pure observation, file citations required
3. **Phase 2**: Generate Main Questions (`submit_question`) - 5-7 validated questions
4. **Phase 3**: Generate Sub-Questions (`submit_sub_questions`) - Decomposition
5. **Phase 4**: Investigation (`submit_finding`, `checkpoint`) - File-level precision
6. **Phase 5**: Synthesize Report (`finalize_report`) - Cross-cutting analysis

## Key Design Decisions

### Structural Validation (Not LLM-Based)

The server validates question shape, not quality:
- Required fields present: `target_files`, `suspicion_rationale`, `edge_case_targeted`
- Forbidden patterns: binary questions, happy-path only, coverage checks
- Pattern matching: ASYNC_FAILURE, VALIDATION_BYPASS, etc.

Why? Fast, deterministic, unjammable.

### Escalation Enforcement

FAIL or SUSPICIOUS verdicts MUST include `escalation_finding`.
The server rejects submissions without it.

### Evidence Discipline

Every finding must cite:
- `file_path`: Exact file location
- `line_start`, `line_end`: Line numbers
- `snippet`: Code excerpt

Or explicitly mark `evidence_found: false`.

## Question Patterns

Each main question must use one of these patterns:

| Pattern | Purpose |
|---------|---------|
| ASYNC_FAILURE | Cleanup, rollback, partial state |
| ACCIDENTAL_COUPLING | Layering violations, hidden dependencies |
| VALIDATION_BYPASS | Trust boundaries, defense in depth |
| IMPLICIT_MUTATION | Shared mutable state, race conditions |
| DEPENDENCY_COMPROMISE | Supply chain risk, blast radius |
| DATA_LEAKAGE | PII exposure, secret sprawl |
| INVARIANT_MISSING | Implicit contracts, missing guards |

## Domain-Specific Patterns

- **security**: VALIDATION_BYPASS, DATA_LEAKAGE, DEPENDENCY_COMPROMISE
- **performance**: ASYNC_FAILURE, IMPLICIT_MUTATION
- **architecture**: ACCIDENTAL_COUPLING, IMPLICIT_MUTATION
- **data_integrity**: ASYNC_FAILURE, INVARIANT_MISSING
- **observability**: INVARIANT_MISSING
- **compliance**: DATA_LEAKAGE, VALIDATION_BYPASS

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/question-validator.test.ts

# Watch mode
npx vitest --watch
```

49 tests covering:
- Question validation (binary, subjective, happy-path)
- Finding validation (escalation, evidence)
- Observation validation (file citations)
- Tool integration (phase enforcement)
- Session management (state transitions)

## Error Handling

Custom error classes in `src/state/errors.ts`:
- `AuditError`: Base class with code and details
- `SessionNotFoundError`: Invalid session ID
- `PhaseViolationError`: Tool called out of phase order
- `QuestionRejectedError`: Main question validation failure
- `FindingRejectedError`: Finding validation failure
- `EscalationRequiredError`: FAIL/SUSPICIOUS without escalation
- `CheckpointIncompleteError`: Missing sub-question findings

## Session State

In-memory storage (`SessionStore` in `src/state/session-store.ts`):
- Sessions lost on server restart (v1 design)
- Tracks phase, questions, findings, checkpoints
- Validates phase transitions
- Provides cross-cutting signal aggregation

## Extending

### Adding a New Validation Rule

1. Add check in `src/validation/question-validator.ts` or `finding-validator.ts`
2. Add corresponding rejection reason in `src/types/domain.ts`
3. Add test in appropriate test file
4. Run tests: `npm test`

### Adding a New Question Pattern

1. Add pattern to `QuestionPattern` type in `src/types/domain.ts`
2. Add validation regex in `validateRequiredPattern` function
3. Update `DOMAIN_PATTERNS` mapping
4. Update instructions in `src/protocol/instructions.ts`

## Common Issues

**Test fails with pattern mismatch**: Check that question text matches the pattern regex.

**Phase violation errors**: Ensure tools are called in correct phase order.

**Type errors**: Run `npm run typecheck` for full diagnostics.

## References

- SPEC.md: Full specification document
- README.md: User-facing documentation
- https://spec.modelcontextprotocol.io/: MCP protocol spec
