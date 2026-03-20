---
name: change-cross-verification
description: 'Cross-verify that requested changes are fully done and did not break other functionality. Use for final validation after code edits, bug fixes, refactors, API changes, and UI behavior updates. Includes requirement traceability, impacted-scope checks, regression checks, and sign-off reporting.'
argument-hint: 'What changed, what must be true, and what must not break?'
user-invocable: true
---

# Change Cross Verification

## What This Skill Produces
- A requirement-to-proof checklist showing whether each user request is complete.
- A regression check over directly and indirectly impacted areas.
- A concise pass/fail sign-off with residual risks and missing evidence.

## When To Use
- After implementing any requested code change.
- Before claiming a fix is complete.
- When the user asks for verification, QA, review, or no-regression confirmation.

## Always-Run Policy
- Run this verification after every implementation iteration that changes code, config, routes, queries, or data behavior.
- Do not mark work complete until this skill's checks are executed and reported.
- If execution evidence is missing, return `Cannot Verify` and list the missing signals.

## Inputs To Collect First
1. User ask: exact expected behavior and constraints.
2. Changed scope: files, routes, services, UI screens, background jobs.
3. Risk scope: auth, data writes, integrations, migrations, caching, error handling.

## Procedure
1. Restate acceptance criteria
- Convert the user ask into explicit checks.
- Include both positive outcomes and negative guardrails.

2. Build traceability map
- Map each acceptance criterion to concrete code locations and runtime checks.
- Mark each criterion as: Implemented, Partially Implemented, or Missing.

3. Verify direct behavior
- Execute the main happy path end to end.
- Confirm expected API responses, DB writes, UI states, and logs.

4. Verify no-regression surface
- Test nearby flows likely to break from the same edits.
- Cover at least:
  - Existing endpoints touched by shared services
  - Existing UI flows using modified query keys or mutations
  - Error paths and retry/fallback behavior
  - Idempotency and duplicate-creation protections

5. Validate persistence and data correctness
- Confirm only intended records are created/updated.
- Confirm fields map correctly and old data is not silently corrupted.
- Confirm status flags transition only when intended.

6. Validate operational safety
- Check logs for hidden failures after success responses.
- Confirm background tasks do not mask critical failures.
- Confirm webhook-triggered logic behaves correctly when webhook is delayed, duplicated, or absent.

7. Report with strict outcome format
- Findings first, ordered by severity.
- For each finding include:
  - What is wrong
  - Where it is observed
  - How to reproduce
  - User impact
  - Fix recommendation
- If no findings: explicitly state no blocking findings and list residual risks.

## Decision Branches
- If evidence is incomplete: report Cannot Verify and request exact missing signal (test, log, endpoint output, DB query result).
- If behavior is correct but risk remains: mark Pass With Risks.
- If any acceptance criterion fails: mark Fail and stop claiming completion.

## Completion Criteria
- Every acceptance criterion has explicit evidence.
- No high-severity regression findings remain.
- Remaining medium/low risks are documented with clear next actions.
- Final status is one of: Pass, Pass With Risks, Fail, or Cannot Verify.

## Output Template
1. Final Status: Pass | Pass With Risks | Fail | Cannot Verify
2. Acceptance Criteria Coverage
- Criterion: <text>
- Evidence: <test/log/endpoint/file>
- Result: Implemented | Partial | Missing
3. Regression Findings
- Severity: High | Medium | Low
- Finding: <text>
- Impact: <text>
- Recommended Fix: <text>
4. Residual Risks
- <risk 1>
- <risk 2>
5. Next Actions
- <action 1>
- <action 2>

## Example Prompts
- /change-cross-verification Verify this Airbnb connect fix is complete and did not break Hospitable sync.
- /change-cross-verification Cross-check my webhook changes against property import behavior and DB writes.
- /change-cross-verification Validate that the bug is fixed and list only regression risks.
