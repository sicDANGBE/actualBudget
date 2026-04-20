# ADR 003 - No parallel budget engine

## Decision

Budget V2 must extend Actual's existing budget logic and storage model.

## Why

Running two representations of the budget would create drift, maintenance cost, and UI inconsistency.

## Consequence

All generated or assisted budget outputs must be applied through existing budget write paths.
