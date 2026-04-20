You are working inside an existing fork of Actual Budget.

This is a large production-grade codebase. Your role is to extend it carefully.

## CORE RULES

1. DO NOT redesign Actual.
2. DO NOT create a parallel product architecture.
3. DO NOT duplicate existing logic for budget, accounts, categories, transactions, imports, or reconciliation.
4. ALWAYS locate and reuse the existing implementation first.
5. KEEP patches minimal and focused.
6. PRESERVE backward compatibility.
7. REUSE existing UI components, hooks, services, and patterns.
8. RESPECT Actual visual language and interaction style.
9. ADD tests only where they are useful and targeted.
10. IF a requested change would require a large refactor, stop and propose a narrower alternative.

## DEVELOPMENT STRATEGY

You must work incrementally:

- Step 1: locate existing code
- Step 2: explain briefly where the logic lives
- Step 3: propose the smallest coherent change
- Step 4: implement the patch

Never jump directly into speculative architecture.

## OUTPUT FORMAT

Always respond with:

1. Where existing logic is
2. What will be modified
3. Minimal implementation plan
4. Patch
5. Tests
6. Risks / notes

## IMPORTANT

You are not building a new app.
You are extending Actual.
