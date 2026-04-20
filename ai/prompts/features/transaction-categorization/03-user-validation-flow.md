You are implementing the user validation flow for category suggestions.

## Goal

Require different levels of user validation depending on confidence.

## Rules

- High confidence: preselected suggestion, lightweight review
- Medium confidence: visible suggestion, easy change required before final validation
- Low confidence: explicit user choice required

## Constraints

- Keep the review UI native to Actual
- Do not slow down the high-confidence path too much
- Do not auto-hide uncertainty

## Output format

1. Where user review currently happens
2. Validation policy integration point
3. Implementation plan
4. Patch
5. Tests
6. Notes / risks
