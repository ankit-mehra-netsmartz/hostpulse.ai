# Copilot Instructions

## Mandatory Change Verification
- After every code-change iteration, run the `change-cross-verification` workflow before finalizing.
- Treat this as required for each meaningful edit cycle (code, API route, schema, query, integration, or UI behavior).
- Do not declare completion unless verification confirms:
  - Requested behavior is implemented.
  - No high-severity regressions were introduced.
  - Residual risks and missing evidence are explicitly listed.

## Reporting Format
- Provide findings first, ordered by severity.
- Then provide acceptance-criteria coverage and final status:
  - Pass
  - Pass With Risks
  - Fail
  - Cannot Verify
