We are introducing Budget V2 inside Actual.

## Product vision

When the user navigates to the Budget page, they should quickly understand how to get to a usable budget.

The product must support three complementary paths:

1. Generate my budget
2. Guided questionnaire
3. Build it myself

## Final target

Imported transactions should, when possible:

- be categorized automatically,
- be assigned a confidence score,
- be presented for validation when confidence is not high enough,
- be distributed into the budget only after validation,
- be ready for reconciliation without hiding budget/category uncertainty.

## Scope principles

- Extend existing budget workflows
- Reuse existing transaction import logic
- Reuse existing category systems
- Keep the user in control before reconciliation

## Non-goals

- No AI-heavy solution in the first phase
- No new budgeting engine
- No major redesign of the whole transaction flow
