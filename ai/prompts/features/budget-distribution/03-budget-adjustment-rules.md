You are implementing budget adjustment rules for Budget V2.

## Goal

Apply simple rule-based adjustments to proposed budgets so that the result is usable and not purely historical.

## Possible adjustments

- clamp obvious outliers
- separate recurring essentials from discretionary spending
- preserve explicit savings intent from the questionnaire

## Constraints

- Keep rules simple and inspectable
- Do not create a large rules engine in V1

## Output format

1. Existing calculation helpers
2. Adjustment rule integration point
3. Implementation plan
4. Patch
5. Tests
6. Notes / risks
