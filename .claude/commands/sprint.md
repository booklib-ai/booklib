# Sprint: Layered Ring Development Workflow

You are running the Layered Ring — a semi-autonomous development workflow with 3 user gates, 4 processing rings, 18 persona validators, and self-correcting loops.

## State tracking

Track these variables throughout the session:
- SPEC: the approved spec from Gate 1
- ARCH: the approved architecture from Gate 2
- INNER_ITERATIONS: 0 (max 3)
- MIDDLE_ITERATIONS: 0 (max 3)
- OUTER_CYCLES: 0 (max 2)
- SPEC_REWRITES: 0 (max 2)
- ESCALATIONS: []

---

## GATE 1: Spec

If $ARGUMENTS contains a feature description, use it. Otherwise ask: "What are we building?"

Produce a spec card:

```
GOAL: [one sentence]
DELIVERS: [3-5 bullets]
NOT DOING: [2-3 bullets]
ASSUMPTIONS: [any assumptions that could be wrong]
```

Ask: **"Go? (y / adjust something)"**
Wait for user response. Do NOT proceed without approval.

---

## GATE 2: Architecture

Plan the implementation autonomously. Analyze the codebase to understand existing patterns. Then present:

```
APPROACH: [1-2 sentences]
KEY FILES: [files that will be created or modified]
DEPENDENCIES: [new deps if any]
RISK: [highest-risk aspect]
```

Ask: **"Go? (y / change something)"**
Wait for user response. Do NOT proceed without approval.

---

## AUTONOMOUS EXECUTION

After Gate 2 approval, execute the full ring pipeline without asking the user anything. Make reasonable decisions. Only stop if fundamentally blocked.

### Ring 1: Inner Ring (Build)

Read `.claude/agents/rings/inner-ring.md` and follow its process:
1. Dispatch Coder + Test Writer as a single worktree agent
2. Dispatch Test Reviewer when code is ready
3. Run fix loop (max 3 iterations)
4. On exhaustion: activate Requirement Validator
5. On spec rewrite: restart (max 2 rewrites)
6. On unresolvable failure: add to ESCALATIONS

### Ring 2: Middle Ring (Harden)

Read `.claude/agents/rings/middle-ring.md` and follow its process:
1. Dispatch Code Reviewer, Security Agent, Arch Validator IN PARALLEL
2. Consolidate findings
3. Coder fixes (max 3 iterations)
4. If fix changes behavior → re-run Inner Ring tests
5. On unresolvable findings: add to ESCALATIONS

### Ring 3: Outer Ring (Validate)

Read `.claude/agents/rings/outer-ring.md` and follow its process:
1. Detect waves from diff
2. Dispatch triggered personas IN PARALLEL
   - Read each persona's prompt from `.claude/agents/personas/[name].md`
   - Include relevant checklist from `.claude/agents/checklists/[name].md`
3. Run Arbiter synthesis (read `.claude/agents/personas/arbiter.md`)
4. Route findings: code-fix → Middle Ring, spec-issue → Requirement Validator
5. Re-validate after fixes (max 2 cycles)
6. On remaining issues: add to ESCALATIONS

### Ring 4: Polish

Read `.claude/agents/rings/polish.md` and follow its process:
1. Dispatch Docs, Changelog, Comment Reviewer IN PARALLEL
2. Collect outputs for Gate 3

---

## GATE 3: Ship

Present the result card:

```
COMPLETED:
- [task]: [one-line what changed]

TESTS: [pass/fail summary]
FILES CHANGED: [count]

PERSONA FINDINGS (resolved):
- [persona]: [what they found] → [how it was resolved]

LUNA vs REX:
- [topic]: Luna said [X], Rex said [Y] → Verdict: [Z]

SPEC CHANGES (if any):
- [what changed mid-flight and why]

DECISIONS MADE:
- [any non-obvious choice and reasoning]

ESCALATIONS (if any):
- [unresolved items that need your attention]

RING STATS:
- Inner: [iterations]/3, Spec rewrites: [n]/2
- Middle: [iterations]/3
- Outer: [cycles]/2, Waves: [list], Personas: [count]
- Polish: done
```

Ask: **"Ship? (y / redo X / adjust Y)"**

If ship: commit all changes with a descriptive message.
If redo/adjust: fix autonomously and present Gate 3 again.

---

## ESCALATION RULES

| Situation | Max | Action |
|-----------|-----|--------|
| Test won't pass | 3 fixes | Requirement Validator |
| Spec rewrite needed | 2 total | Ask user before 3rd |
| Review won't resolve | 3 fixes | Show findings, user decides |
| Persona cycle | 2 cycles | Show remaining, user decides |
| Fundamentally stuck | immediate | Ask user with diagnosis |

## RULES
- Between gates: fully autonomous. No questions.
- Prefer simple over clever.
- If two interpretations exist, pick the simpler one.
- Every agent dispatch includes relevant skills from BookLib.
- Use `skill-router` to auto-detect language for language-specific skills.
