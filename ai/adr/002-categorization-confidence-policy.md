# ADR 002 - Categorization confidence policy

## Decision

Transaction categorization suggestions use a deterministic confidence score in the first iteration.

## Why

This keeps the feature explainable, testable, and easy to integrate with the existing import flow.

## Consequence

High confidence can be preselected, but medium and low confidence still preserve user control.
