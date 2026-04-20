# Risk register

## Key risks

1. Rebuilding budget logic instead of extending it
2. Creating a wizard disconnected from existing budget state
3. Mixing categorization validation with reconciliation too early
4. Over-automating without transparency
5. UI drift away from Actual
6. Large patches touching too many unrelated files

## Mitigations

- Work in small slices
- Always locate the existing flow first
- Separate category suggestion from final validation
- Keep user confirmation where confidence is not strong
- Reuse existing components and strings
