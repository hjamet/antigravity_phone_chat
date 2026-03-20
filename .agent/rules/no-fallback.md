---
trigger: always_on
description: "No Fallback Policy — Fail Fast with explicit errors on broken selectors"
---

# No Fallback Policy — Fail Fast

## Rule

**JAMAIS de fallback** dans les scripts CDP. Toute interaction avec le DOM doit être faite par **sélecteur ciblé unique**. Si le sélecteur ne trouve pas l'élément, le script doit **immédiatement lever une erreur explicite** indiquant :
1. Le sélecteur qui a échoué
2. La fonction dans laquelle l'erreur s'est produite
3. Un message clair pour le développeur (ex: "Selector broke — update required")

## Principles

- **No heuristic search**: Never search by keyword (innerText, aria-label, title) as a discovery mechanism. Use precise CSS selectors that target a specific DOM element.
- **No silent failure**: Never return empty arrays `[]`, `null`, or `false` when a selector fails. Always `throw new Error(...)` with a descriptive message.
- **No fallback chains**: Never write `if (!element) tryAlternative()`. If the primary selector is broken, fail immediately.
- **Explicit selectors**: Use `document.querySelector('#exact > .path > .to > element')` style selectors, not `Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('keyword'))`.
- **Centralized selectors**: All selectors must live in `src/config/selectors.js` so they are easy to update when Antigravity's DOM changes.

## Error Format

```javascript
const el = document.querySelector(SEL.workbench.managerButton);
if (!el) throw new Error(`[CDP] Selector broken: "${SEL.workbench.managerButton}" — element not found in ${functionName}(). Update src/config/selectors.js`);
```

## Why

Antigravity's DOM changes with updates. Silent failures make debugging impossible. Fail-fast with explicit messages means we see **immediately** which selector broke and where to fix it.
