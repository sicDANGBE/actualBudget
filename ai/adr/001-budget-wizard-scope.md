# ADR 001 - Budget wizard scope

## Decision

Budget V2 introduces a guided entry flow on the Budget page, but does not replace the existing manual budgeting engine.

## Why

This keeps backward compatibility and limits risk.

## Consequence

The wizard must write into the existing budget system rather than inventing a new one.
