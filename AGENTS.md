# Agents

This is the Daleel backend — a NestJS API for a mentorship platform.

Before writing or modifying code, read [CONVENTIONS.md](./CONVENTIONS.md) for coding standards and project patterns.
For domain terminology, refer to [CONTEXT.md](./CONTEXT.md).

---

## Operational Guidelines

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing and ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions or factories for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- When editing existing code: don't "improve" adjacent code, comments, or formatting.
- Match existing style even if you'd prefer another.
- If you notice unrelated dead code or bugs, mention them — don't silently touch them.
- When changes create orphans: clean up imports/variables your changes made unused.
- **Rule:** Every changed line in a diff must trace directly to the request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

- Transform tasks into verifiable goals (e.g., write/run tests, verify `pnpm build` and `pnpm lint`).
- For multi-step tasks, execute in logical steps and verify each.
- Never declare a task complete without running relevant checks.
