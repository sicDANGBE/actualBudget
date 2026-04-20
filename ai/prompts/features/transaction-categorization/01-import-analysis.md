You are implementing the import analysis step for assisted transaction categorization.

## Goal

When transactions are imported, inspect the existing import review flow and identify where automatic category suggestions can be inserted.

## Requirements

- Reuse current import parsing and review pipeline
- Do not bypass user review
- Keep the patch minimal

## Output format

1. Where import review is implemented
2. Where category suggestions can be attached
3. Implementation plan
4. Patch
5. Tests
6. Notes / risks
