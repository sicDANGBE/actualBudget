# Repo reading map

## But de ce document

Donner à l'agent une carte de lecture du fork d'Actual afin de limiter l'exploration inutile et d'éviter toute refonte accidentelle.

## Lecture obligatoire avant toute modification

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.github/agents/pr-and-commit-rules.md`
4. `CODE_REVIEW_GUIDELINES.md`

## Zones du repo à lire en priorité pour Budget V2

### Frontend principal

- `packages/desktop-client/src/pages/`
- `packages/desktop-client/src/components/`
- `packages/desktop-client/src/components/modals/`
- `packages/desktop-client/src/hooks/`

### Sujet budget

- `packages/desktop-client/src/components/budget/`
- pages et composants qui alimentent l'écran Budget
- hooks et stores liés au budget
- tous les composants de synthèse et modales budget déjà présentes

### Sujet import / transactions

- `packages/desktop-client/src/components/modals/ImportTransactionsModal/`
- composants de review d'import
- logique de catégorisation existante
- logique de rapprochement / pointage si déjà couplée au flux import

### Logique métier / core

- `packages/loot-core/src/server/budget/`
- `packages/loot-core/src/types/`
- logique liée aux catégories, groupes et montants budgétés
- fonctions de calcul déjà utilisées côté budget

## Règles de lecture

- Toujours localiser la feature existante avant de proposer un changement.
- Rechercher le point d'entrée UI avant de créer un nouveau composant.
- Rechercher les hooks, modales, actions et fonctions déjà utilisés dans les écrans voisins.
- Réutiliser les patterns existants avant toute abstraction nouvelle.

## Interdits

- Ne pas déplacer massivement les fichiers du repo.
- Ne pas inventer un nouveau moteur de budget.
- Ne pas créer un nouveau design system.
- Ne pas doubler la logique d'import déjà présente.
