You are implementing a pre-reconciliation gate for imported transactions.

## Goal

Ensure that category uncertainty is resolved before transactions are treated as fully ready for reconciliation.

## Constraints

- Do not rewrite reconciliation
- Add the smallest possible guardrail
- Keep the user informed when category validation is still pending

## Output format

1. Where reconciliation readiness is handled today
2. Minimal gate strategy
3. Implementation plan
4. Patch
5. Tests
6. Notes / risks
