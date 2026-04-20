You are implementing the first confidence model for transaction categorization.

## Goal

Assign a confidence score to category suggestions for imported transactions.

## V1 rules

Use deterministic signals such as:

- exact payee match
- normalized payee match
- historical category usage for this payee
- recurring amount patterns
- user-defined rules if they already exist

## Confidence policy

- > = 0.90: high confidence
- 0.65 to 0.89: medium confidence
- < 0.65: low confidence

## Requirements

- Do not implement heavy ML
- Keep the logic explainable
- Reuse existing data structures and category references

## Output format

1. Existing categorization signals available in the codebase
2. Implementation plan
3. Modified files
4. Patch
5. Tests
6. Notes / risks
